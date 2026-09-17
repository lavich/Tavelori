import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {basename, extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'yaml';
import {wordKey} from '../src/domain/import.ts';
import {ContentError, SCHEMA_VERSION, SHIPPED_FIELDS, type Catalog, type CatalogCourse, type CatalogEntry, type ContentPackage, type PackageMedia, type PackageWord} from '../src/content/schema.ts';
import type {Example, Lesson, Segment} from '../src/domain/types.ts';
import {checkArt, LEGACY_FILE, readLegacy, readThemes, type ArtReport} from './art.ts';

/**
 * Публикация контента. Исходники — YAML: одно слово — один файл в `words/` с греческим именем, урок —
 * упорядоченный список идентификаторов в `lessons/`, иллюстрации и аудио — отдельные файлы в `art/` и `audio/`.
 * Идентификатор слова — поле `id`, а без него — имя файла; у исходных слов сохранены прежние `w11-01`,
 * чтобы прогресс и миграция пользователей не зависели от переименования файлов.
 * Генератор собирает каталог, неизменяемые пакеты уроков и медиа; клиент исходники не читает.
 */
export const LANGUAGE='el';
export const ART_SOURCE='Собственная векторная иллюстрация Lexi (CC0)';
/** Медиа иллюстрации образуется от файла, а не от слова: слова с общей картинкой делят одну запись во всех языках и курсах. */
export const imageAssetId=(file:string)=>`img-${basename(file,extname(file))}`;
/** Имя файла иллюстрации — английское значение картинки латиницей в kebab-case: `money.svg`, `ride-bicycle.svg`. */
export const ART_NAME=/^[a-z0-9]+(-[a-z0-9]+)*\.[a-z0-9]+$/;
export const audioAssetId=(wordId:string)=>`snd-${wordId}`;
const MIME:Record<string,string>={'.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mp3':'audio/mpeg','.ogg':'audio/ogg','.m4a':'audio/mp4','.wav':'audio/wav'};

export interface WordSource {
 id?:string; greek:string; russian:string; ipa?:string; note?:string; verified?:boolean; source?:string;
 image?:string; audio?:string;
 reading?:{text:string;ipa:string;explanation:string}[];
 examples?:{greek:string;russian:string;target:string;source?:string}[];
}
export interface LessonSource {title:string;language?:string;status?:Lesson['status'];targetDate?:string|null;words:string[]}
export interface CourseSource {id?:string;title:string;source?:string;theme?:string;lessons:string[]}

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

export interface ContentRoot {words:Map<string,WordSource&{file:string}>;lessons:Map<string,LessonSource>;courses:Map<string,CourseSource&{file:string}>;files:Map<string,Uint8Array>}
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
 const courses=new Map<string,CourseSource&{file:string}>();
 for(const file of list('courses')){
  const doc=load<CourseSource>('courses',file);
  const id=String(doc.id??basename(file,extname(file))).normalize('NFC');
  const twin=courses.get(id);
  if(twin)fail(`courses/${file}: идентификатор «${id}» уже занят файлом courses/${twin.file}`);
  courses.set(id,{...doc,file});
 }
 const files=new Map<string,Uint8Array>();
 // Подпапки (art/parts/ с эталонами фигур) не читаются как файлы: медиа становятся только файлы, на которые ссылаются слова.
 for(const dir of ['art','audio']) if(existsSync(join(root,dir))) for(const file of readdirSync(join(root,dir))) if(statSync(join(root,dir,file)).isFile())files.set(`${dir}/${file}`,readFileSync(join(root,dir,file)));
 return {words,lessons,courses,files};
}

export interface BuiltFile {path:string;body:string|Uint8Array;mimeType:string}
export interface BuiltContent {catalog:Catalog;packages:ContentPackage[];files:BuiltFile[];words:PackageWord[];sources:ContentRoot;art:ArtReport}

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
  id,greek,russian,ipa:text(src.ipa,`${where}.ipa`,false)??'',segments,examples,verified:!!src.verified,
 };
 if(draft.ipa&&!/^\/.+\/$/.test(draft.ipa))fail(`${where}.ipa: транскрипция записывается между косыми чертами`);
 if(draft.verified&&!draft.ipa)fail(`${where}: проверенное слово должно иметь IPA`);
 const note=text(src.note,`${where}.note`,false); if(note)draft.note=note;
 if(source)draft.source=source;
 if(src.image)draft.imageAssetId=imageAssetId(text(src.image,`${where}.image`)!);
 if(src.audio)draft.audioAssetId=audioAssetId(id);
 return {...draft,revision:revisionOf(draft)};
}

