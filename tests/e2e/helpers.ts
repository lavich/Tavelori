import type {Page} from '@playwright/test';

export interface DuePlan {wordId:string;tested:('recall'|'recognition'|'spelling')[];audio?:boolean}
/** Готовим очередь прямо в IndexedDB: сроки, история навыков и аудиофайл для аудирования. */
export async function seedQueue(page:Page,plan:DuePlan[]){
 await page.evaluate(async(plan)=>{
  const open=()=>new Promise<IDBDatabase>((resolve,reject)=>{
   const request=indexedDB.open('lexi');
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
    events.put({id:`seed-${entry.wordId}-${type}`,sessionId:'seed',itemId:`seed-${entry.wordId}-${type}`,wordId:entry.wordId,
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
 },plan);
 await page.reload();
 await ready(page);
}
export const ready=(page:Page)=>page.waitForSelector('text=Немного каждый день');
