import type {Example, Lesson, Segment} from '../domain/types';

/**
 * Контракт поставляемого контента. Каталог — только метаданные; пакет — урок целиком.
 * Пакеты неизменяемы: версия входит в URL, поэтому старые адреса продолжают работать.
 */
export const SCHEMA_VERSION=1;

export interface CatalogCourse {id:string;title:string;language:string;source?:string;lessonIds:string[];palette?:Record<string,string>}
export interface CatalogEntry {
 id:string; courseId:string; language:string; title:string; wordCount:number;
 version:string; url:string; bytes:number;
 status:Lesson['status']; targetDate:string|null;
 media:{count:number;bytes:number};
}
export interface Catalog {schemaVersion:typeof SCHEMA_VERSION;generatedAt:string;courses:CatalogCourse[];lessons:CatalogEntry[]}

export interface PackageWord {
 id:string; greek:string; russian:string; ipa:string; note?:string;
 segments:Segment[]; examples:Example[];
 imageAssetId?:string; audioAssetId?:string;
 verified:boolean; source?:string;
 revision:string;
}
export interface PackageLink {wordId:string;position:number}
export interface PackageMedia {
 id:string; kind:'image'|'audio'; mimeType:string; url:string; bytes:number; version:string;
 required:boolean; alt:string; source:string;
}
export interface ContentPackage {
 schemaVersion:typeof SCHEMA_VERSION; id:string; courseId:string; version:string; language:string;
 lesson:{title:string;status:Lesson['status'];targetDate:string|null};
 words:PackageWord[]; links:PackageLink[]; media:PackageMedia[];
}

export type ContentErrorKind='schema'|'unsupported'|'network'|'storage';
export class ContentError extends Error {
 readonly kind:ContentErrorKind;
 constructor(message:string,kind:ContentErrorKind='schema'){super(message);this.kind=kind}
}

const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const str=(value:unknown,path:string):string=>{if(typeof value!=='string')throw new ContentError(`${path}: ожидалась строка`);return value};
const num=(value:unknown,path:string):number=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new ContentError(`${path}: ожидалось число`);return value};
const bool=(value:unknown,path:string):boolean=>{if(typeof value!=='boolean')throw new ContentError(`${path}: ожидалось да/нет`);return value};
const opt=<T,>(value:unknown,read:(v:unknown)=>T):T|undefined=>value===undefined||value===null?undefined:read(value);
const list=(value:unknown,path:string):unknown[]=>{if(!Array.isArray(value))throw new ContentError(`${path}: ожидался список`);return value};
const obj=(value:unknown,path:string):Record<string,unknown>=>{if(!isRecord(value))throw new ContentError(`${path}: ожидался объект`);return value};
const status=(value:unknown,path:string):Lesson['status']=>{if(value!=='upcoming'&&value!=='completed')throw new ContentError(`${path}: неизвестный статус урока`);return value};
const nullableDay=(value:unknown,path:string):string|null=>{
 if(value===null)return null;
 const day=str(value,path);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new ContentError(`${path}: дата должна быть в формате ГГГГ-ММ-ДД`);
 return day;
};
const relativeUrl=(value:unknown,path:string):string=>{
 const url=str(value,path);
 if(!url||url.startsWith('/')||url.includes('..')||/^[a-z]+:/i.test(url))throw new ContentError(`${path}: ссылка должна быть относительной`);
 return url;
};
const unique=(ids:string[],path:string)=>{if(new Set(ids).size!==ids.length)throw new ContentError(`${path}: идентификаторы повторяются`)};

function checkSchemaVersion(raw:Record<string,unknown>,what:string){
 if(raw.schemaVersion!==SCHEMA_VERSION)throw new ContentError(`${what} версии схемы ${String(raw.schemaVersion)} не поддерживается этой версией приложения`,'unsupported');
}