function mediaFor(id:string,file:string,dir:'art'|'audio',files:Map<string,Uint8Array>,source:string|undefined,where:string,legacy:Set<string>,art:ArtReport):{item:PackageMedia;body:Uint8Array}{
 const body=files.get(`${dir}/${file}`);
 if(!body)fail(`${where}: файла ${dir}/${file} нет`);
 if(dir==='art'&&!ART_NAME.test(file))fail(`${where}: имя иллюстрации «${file}» — латиница строчными, цифры и дефисы, английское значение картинки (money.svg, ride-bicycle.svg)`);
 const ext=extname(file).toLowerCase();
 const mimeType=MIME[ext]??fail(`${where}: неизвестный тип файла ${file}`);
 // Иллюстрация подчиняется стандарту (docs/art-standard.md); файлы до стандарта из legacy.txt считаются в отчёте о миграции.
 if(dir==='art'&&mimeType==='image/svg+xml'){art.files++;if(checkArt(file,body!,legacy))art.legacy++}
 const version=hash(body!,10);
 return {body:body!,item:{
  id,kind:dir==='art'?'image':'audio',mimeType,url:`content/media/${id}@${version}${ext}`,bytes:body!.byteLength,version,
  // Подпись иллюстрации пуста: картинка не должна называть слово ни глазу, ни вспомогательным технологиям, а файл общий для слов и языков.
  required:true,alt:'',source:dir==='art'?ART_SOURCE:source??'',
 }};
}

/**
 * Одно и то же слово живёт в одном файле и получает один идентификатор во всех уроках.
 * Два файла с одинаковой парой «написание + перевод» — ошибка публикации, а не тихий дубликат.
 */
