import Dexie from 'dexie';
import {exportDB, importInto} from 'dexie-export-import';
import {LexiDatabase, db, TABLES} from '../../storage/db';
import {liveWords} from '../../shared/store';
import {fillSettings, type Settings, type Snapshot} from '../../domain/types';

export const APP_MARKER='lexi:1';
export interface BackupReport {databaseName:string;tables:{name:string;rows:number}[];createdAt:string|null;bytes:number}

export async function exportFull(database:LexiDatabase=db):Promise<Blob>{
 await database.meta.put({key:'app',value:APP_MARKER});
 await database.meta.put({key:'exportedAt',value:new Date().toISOString()});
 return exportDB(database,{prettyJson:false});
}
export function download(blob:Blob,name:string){
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=url; link.download=name; link.click();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}
export const backupName=(now=new Date())=>`lexi-backup-${now.toISOString().slice(0,10)}.json`;

export function exportWordsTsv(data:Snapshot):Blob{
 const rows=liveWords(data).map(word=>[word.greek,word.russian,word.ipa].map(cell=>cell.replace(/[\t\r\n]/g,' ')).join('\t'));
 return new Blob([['Греческий\tРусский\tIPA',...rows].join('\n')],{type:'text/tab-separated-values'});
}

export async function inspectBackup(file:Blob):Promise<{ok:true;report:BackupReport}|{ok:false;message:string}>{
 let parsed:any;
 try{parsed=JSON.parse(await file.text())}
 catch{return {ok:false,message:'Файл не читается как копия Lexi — возможно, он повреждён.'}}
 if(parsed?.formatName!=='dexie'||!parsed?.data?.tables)return {ok:false,message:'Это не файл полной копии Lexi.'};
 const info=parsed.data;
 if(info.databaseName!=='lexi')return {ok:false,message:`Копия сделана другим приложением (база «${info.databaseName}»).`};
 if(Number(info.databaseVersion)>1)return {ok:false,message:`Копия сделана более новой версией Lexi (схема ${info.databaseVersion}). Обновите приложение.`};
 const names=info.tables.map((table:{name:string})=>table.name);
 const missing=TABLES.filter(table=>!names.includes(table));
 if(missing.length)return {ok:false,message:`В копии нет обязательных таблиц: ${missing.join(', ')}.`};
 const meta=(info.data??[]).find((entry:{tableName:string})=>entry.tableName==='meta');
 const marker=(meta?.rows??[]).find((row:{key:string})=>row.key==='app');
 if(marker&&marker.value!==APP_MARKER)return {ok:false,message:`Неизвестная версия формата копии: ${marker.value}.`};
 const exportedAt=(meta?.rows??[]).find((row:{key:string})=>row.key==='exportedAt')?.value??null;
 return {ok:true,report:{
  databaseName:info.databaseName,
  tables:info.tables.map((table:{name:string;rowCount:number})=>({name:table.name,rows:table.rowCount})),
  createdAt:exportedAt,
  bytes:file.size,
 }};
}

export async function restoreBackup(file:Blob,database:LexiDatabase=db):Promise<void>{
 const check=await inspectBackup(file);
 if(!check.ok)throw new Error(check.message);
 const staging=new LexiDatabase('lexi-restore');
 await staging.delete();
 await staging.open();
 try{
  await importInto(staging,file,{acceptNameDiff:true,acceptVersionDiff:true,clearTablesBeforeImport:true,overwriteValues:true});
  const payload=await Promise.all(TABLES.map(async name=>[name,await staging.table(name).toArray()] as const));
  if(!payload.find(([name])=>name==='words')?.[1].length)throw new Error('В копии нет ни одного слова — восстановление отменено.');
  await database.transaction('rw',TABLES.map(name=>database.table(name)),async()=>{
   for(const [name,rows] of payload){
    await database.table(name).clear();
    await database.table(name).bulkAdd((name==='settings'?(rows as Settings[]).map(fillSettings):rows) as never[]);
   }
  });
 }finally{
  staging.close();
  await Dexie.delete('lexi-restore');
 }
}
