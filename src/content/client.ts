import {db, indexWord, type LexiDatabase} from '../storage/db';
import {adoptStash} from '../sync/snapshot';
import {ContentError, parseCatalog, parsePackage, SHIPPED_FIELDS, type Catalog, type ContentPackage, type PackageWord, type ShippedField} from './schema';
import type {Asset, Course, InstalledPackage, Word} from '../domain/types';

export interface ContentFetcher {json(url:string):Promise<unknown>;blob(url:string):Promise<Blob>}

const offline=()=>typeof navigator!=='undefined'&&navigator.onLine===false;
const networkError=(what:string)=>new ContentError(offline()?`Нет сети: ${what} ещё не загружен на это устройство.`:`Не удалось загрузить ${what}. Проверьте соединение и повторите.`,'network');

export function httpFetcher(base:string=import.meta.env.BASE_URL):ContentFetcher{
 const resolve=(url:string)=>`${base.endsWith('/')?base:`${base}/`}${url}`;
 const load=async(url:string,what:string,init?:RequestInit)=>{
  let response:Response;
  try{response=await fetch(resolve(url),init)}
  catch{throw networkError(what)}
  if(!response.ok)throw new ContentError(`Сервер ответил ${response.status} на запрос «${url}».`,'network');
  return response;
 };
 return {
  json:async url=>(await load(url,url.endsWith('catalog.json')?'каталог уроков':'пакет урока',url.endsWith('catalog.json')?{cache:'no-cache'}:undefined)).json().catch(()=>{throw new ContentError('Файл контента повреждён: это не JSON.')}),
  blob:async url=>(await load(url,'файл медиа')).blob(),
 };
}
export let fetcher:ContentFetcher=httpFetcher();
export const useFetcher=(next:ContentFetcher)=>{fetcher=next};

export async function refreshCatalog(database:LexiDatabase=db,source:ContentFetcher=fetcher):Promise<Catalog>{
 const catalog=parseCatalog(await source.json('content/catalog.json'));
 await database.transaction('rw',database.catalog,database.courses,database.lessons,database.meta,async()=>{
  await database.catalog.clear();
  await database.catalog.bulkAdd(catalog.lessons);
  await adoptCourses(catalog,database);
  await database.meta.put({key:'catalogUpdatedAt',value:new Date().toISOString()});
 });
 return catalog;
}

/**
 * Каталог — единственное место, где известен курс урока, установленного прежней версией.
 * Шаг безвреден при повторе: он только дописывает недостающее и не трогает подписку, которую уже включили.
 */
async function adoptCourses(catalog:Catalog,database:LexiDatabase){
 const now=new Date().toISOString();
 const courseOf=new Map(catalog.lessons.map(entry=>[entry.id,entry.courseId]));
 for(const lesson of await database.lessons.toArray()){
  const courseId=courseOf.get(lesson.id);
  if(courseId&&!lesson.courseId)await database.lessons.put({...lesson,courseId});
 }
 for(const item of catalog.courses){
  const stored=await database.courses.get(item.id);
  const installed=await database.lessons.where('courseId').equals(item.id).count();
  const next:Course={
   id:item.id,title:item.title,origin:stored?.origin??'content',
   subscribed:stored?.subscribed||installed>0,
   createdAt:stored?.createdAt??now,updatedAt:stored?.updatedAt??now,
  };
  if(item.source)next.source=item.source;
  if(stored?.syncedAt)next.syncedAt=stored.syncedAt;
  if(!stored||stored.title!==next.title||stored.source!==next.source||stored.subscribed!==next.subscribed)
   await database.courses.put({...next,updatedAt:now});
 }
}

export interface Conflict {wordId:string;greek:string;fields:(ShippedField|'deleted')[]}
export interface InstallResult {status:'installed'|'updated'|'current';added:number;changed:number;conflicts:Conflict[]}

