import Dexie from 'dexie';
import {exportDB, importInto} from 'dexie-export-import';
import {LexiDatabase, db, LEGACY_TABLES, migrateLegacy, TABLES} from '../../storage/db';
import {fillSettings, type LessonWord, type Settings} from '../../domain/types';

/** Версия формата копии совпадает с версией схемы; копии первой версии читаются через миграцию. */
export const APP_MARKER='lexi:2';
const KNOWN_MARKERS=['lexi:1',APP_MARKER];
const SCHEMA_VERSION=2;
export interface BackupReport {databaseName:string;tables:{name:string;rows:number}[];createdAt:string|null;bytes:number;legacy:boolean}

/** Полная копия читает все таблицы напрямую, без реактивной подписки экранов; каталог — кеш и в копию не входит. */
export async function exportFull(database:LexiDatabase=db):Promise<Blob>{
 await database.meta.put({key:'app',value:APP_MARKER});
 await database.meta.put({key:'exportedAt',value:new Date().toISOString()});
 return exportDB(database,{prettyJson:false,filter:table=>table!=='catalog'});
}
export function download(blob:Blob,name:string){
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=url; link.download=name; link.click();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}
export const backupName=(now=new Date())=>`lexi-backup-${now.toISOString().slice(0,10)}.json`;

/** TSV собирается потоком по таблице слов, а не из снимка приложения. */
export async function exportWordsTsv(database:LexiDatabase=db):Promise<Blob>{
 const rows:string[]=['Греческий\tРусский\tIPA'];
 await database.words.orderBy('[sortKey+id]').each(word=>{
  if(!word.deletedAt)rows.push([word.greek,word.russian,word.ipa].map(cell=>cell.replace(/[\t\r\n]/g,' ')).join('\t'));
 });
 return new Blob([rows.join('\n')],{type:'text/tab-separated-values'});
}

export async function inspectBackup(file:Blob):Promise<{ok:true;report:BackupReport}|{ok:false;message:string}>{
 let parsed:any;
 try{parsed=JSON.parse(await file.text())}
 catch{return {ok:false,message:'Файл не читается как копия Lexi — возможно, он повреждён.'}}
 if(parsed?.formatName!=='dexie'||!parsed?.data?.tables)return {ok:false,message:'Это не файл полной копии Lexi.'};
 const info=parsed.data;
 if(info.databaseName!=='lexi')return {ok:false,message:`Копия сделана другим приложением (база «${info.databaseName}»).`};
 const version=Number(info.databaseVersion);
 if(version>SCHEMA_VERSION)return {ok:false,message:`Копия сделана более новой версией Lexi (схема ${info.databaseVersion}). Обновите приложение.`};
 const legacy=version<SCHEMA_VERSION;
 const names=info.tables.map((table:{name:string})=>table.name);
 const missing=(legacy?LEGACY_TABLES:TABLES).filter(table=>!names.includes(table));
 if(missing.length)return {ok:false,message:`В копии нет обязательных таблиц: ${missing.join(', ')}.`};
 const meta=(info.data??[]).find((entry:{tableName:string})=>entry.tableName==='meta');
 const marker=(meta?.rows??[]).find((row:{key:string})=>row.key==='app');
 if(marker&&!KNOWN_MARKERS.includes(marker.value))return {ok:false,message:`Неизвестная версия формата копии: ${marker.value}.`};
 const exportedAt=(meta?.rows??[]).find((row:{key:string})=>row.key==='exportedAt')?.value??null;
 return {ok:true,report:{
  databaseName:info.databaseName,
  tables:info.tables.map((table:{name:string;rowCount:number})=>({name:table.name,rows:table.rowCount})),
  createdAt:exportedAt,
  bytes:file.size,
  legacy,
 }};
}

/**
 * Копия сначала разворачивается в отдельной базе, мигрируется по тем же правилам, что и локальная схема,
 * и проверяется на целостность; только затем одной транзакцией заменяет данные.
 */
export async function restoreBackup(file:Blob,database:LexiDatabase=db):Promise<void>{
 const check=await inspectBackup(file);
 if(!check.ok)throw new Error(check.message);
 const staging=new LexiDatabase('lexi-restore');
 await staging.delete();
 await staging.open();
 try{
  await importInto(staging,file,{acceptNameDiff:true,acceptVersionDiff:true,clearTablesBeforeImport:true,overwriteValues:true});
  await staging.transaction('rw',TABLES.map(name=>staging.table(name)),()=>migrateLegacy(staging));
  const payload=await Promise.all(TABLES.map(async name=>[name,await staging.table(name).toArray()] as const));
  const rows=<T,>(name:typeof TABLES[number])=>payload.find(([table])=>table===name)![1] as T[];
  if(!rows('words').length)throw new Error('В копии нет ни одного слова — восстановление отменено.');
  const wordIds=new Set(rows<{id:string}>('words').map(word=>word.id)), lessonIds=new Set(rows<{id:string}>('lessons').map(lesson=>lesson.id));
  const broken=rows<LessonWord>('lessonWords').find(link=>!wordIds.has(link.wordId)||!lessonIds.has(link.lessonId));
  if(broken)throw new Error(`Копия повреждена: связь урока ${broken.lessonId} указывает на несуществующую запись.`);
  await database.transaction('rw',TABLES.map(name=>database.table(name)),async()=>{
   for(const [name,items] of payload){
    await database.table(name).clear();
    await database.table(name).bulkAdd((name==='settings'?(items as Settings[]).map(fillSettings):items) as never[]);
   }
  });
 }finally{
  staging.close();
  await Dexie.delete('lexi-restore');
 }
}
