import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {basename, extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'yaml';
import {wordKey} from '../src/domain/import.ts';
import {ContentError, SCHEMA_VERSION, SHIPPED_FIELDS, type Catalog, type CatalogEntry, type ContentPackage, type PackageMedia, type PackageWord} from '../src/content/schema.ts';
import type {Example, Lesson, Segment} from '../src/domain/types.ts';

/**
 * Публикация контента. Исходники — YAML: одно слово — один файл в `words/` с греческим именем, урок —
 * упорядоченный список идентификаторов в `lessons/`, иллюстрации и аудио — отдельные файлы в `art/` и `audio/`.
 * Идентификатор слова — поле `id`, а без него — имя файла; у исходных слов сохранены прежние `w11-01`,
 * чтобы прогресс и миграция пользователей не зависели от переименования файлов.
 * Генератор собирает каталог, неизменяемые пакеты уроков и медиа; клиент исходники не читает.
 */
export const LANGUAGE='el';
export const ART_SOURCE='Собственная векторная иллюстрация Lexi (CC0)';
export const imageAssetId=(wordId:string)=>`img-${wordId}`;
export const audioAssetId=(wordId:string)=>`snd-${wordId}`;
const MIME:Record<string,string>={'.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mp3':'audio/mpeg','.ogg':'audio/ogg','.m4a':'audio/mp4','.wav':'audio/wav'};

export interface WordSource {
 id?:string; greek:string; russian:string; ipa?:string; note?:string; verified?:boolean; mastered?:boolean; source?:string;
 image?:string; audio?:string;
 reading?:{text:string;ipa:string;explanation:string}[];
 examples?:{greek:string;russian:string;target:string;source?:string}[];
}
export interface LessonSource {title:string;language?:string;status?:Lesson['status'];targetDate?:string|null;words:string[]}

const hash=(value:string|Uint8Array,length=12)=>createHash('sha256').update(value).digest('hex').slice(0,length);
/** Ключи в фиксированном порядке: одинаковое содержимое даёт одинаковую ревизию. */
const canonical=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const revisionOf=(word:Omit<PackageWord,'revision'>)=>hash(canonical(Object.fromEntries(SHIPPED_FIELDS.map(field=>[field,word[field]]))));

const fail=(message:string)=>{throw new ContentError(message)};
const text=(value:unknown,where:string,required=true):string|undefined=>{
 if(value===undefined||value===null){if(required)fail(`${where}: поле обязательно`);return undefined}
 if(typeof value!=='string')fail(`${where}: ожидалась строка`);
 return (value as string).normalize('NFC');
};

export interface ContentRoot {words:Map<string,WordSource&{file:string}>;lessons:Map<string,LessonSource>;files:Map<string,Uint8Array>}
export function readSources(root:string):ContentRoot{
 const list=(dir:string)=>(existsSync(join(root,dir))?readdirSync(join(root,dir)):[]).filter(file=>/\.ya?ml$/.test(file)).sort();
 const load=<T,>(dir:string,file:string)=>parse(readFileSync(join(root,dir,file),'utf8')) as T;
 const words=new Map<string,WordSource&{file:string}>();
 for(const file of list('words')){
  const doc=load<WordSource>('words',file);
  const id=String(doc.id??basename(file,extname(file))).normalize('NFC');
  const twin=words.get(id);
  if(twin)fail(`words/${file}: идентификатор «${id}» уже занят файлом words/${twin.file}`);
  words.set(id,{...doc,file});
 }
 const lessons=new Map(list('lessons').map(file=>[basename(file,extname(file)),load<LessonSource>('lessons',file)]));
 const files=new Map<string,Uint8Array>();
 for(const dir of ['art','audio']) if(existsSync(join(root,dir))) for(const file of readdirSync(join(root,dir)))files.set(`${dir}/${file}`,readFileSync(join(root,dir,file)));
 return {words,lessons,files};
}

export interface BuiltFile {path:string;body:string|Uint8Array;mimeType:string}
export interface BuiltContent {catalog:Catalog;packages:ContentPackage[];files:BuiltFile[];words:PackageWord[];sources:ContentRoot}

function describe(id:string,src:WordSource&{file:string}):PackageWord{
 const where=`words/${src.file}`;
 if(!/^[\p{L}\p{N}][\p{L}\p{N}-]*$/u.test(id))fail(`${where}: идентификатор «${id}» — буквы, цифры и дефис без пробелов`);
 const greek=text(src.greek,`${where}.greek`)!, russian=text(src.russian,`${where}.russian`)!;
 if(!/[Ͱ-Ͽἀ-῿]/u.test(greek))fail(`${where}: в греческом написании нет греческих букв`);
 const segments=(src.reading??[]).map((note,index):Segment=>{
  const path=`${where}.reading[${index}]`;
  const segment={text:text(note.text,`${path}.text`)!,ipa:text(note.ipa,`${path}.ipa`)!,explanation:text(note.explanation,`${path}.explanation`)!,start:greek.indexOf(note.text.normalize('NFC'))};
  if(segment.start<0)fail(`${path}: сочетание «${segment.text}» не найдено в слове «${greek}»`);
  return segment;
 });
 const source=text(src.source,`${where}.source`,false);
 const examples=(src.examples??[]).map((example,index):Example=>{
  const path=`${where}.examples[${index}]`;
  const built:Example={greek:text(example.greek,`${path}.greek`)!,russian:text(example.russian,`${path}.russian`)!,target:text(example.target,`${path}.target`)!};
  if(!built.greek.includes(built.target))fail(`${path}: форма «${built.target}» не встречается в предложении`);
  const exampleSource=text(example.source,`${path}.source`,false)??source;
  if(exampleSource)built.source=exampleSource;
  return built;
 });
 const draft:Omit<PackageWord,'revision'>={
  id,greek,russian,ipa:text(src.ipa,`${where}.ipa`,false)??'',segments,examples,
  sourceMastered:!!src.mastered,verified:!!src.verified,
 };
 if(draft.ipa&&!/^\/.+\/$/.test(draft.ipa))fail(`${where}.ipa: транскрипция записывается между косыми чертами`);
 if(draft.verified&&!draft.ipa)fail(`${where}: проверенное слово должно иметь IPA`);
 const note=text(src.note,`${where}.note`,false); if(note)draft.note=note;
 if(source)draft.source=source;
 if(src.image)draft.imageAssetId=imageAssetId(id);
 if(src.audio)draft.audioAssetId=audioAssetId(id);
 return {...draft,revision:revisionOf(draft)};
}

function mediaFor(id:string,file:string,dir:'art'|'audio',files:Map<string,Uint8Array>,word:PackageWord,where:string):{item:PackageMedia;body:Uint8Array}{
 const body=files.get(`${dir}/${file}`);
 if(!body)fail(`${where}: файла ${dir}/${file} нет`);
 const ext=extname(file).toLowerCase();
 const mimeType=MIME[ext]??fail(`${where}: неизвестный тип файла ${file}`);
 if(dir==='art'&&mimeType==='image/svg+xml'&&/<text[\s>]/.test(Buffer.from(body!).toString('utf8')))fail(`art/${file}: подпись в картинке выдаёт ответ`);
 const version=hash(body!,10);
 return {body:body!,item:{
  id,kind:dir==='art'?'image':'audio',mimeType,url:`content/media/${id}@${version}${ext}`,bytes:body!.byteLength,version,
  required:true,alt:dir==='art'?`Иллюстрация к слову «${word.russian}»`:'',source:dir==='art'?ART_SOURCE:word.source??'',
 }};
}

/**
 * Одно и то же слово живёт в одном файле и получает один идентификатор во всех уроках.
 * Два файла с одинаковой парой «написание + перевод» — ошибка публикации, а не тихий дубликат.
 */
export function buildContent(root=defaultRoot()):BuiltContent{
 const sources=readSources(root);
 const words=new Map<string,PackageWord>(); const byKey=new Map<string,string>();
 for(const [id,src] of sources.words){
  const word=describe(id,src);
  const key=wordKey(word.greek,word.russian);
  const twin=byKey.get(key);
  if(twin)fail(`words/${src.file} повторяет слово «${word.greek} — ${word.russian}» из words/${sources.words.get(twin)!.file}`);
  byKey.set(key,id); words.set(id,word);
 }
 const media=new Map<string,{item:PackageMedia;body:Uint8Array}>();
 for(const [id,src] of sources.words){
  const word=words.get(id)!;
  if(src.image)media.set(word.imageAssetId!,mediaFor(word.imageAssetId!,src.image,'art',sources.files,word,`words/${src.file}`));
  if(src.audio)media.set(word.audioAssetId!,mediaFor(word.audioAssetId!,src.audio,'audio',sources.files,word,`words/${src.file}`));
 }
 const used=new Set<string>();
 const packages:ContentPackage[]=[]; const entries:CatalogEntry[]=[]; const files:BuiltFile[]=[];
 for(const [id,src] of sources.lessons){
  const where=`lessons/${id}.yaml`;
  const title=text(src.title,`${where}.title`)!;
  if(!Array.isArray(src.words)||!src.words.length)fail(`${where}: нужен непустой список words`);
  if(new Set(src.words).size!==src.words.length)fail(`${where}: слово повторяется в списке`);
  const packWords=src.words.map(wordId=>words.get(wordId)??fail(`${where}: слова ${wordId} нет в words/`) as PackageWord);
  packWords.forEach(word=>used.add(word.id));
  const status=src.status??'upcoming';
  if(status!=='upcoming'&&status!=='completed')fail(`${where}.status: ожидается upcoming или completed`);
  const targetDate=src.targetDate?String(src.targetDate):null;
  if(targetDate&&!/^\d{4}-\d{2}-\d{2}$/.test(targetDate))fail(`${where}.targetDate: дата в формате ГГГГ-ММ-ДД`);
  const packMedia=packWords.flatMap(word=>[word.imageAssetId,word.audioAssetId]).filter((ref):ref is string=>!!ref).map(ref=>media.get(ref)!.item);
  const draft:ContentPackage={
   schemaVersion:SCHEMA_VERSION,id,version:'',language:src.language??LANGUAGE,
   lesson:{title,status,targetDate},words:packWords,links:packWords.map((word,position)=>({wordId:word.id,position})),media:packMedia,
  };
  const version=hash(canonical({...draft,version:undefined}));
  const pack={...draft,version};
  const body=JSON.stringify(pack);
  const url=`content/packages/${id}@${version}.json`;
  packages.push(pack);
  files.push({path:url,body,mimeType:'application/json'});
  entries.push({
   id,language:pack.language,title,wordCount:packWords.length,version,url,bytes:Buffer.byteLength(body),status,targetDate,
   media:{count:packMedia.length,bytes:packMedia.reduce((sum,item)=>sum+item.bytes,0)},
  });
 }
 for(const id of words.keys()) if(!used.has(id))fail(`words/${sources.words.get(id)!.file} не входит ни в один урок и не будет опубликовано`);
 for(const {item,body} of media.values())files.push({path:item.url,body,mimeType:item.mimeType});
 const catalog:Catalog={schemaVersion:SCHEMA_VERSION,generatedAt:new Date().toISOString(),lessons:entries};
 files.push({path:'content/catalog.json',body:JSON.stringify(catalog),mimeType:'application/json'});
 return {catalog,packages,files,words:[...words.values()],sources};
}

export const wordsOf=(content:BuiltContent,lessonId:string)=>{
 const pack=content.packages.find(p=>p.id===lessonId);
 return pack?pack.links.map(link=>pack.words.find(word=>word.id===link.wordId)!):[];
};
export const defaultRoot=()=>fileURLToPath(new URL('.',import.meta.url));

/** Папка очищается целиком: она не хранится в репозитории и собирается перед каждой сборкой. */
export function writeContent(publicDir='public',root=defaultRoot()){
 const content=buildContent(root);
 rmSync(join(publicDir,'content'),{recursive:true,force:true});
 for(const file of content.files){
  const target=join(publicDir,file.path);
  mkdirSync(join(target,'..'),{recursive:true});
  writeFileSync(target,file.body);
 }
 return content;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const built=writeContent();
 console.log(`Контент: ${built.packages.length} пакетов, ${built.words.length} слов, ${built.files.length} файлов → public/content`);
}
