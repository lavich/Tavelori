import type {LexiDatabase} from '../../src/storage/db';
import type {ContentFetcher} from '../../src/content/client';
import {installLesson, refreshCatalog} from '../../src/content/client';
import {buildContent, type BuiltContent} from '../../content/build';

/** Один собранный контент на весь прогон: пакеты неизменяемы, а сборка стоит дороже теста. */
export const content:BuiltContent=buildContent();

/** Источник контента в памяти: тесты устанавливают пакеты без сети и подменяют файлы для сценариев ошибок. */
export function memoryFetcher(built:BuiltContent=content,overrides:Record<string,unknown|Blob>={}):ContentFetcher&{requests:string[]}{
 const files=new Map(built.files.map(file=>[file.path,file]));
 const requests:string[]=[];
 const body=(url:string)=>{
  requests.push(url);
  if(url in overrides)return overrides[url];
  const file=files.get(url);
  if(!file)throw Object.assign(new Error(`404 ${url}`),{name:'NotFound'});
  return file.body;
 };
 return {
  requests,
  json:async url=>{const raw=body(url);return typeof raw==='string'?JSON.parse(raw):raw},
  blob:async url=>{const raw=body(url);return raw instanceof Blob?raw:new Blob([raw as BlobPart],{type:files.get(url)?.mimeType})},
 };
}
/** Каталог плюс установка перечисленных уроков — замена старого `ensureSeed()` в тестах. */
export async function installLessons(db:LexiDatabase,ids:string[],fetcher=memoryFetcher()){
 await refreshCatalog(db,fetcher);
 for(const id of ids)await installLesson(id,db,fetcher);
 return fetcher;
}
export const packageOf=(id:string)=>content.packages.find(pack=>pack.id===id)!;
export const wordsOf=(id:string)=>{const pack=packageOf(id);return pack.links.map(link=>pack.words.find(word=>word.id===link.wordId)!)};