export type InstallPhase={phase:'idle'}|{phase:'loading'}|{phase:'error';message:string;kind:ContentError['kind']};
const IDLE:InstallPhase={phase:'idle'};
const phases=new Map<string,InstallPhase>();
const listeners=new Set<()=>void>();
const setPhase=(lessonId:string,phase:InstallPhase)=>{if(phase.phase==='idle')phases.delete(lessonId);else phases.set(lessonId,phase);listeners.forEach(fn=>fn())};
/** Снимок для useSyncExternalStore должен быть стабильным по ссылке, иначе React зациклится. */
export const installPhase=(lessonId:string):InstallPhase=>phases.get(lessonId)??IDLE;
export const subscribeInstall=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};

const inflight=new Map<string,Promise<InstallResult>>();
/** Ключ курса в общем хранилище состояний загрузки: идентификаторы курса и урока не пересекаются. */
const courseKey=(courseId:string)=>`course:${courseId}`;
export const coursePhase=(courseId:string)=>installPhase(courseKey(courseId));

export async function setCourseSubscription(courseId:string,subscribed:boolean,database:LexiDatabase=db):Promise<void>{
 const stored=await database.courses.get(courseId);
 if(!stored||stored.subscribed===subscribed)return;
 await database.courses.put({...stored,subscribed,updatedAt:new Date().toISOString()});
}

export interface CourseInstallResult {installed:number;updated:number;failed:number;conflicts:Conflict[]}

/**
 * Установка и обновление курса целиком. Уроки идут по одному: прерывание оставляет установленными
 * уже полученные, а ошибка не отменяет успешные — курс просто остаётся частично свежим.
 */