export function buildContent(root=defaultRoot()):BuiltContent{
 const sources=readSources(root);
 const themes=readThemes(root);
 const words=new Map<string,PackageWord>(); const byKey=new Map<string,string>();
 for(const [id,src] of sources.words){
  const word=describe(id,src);
  const key=wordKey(word.greek,word.russian);
  const twin=byKey.get(key);
  if(twin)fail(`words/${src.file} повторяет слово «${word.greek} — ${word.russian}» из words/${sources.words.get(twin)!.file}`);
  byKey.set(key,id); words.set(id,word);
 }
 /** Список унаследованных картинок только сокращается: имя без файла — мусор, а не исключение. */
 const legacy=readLegacy(sources.files); const art:ArtReport={files:0,legacy:0};
 for(const file of legacy) if(!sources.files.has(`art/${file}`))fail(`art/${LEGACY_FILE}: файла art/${file} нет — уберите имя из списка`);
 const media=new Map<string,{item:PackageMedia;body:Uint8Array}>();
 for(const [id,src] of sources.words){
  const word=words.get(id)!;
  // Общий файл двух слов — одна запись медиа и один файл в отчёте
  if(src.image&&!media.has(word.imageAssetId!))media.set(word.imageAssetId!,mediaFor(word.imageAssetId!,src.image,'art',sources.files,word.source,`words/${src.file}`,legacy,art));
  if(src.audio)media.set(word.audioAssetId!,mediaFor(word.audioAssetId!,src.audio,'audio',sources.files,word.source,`words/${src.file}`,legacy,art));
 }
 /** Общая картинка выражается ссылкой на один файл, поэтому побайтовая копия — ошибка, а не стиль. */
 const twins=new Map<string,string>();
 for(const [path,body] of sources.files) if(path.startsWith('art/')&&path.endsWith('.svg')){
  const digest=hash(body,40), twin=twins.get(digest);
  if(twin)fail(`${twin} и ${path} совпадают побайтно — оставьте один файл и сошлитесь на него из обоих слов`);
  twins.set(digest,path);
 }
 /** Урок принадлежит ровно одному курсу: без курса он потеряется в каталоге, в двух — попадёт в занятие дважды. */
 const courseOf=new Map<string,string>(); const courses:CatalogCourse[]=[];
 for(const [courseId,src] of sources.courses){
  const where=`courses/${src.file}`;
  const title=text(src.title,`${where}.title`)!;
  if(!Array.isArray(src.lessons)||!src.lessons.length)fail(`${where}: нужен непустой список lessons`);
  for(const lessonId of src.lessons){
   if(!sources.lessons.has(lessonId))fail(`${where}: урока ${lessonId} нет в lessons/`);
   const twin=courseOf.get(lessonId);
   if(twin)fail(`${where}: урок ${lessonId} уже входит в курс ${twin}`);
   courseOf.set(lessonId,courseId);
  }
  // Курс учат целиком, поэтому смешанные языки внутри него — ошибка, а не особенность набора.
  const languages=new Set(src.lessons.map(lessonId=>sources.lessons.get(lessonId)!.language??LANGUAGE));
  if(languages.size>1)fail(`${where}: уроки курса на разных языках — ${[...languages].sort().join(', ')}`);
  const course:CatalogCourse={id:courseId,title,language:[...languages][0]??LANGUAGE,lessonIds:[...src.lessons]};
  const source=text(src.source,`${where}.source`,false); if(source)course.source=source;
  const theme=text(src.theme,`${where}.theme`,false);
  if(theme){
   const palette=themes.get(theme);
   if(!palette)fail(`${where}: темы «${theme}» нет в art/themes/${theme}.json`);
   course.palette=palette;
  }
  courses.push(course);
 }

 const used=new Set<string>();
 const packages:ContentPackage[]=[]; const entries:CatalogEntry[]=[]; const files:BuiltFile[]=[];
 for(const [id,src] of sources.lessons){
  const where=`lessons/${id}.yaml`;
  const courseId=courseOf.get(id)??fail(`${where}: урок не входит ни в один курс`) as string;
  const title=text(src.title,`${where}.title`)!;
  if(!Array.isArray(src.words)||!src.words.length)fail(`${where}: нужен непустой список words`);
  if(new Set(src.words).size!==src.words.length)fail(`${where}: слово повторяется в списке`);
  const packWords=src.words.map(wordId=>words.get(wordId)??fail(`${where}: слова ${wordId} нет в words/`) as PackageWord);
  packWords.forEach(word=>used.add(word.id));
  const status=src.status??'upcoming';
  if(status!=='upcoming'&&status!=='completed')fail(`${where}.status: ожидается upcoming или completed`);
  const targetDate=src.targetDate?String(src.targetDate):null;
  if(targetDate&&!/^\d{4}-\d{2}-\d{2}$/.test(targetDate))fail(`${where}.targetDate: дата в формате ГГГГ-ММ-ДД`);
  // Слова с общей картинкой дают одну запись медиа на пакет
  const packMedia=[...new Set(packWords.flatMap(word=>[word.imageAssetId,word.audioAssetId]).filter((ref):ref is string=>!!ref))].map(ref=>media.get(ref)!.item);
  const draft:ContentPackage={
   schemaVersion:SCHEMA_VERSION,id,courseId,version:'',language:src.language??LANGUAGE,
   lesson:{title,status,targetDate},words:packWords,links:packWords.map((word,position)=>({wordId:word.id,position})),media:packMedia,
  };
  const version=hash(canonical({...draft,version:undefined}));
  const pack={...draft,version};
  const body=JSON.stringify(pack);
  const url=`content/packages/${id}@${version}.json`;
  packages.push(pack);
  files.push({path:url,body,mimeType:'application/json'});
  entries.push({
   id,courseId,language:pack.language,title,wordCount:packWords.length,version,url,bytes:Buffer.byteLength(body),status,targetDate,
   media:{count:packMedia.length,bytes:packMedia.reduce((sum,item)=>sum+item.bytes,0)},
  });
 }
 for(const id of words.keys()) if(!used.has(id))fail(`words/${sources.words.get(id)!.file} не входит ни в один урок и не будет опубликовано`);
 for(const {item,body} of media.values())files.push({path:item.url,body,mimeType:item.mimeType});
 const catalog:Catalog={schemaVersion:SCHEMA_VERSION,generatedAt:new Date().toISOString(),courses,lessons:entries};
 files.push({path:'content/catalog.json',body:JSON.stringify(catalog),mimeType:'application/json'});
 return {catalog,packages,files,words:[...words.values()],sources,art};
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
 console.log(`Иллюстрации: ${built.art.files}, вне палитры (art/${LEGACY_FILE}): ${built.art.legacy}`);
}