export function parseCatalog(input:unknown):Catalog{
 const raw=obj(input,'каталог');
 checkSchemaVersion(raw,'Каталог');
 const lessons=list(raw.lessons,'каталог.lessons').map((entry,index):CatalogEntry=>{
  const path=`каталог.lessons[${index}]`;
  const item=obj(entry,path);
  const media=obj(item.media??{count:0,bytes:0},`${path}.media`);
  return {
   id:str(item.id,`${path}.id`),courseId:str(item.courseId??'',`${path}.courseId`),language:str(item.language,`${path}.language`),title:str(item.title,`${path}.title`),
   wordCount:num(item.wordCount,`${path}.wordCount`),version:str(item.version,`${path}.version`),
   url:relativeUrl(item.url,`${path}.url`),bytes:num(item.bytes,`${path}.bytes`),
   status:status(item.status,`${path}.status`),targetDate:nullableDay(item.targetDate,`${path}.targetDate`),
   media:{count:num(media.count,`${path}.media.count`),bytes:num(media.bytes,`${path}.media.bytes`)},
  };
 });
 unique(lessons.map(l=>l.id),'каталог.lessons');
 const courses=list(raw.courses??[],'каталог.courses').map((entry,index):CatalogCourse=>{
  const path=`каталог.courses[${index}]`;
  const item=obj(entry,path);
  const course:CatalogCourse={
   id:str(item.id,`${path}.id`),title:str(item.title,`${path}.title`),language:str(item.language??'',`${path}.language`),
   lessonIds:list(item.lessonIds??[],`${path}.lessonIds`).map((value,i)=>str(value,`${path}.lessonIds[${i}]`)),
  };
  const source=opt(item.source,value=>str(value,`${path}.source`)); if(source)course.source=source;
  const palette=opt(item.palette,value=>obj(value,`${path}.palette`));
  if(palette){
   course.palette={};
   for(const [from,value] of Object.entries(palette)){
    if(!/^#[0-9a-f]{6}$/.test(from))throw new ContentError(`${path}.palette: ключ цвета должен иметь вид #rrggbb`);
    const to=str(value,`${path}.palette.${from}`);
    if(!/^#[0-9a-f]{6}$/.test(to))throw new ContentError(`${path}.palette.${from}: цвет должен иметь вид #rrggbb`);
    course.palette[from]=to;
   }
  }
  return course;
 });
 unique(courses.map(course=>course.id),'каталог.courses');
 return {schemaVersion:SCHEMA_VERSION,generatedAt:str(raw.generatedAt,'каталог.generatedAt'),courses,lessons};
}

function parseWord(input:unknown,path:string):PackageWord{
 const raw=obj(input,path);
 const segments=list(raw.segments??[],`${path}.segments`).map((entry,i):Segment=>{
  const seg=obj(entry,`${path}.segments[${i}]`);
  return {text:str(seg.text,`${path}.segments[${i}].text`),ipa:str(seg.ipa,`${path}.segments[${i}].ipa`),explanation:str(seg.explanation,`${path}.segments[${i}].explanation`),start:num(seg.start,`${path}.segments[${i}].start`)};
 });
 const examples=list(raw.examples??[],`${path}.examples`).map((entry,i):Example=>{
  const ex=obj(entry,`${path}.examples[${i}]`);
  return {greek:str(ex.greek,`${path}.examples[${i}].greek`),russian:str(ex.russian,`${path}.examples[${i}].russian`),target:str(ex.target,`${path}.examples[${i}].target`),source:opt(ex.source,v=>str(v,`${path}.examples[${i}].source`))};
 });
 const word:PackageWord={
  id:str(raw.id,`${path}.id`),greek:str(raw.greek,`${path}.greek`),russian:str(raw.russian,`${path}.russian`),ipa:str(raw.ipa??'',`${path}.ipa`),
  segments,examples,verified:bool(raw.verified??false,`${path}.verified`),
  revision:str(raw.revision,`${path}.revision`),
 };
 const note=opt(raw.note,v=>str(v,`${path}.note`)); if(note)word.note=note;
 const source=opt(raw.source,v=>str(v,`${path}.source`)); if(source)word.source=source;
 const image=opt(raw.imageAssetId,v=>str(v,`${path}.imageAssetId`)); if(image)word.imageAssetId=image;
 const audio=opt(raw.audioAssetId,v=>str(v,`${path}.audioAssetId`)); if(audio)word.audioAssetId=audio;
 if(!word.greek.trim()||!word.russian.trim())throw new ContentError(`${path}: у слова нет написания или перевода`);
 return word;
}

export function parsePackage(input:unknown):ContentPackage{
 const raw=obj(input,'пакет');
 checkSchemaVersion(raw,'Пакет');
 const lessonRaw=obj(raw.lesson,'пакет.lesson');
 const words=list(raw.words,'пакет.words').map((entry,i)=>parseWord(entry,`пакет.words[${i}]`));
 unique(words.map(w=>w.id),'пакет.words');
 const known=new Set(words.map(w=>w.id));
 const links=list(raw.links,'пакет.links').map((entry,i):PackageLink=>{
  const link=obj(entry,`пакет.links[${i}]`);
  const wordId=str(link.wordId,`пакет.links[${i}].wordId`);
  if(!known.has(wordId))throw new ContentError(`пакет.links[${i}]: связь указывает на слово ${wordId}, которого нет в пакете`);
  return {wordId,position:num(link.position,`пакет.links[${i}].position`)};
 });
 unique(links.map(l=>l.wordId),'пакет.links');
 unique(links.map(l=>String(l.position)),'пакет.links.position');
 const media=list(raw.media??[],'пакет.media').map((entry,i):PackageMedia=>{
  const path=`пакет.media[${i}]`;
  const item=obj(entry,path);
  const kind=item.kind;
  if(kind!=='image'&&kind!=='audio')throw new ContentError(`${path}.kind: неизвестный тип медиа`);
  return {
   id:str(item.id,`${path}.id`),kind,mimeType:str(item.mimeType,`${path}.mimeType`),url:relativeUrl(item.url,`${path}.url`),
   bytes:num(item.bytes,`${path}.bytes`),version:str(item.version,`${path}.version`),required:bool(item.required??false,`${path}.required`),
   alt:str(item.alt??'',`${path}.alt`),source:str(item.source??'',`${path}.source`),
  };
 });
 unique(media.map(m=>m.id),'пакет.media');
 const mediaIds=new Set(media.map(m=>m.id));
 for(const word of words) for(const ref of [word.imageAssetId,word.audioAssetId]) if(ref&&!mediaIds.has(ref))throw new ContentError(`пакет.words: слово ${word.id} ссылается на медиа ${ref}, которого нет в пакете`);
 return {
  schemaVersion:SCHEMA_VERSION,id:str(raw.id,'пакет.id'),courseId:str(raw.courseId??'','пакет.courseId'),version:str(raw.version,'пакет.version'),language:str(raw.language,'пакет.language'),
  lesson:{title:str(lessonRaw.title,'пакет.lesson.title'),status:status(lessonRaw.status,'пакет.lesson.status'),targetDate:nullableDay(lessonRaw.targetDate,'пакет.lesson.targetDate')},
  words,links:[...links].sort((a,b)=>a.position-b.position),media,
 };
}

/** Поля слова, которые поставляет пакет; остальное принадлежит пользователю. */
export const SHIPPED_FIELDS=['greek','russian','ipa','note','segments','examples','imageAssetId','audioAssetId','verified','source'] as const;
export type ShippedField=typeof SHIPPED_FIELDS[number];
