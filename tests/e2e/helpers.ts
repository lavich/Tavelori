import type {Page} from '@playwright/test';
import {addDays} from '../../src/domain/learning';
import {isoWeekday} from '../../src/domain/schedule';

/** Отказ хранилища как у WebKit после сна: чтение IndexedDB бросает `UnknownError` до следующего `indexedDB.open` (или навсегда). */
export async function breakStorage(page:Page,permanent=false){
 await page.evaluate(permanent=>{
  const restore:(()=>void)[]=[];
  const fail=()=>{throw new DOMException('Attempt to get a record from database without an in-progress transaction','UnknownError')};
  const patch=(proto:object,names:string[])=>names.forEach(name=>{
   const original=(proto as Record<string,unknown>)[name];
   if(typeof original!=='function')return;
   (proto as Record<string,unknown>)[name]=fail;
   restore.push(()=>{(proto as Record<string,unknown>)[name]=original});
  });
  const READS=['get','getKey','getAll','getAllKeys','count','openCursor','openKeyCursor'];
  patch(IDBObjectStore.prototype,READS);
  patch(IDBIndex.prototype,READS);
  const open=IDBFactory.prototype.open;
  const marker=window as unknown as {__reopened?:number};
  IDBFactory.prototype.open=function(this:IDBFactory,...args:[string,number?]){
   marker.__reopened=(marker.__reopened??0)+1;
   if(!permanent){restore.forEach(undo=>undo());IDBFactory.prototype.open=open}
   return open.apply(this,args);
  };
 },permanent);
}

export interface DuePlan {wordId:string;tested:('recall'|'recognition'|'assembly'|'spelling')[];audio?:boolean}
/** Готовим очередь прямо в IndexedDB: сроки, история навыков и аудиофайл для аудирования. */
export async function seedQueue(page:Page,plan:DuePlan[],databaseName='lexi'){
 await page.evaluate(async([plan,databaseName])=>{
  const open=()=>new Promise<IDBDatabase>((resolve,reject)=>{
   const request=indexedDB.open(databaseName);
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
  });
  const database=await open();
  const due=new Date(Date.now()-2*86400000);
  const tx=database.transaction(['states','events','assets','words'],'readwrite');
  const states=tx.objectStore('states'), events=tx.objectStore('events'), assets=tx.objectStore('assets'), words=tx.objectStore('words');
  for(const entry of plan){
   states.put({wordId:entry.wordId,version:1,introducedAt:new Date(Date.now()-10*86400000).toISOString(),
    card:{due,stability:2.5,difficulty:5,elapsed_days:2,scheduled_days:2,reps:3,lapses:0,state:2,learning_steps:0,last_review:new Date(Date.now()-4*86400000)}});
   entry.tested.forEach((type,index)=>{
    const at=new Date(Date.now()-(9-index)*86400000).toISOString();
    events.put({id:`seed-${entry.wordId}-${index}-${type}`,sessionId:'seed',itemId:`seed-${entry.wordId}-${index}-${type}`,wordId:entry.wordId,
     snapshot:{greek:'',russian:''},type,mode:'scheduled',rating:3,correct:true,answer:'',createdAt:at,localDate:at.slice(0,10),responseTimeMs:1000});
   });
   if(entry.audio){
    const wave=new Uint8Array(44);
    const view=new DataView(wave.buffer);
    for(const [offset,text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']] as [number,string][])
     [...text].forEach((char,index)=>view.setUint8(offset+index,char.charCodeAt(0)));
    view.setUint32(4,36,true);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
    view.setUint32(24,8000,true);view.setUint32(28,8000,true);view.setUint16(32,1,true);view.setUint16(34,8,true);
    const id=`snd-${entry.wordId}`;
    assets.put({id,kind:'audio',blob:new Blob([wave],{type:'audio/wav'}),mimeType:'audio/wav',source:'тест',alt:''});
    const request=words.get(entry.wordId);
    request.onsuccess=()=>words.put({...request.result,audioAssetId:id});
   }
  }
  await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
  database.close();
 },[plan,databaseName] as const);
 await page.reload();
 await ready(page);
}
export const ready=(page:Page)=>page.waitForSelector('text=Немного каждый день');
/**
 * Поставка не несёт дат занятий, поэтому сценарию, которому нужны проведённый и ближайший урок,
 * приходится задать расписание курса — ровно так, как это делает пользователь. Первое занятие
 * три дня назад: урок 1.1 закрепляется проведённым при перезагрузке, 1.2 становится ближайшим.
 */
export async function useSchedule(page:Page,courseId='leeke',databaseName='lexi'){
 const today=new Date().toISOString().slice(0,10);
 const startDate=addDays(today,-3);
 const weekdays=[isoWeekday(startDate),isoWeekday(addDays(today,1))];
 await page.evaluate(async([courseId,databaseName,startDate,weekdays])=>{
  const database=await new Promise<IDBDatabase>((resolve,reject)=>{
   const request=indexedDB.open(databaseName);
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
  });
  const tx=database.transaction('courses','readwrite');
  const store=tx.objectStore('courses');
  const current=await new Promise<Record<string,unknown>>((resolve,reject)=>{
   const request=store.get(courseId);
   request.onsuccess=()=>resolve(request.result as Record<string,unknown>);
   request.onerror=()=>reject(request.error);
  });
  store.put({...current,schedule:{startDate,weekdays},updatedAt:new Date().toISOString()});
  await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
  database.close();
 },[courseId,databaseName,startDate,weekdays] as const);
 await page.reload();
 await ready(page);
 return {startDate,weekdays};
}
/** Уроки больше не устанавливаются при запуске: открытие урока из каталога загружает его пакет. */
export async function installLessons(page:Page,ids:string[]){
 for(const id of ids){
  await page.goto(`/lessons/${id}`);
  await page.getByRole('heading',{name:'Слова набора'}).waitFor({timeout:20000});
 }
 await page.goto('/');
 await ready(page);
}