export async function installCourse(courseId:string,database:LexiDatabase=db,source:ContentFetcher=fetcher):Promise<CourseInstallResult>{
 await setCourseSubscription(courseId,true,database);
 const entries=await database.catalog.where('courseId').equals(courseId).toArray();
 const result:CourseInstallResult={installed:0,updated:0,failed:0,conflicts:[]};
 setPhase(courseKey(courseId),{phase:'loading'});
 let failure:ContentError|null=null;
 for(const entry of entries){
  try{
   const outcome=await installLesson(entry.id,database,source);
   if(outcome.status==='installed')result.installed++;
   if(outcome.status==='updated')result.updated++;
   result.conflicts.push(...outcome.conflicts);
  }catch(error){result.failed++;failure=toContentError(error)}
 }
 if(failure)setPhase(courseKey(courseId),{phase:'error',message:failure.message,kind:failure.kind});
 else{
  setPhase(courseKey(courseId),{phase:'idle'});
  const stored=await database.courses.get(courseId);
  if(stored)await database.courses.put({...stored,syncedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 }
 return result;
}

/** Фоновая догрузка подписанных курсов: вызывается после обновления каталога при запуске. */
export async function syncCourses(database:LexiDatabase=db,source:ContentFetcher=fetcher):Promise<void>{
 const subscribed=(await database.courses.toArray()).filter(course=>course.origin==='content'&&course.subscribed);
 for(const course of subscribed)await installCourse(course.id,database,source);
}

export function installLesson(lessonId:string,database:LexiDatabase=db,source:ContentFetcher=fetcher):Promise<InstallResult>{
 const running=inflight.get(lessonId);
 if(running)return running;
 const task=(async()=>{
  setPhase(lessonId,{phase:'loading'});
  try{
   const entry=await database.catalog.get(lessonId);
   if(!entry)throw new ContentError('Этого урока нет в каталоге.');
   const installed=await database.packages.get(lessonId);
   if(installed&&installed.version===entry.version)return {status:'current',added:0,changed:0,conflicts:[]} as InstallResult;
   const pack=parsePackage(await source.json(entry.url));
   if(pack.id!==lessonId||pack.version!==entry.version)throw new ContentError('Пакет не соответствует записи каталога.');
   const result=await applyPackage(pack,database);
   if(pack.courseId)await setCourseSubscription(pack.courseId,true,database);
   setPhase(lessonId,{phase:'idle'});
   return result;
  }catch(error){
   const wrapped=toContentError(error);
   setPhase(lessonId,{phase:'error',message:wrapped.message,kind:wrapped.kind});
   throw wrapped;
  }finally{inflight.delete(lessonId)}
 })();
 inflight.set(lessonId,task);
 return task;
}
export const toContentError=(error:unknown):ContentError=>{
 if(error instanceof ContentError)return error;
 const name=(error as {name?:string})?.name??'';
 if(/Quota/i.test(name)||/quota/i.test(String((error as Error)?.message)))return new ContentError('На устройстве недостаточно места: урок не сохранён, прежние данные не изменились.','storage');
 return new ContentError(error instanceof Error?error.message:'Не удалось установить урок.','storage');
};

const canonical=(value:unknown)=>JSON.stringify(value===undefined?null:value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const shipped=(word:PackageWord)=>Object.fromEntries(SHIPPED_FIELDS.filter(field=>word[field]!==undefined).map(field=>[field,word[field]])) as Pick<Word,ShippedField>;

/**
 * Слияние обновления: нетронутая запись берёт новые значения целиком; отредактированная — по полям,
 * если известна база установленной версии; без базы локальный вариант сохраняется, отличия сообщаются.
 */
export function mergeWord(local:Word,base:PackageWord|undefined,next:PackageWord):{word:Word;conflicts:ShippedField[]}{
 const conflicts:ShippedField[]=[];
 const word:Word={...local};
 for(const field of SHIPPED_FIELDS){
  const incoming=next[field];
  if(!local.edited){assign(word,field,incoming);continue}
  if(base){
   if(same(local[field],base[field]))assign(word,field,incoming);
   else if(!same(incoming,base[field])&&!same(incoming,local[field]))conflicts.push(field);
  }else if(!same(local[field],incoming))conflicts.push(field);
 }
 return {word,conflicts};
}
function assign(word:Word,field:ShippedField,value:unknown){
 const target=word as unknown as Record<string,unknown>;
 if(value===undefined)delete target[field]; else target[field]=value;
}

export async function applyPackage(pack:ContentPackage,database:LexiDatabase=db):Promise<InstallResult>{
 const now=new Date().toISOString();
 return database.transaction('rw',[database.words,database.lessons,database.lessonWords,database.packages,database.media,database.states,database.syncStash,database.meta],async()=>{
  const installed=await database.packages.get(pack.id);
  // Курс дописывается и на неизменной версии: у базы, пережившей переход на курсы, его ещё нет.
  const known=await database.lessons.get(pack.id);
  if(known&&!known.courseId&&pack.courseId)await database.lessons.put({...known,courseId:pack.courseId});
  if(installed&&installed.version===pack.version)return {status:'current',added:0,changed:0,conflicts:[]};
  const base=new Map((installed?.words??[]).map(word=>[word.id,word]));
  const result:InstallResult={status:installed?'updated':'installed',added:0,changed:0,conflicts:[]};
  if(!known)
   await database.lessons.add({id:pack.id,courseId:pack.courseId||undefined,title:pack.lesson.title,targetDate:pack.lesson.targetDate,status:pack.lesson.status,createdAt:now,updatedAt:now});
  for(const incoming of pack.words){
   const local=await database.words.get(incoming.id);
   if(!local){
    await database.words.add(indexWord({...shipped(incoming),id:incoming.id,createdAt:now,updatedAt:now,revision:incoming.revision}));
    result.added++;
    continue;
   }
   if(local.revision===incoming.revision)continue;
   if(local.deletedAt){
    if(!same(shipped(incoming),shipped(base.get(incoming.id)??{...incoming,...pickShipped(local)})))result.conflicts.push({wordId:local.id,greek:local.greek,fields:['deleted']});
    await database.words.update(local.id,{revision:incoming.revision});
    continue;
   }
   const merged=mergeWord(local,base.get(incoming.id),incoming);
   if(merged.conflicts.length)result.conflicts.push({wordId:local.id,greek:local.greek,fields:merged.conflicts});
   const changed=!same(pickShipped(merged.word),pickShipped(local));
   if(changed)result.changed++;
   await database.words.put(indexWord({...merged.word,revision:incoming.revision,updatedAt:changed?now:local.updatedAt}));
  }
  const removed=new Set(installed?.removed??[]);
  for(const link of pack.links) if(!removed.has(link.wordId))await database.lessonWords.put({lessonId:pack.id,wordId:link.wordId,position:link.position});
  await database.media.bulkPut(pack.media);
  const record:InstalledPackage={lessonId:pack.id,courseId:pack.courseId||undefined,version:pack.version,schemaVersion:pack.schemaVersion,installedAt:now,words:pack.words,media:pack.media,removed:[...removed]};
  await database.packages.put(record);
  // Полученный из облака прогресс слов этого пакета ждал установки: теперь он становится обычным состоянием.
  await adoptStash(database,pack.id,pack.words.map(word=>word.id));
  return result;
 });
}
const pickShipped=(word:Word)=>Object.fromEntries(SHIPPED_FIELDS.filter(field=>word[field]!==undefined).map(field=>[field,word[field]]));

const mediaInflight=new Map<string,Promise<Asset|null>>();
export function ensureAsset(id:string,database:LexiDatabase=db,source:ContentFetcher=fetcher):Promise<Asset|null>{
 const running=mediaInflight.get(id);
 if(running)return running;
 const task=(async()=>{
  try{
   const stored=await database.assets.get(id);
   if(stored)return stored;
   const ref=await database.media.get(id);
   if(!ref)return null;
   const blob=await source.blob(ref.url);
   if(blob.size!==ref.bytes)throw new ContentError(`Файл ${ref.url} повреждён: размер не совпадает.`);
   if(ref.mimeType==='image/svg+xml'&&!(await blob.text()).includes('<svg'))throw new ContentError(`Файл ${ref.url} повреждён: это не SVG.`);
   const asset:Asset={id,kind:ref.kind,blob:new Blob([blob],{type:ref.mimeType}),mimeType:ref.mimeType,source:ref.source,alt:ref.alt};
   await database.assets.put(asset);
   return asset;
  }finally{mediaInflight.delete(id)}
 })();
 mediaInflight.set(id,task);
 return task;
}

export interface Readiness {installed:boolean;version:string|null;updateAvailable:boolean;required:number;present:number;missing:string[]}
export async function lessonReadiness(lessonId:string,database:LexiDatabase=db):Promise<Readiness>{
 const [pack,entry]=await Promise.all([database.packages.get(lessonId),database.catalog.get(lessonId)]);
 if(!pack)return {installed:false,version:null,updateAvailable:false,required:0,present:0,missing:[]};
 const required=pack.media.filter(item=>item.required);
 const present=await database.assets.where('id').anyOf(required.map(item=>item.id)).primaryKeys();
 const have=new Set(present);
 return {
  installed:true,version:pack.version,updateAvailable:!!entry&&entry.version!==pack.version,
  required:required.length,present:present.length,missing:required.filter(item=>!have.has(item.id)).map(item=>item.id),
 };
}
export async function downloadLessonMedia(lessonId:string,database:LexiDatabase=db,source:ContentFetcher=fetcher):Promise<{fetched:number;failed:string[]}>{
 const readiness=await lessonReadiness(lessonId,database);
 let fetched=0; const failed:string[]=[];
 for(const id of readiness.missing){
  try{if(await ensureAsset(id,database,source))fetched++;else failed.push(id)}
  catch(error){if(toContentError(error).kind==='storage')throw toContentError(error);failed.push(id)}
 }
 return {fetched,failed};
}
