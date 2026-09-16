import {expect,test,type Page} from '@playwright/test';
import {ready} from './helpers';

async function installSession(page:Page,type:string,isNew=false,count=1){
 await page.evaluate(async({type,isNew,count})=>{
  const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('lexi');r.onsuccess=()=>resolve(r.result)});
  const tx=db.transaction(['words','sessions'],'readwrite');
  const request=tx.objectStore('words').getAll();
  request.onsuccess=()=>{
   const pool=request.result;
   const selected=count===1?[pool.find(word=>word.id==='w12-16')]:pool.slice(0,count);
   const items=selected.map((word,index)=>({id:`objective-${index}`,wordId:word.id,word,type,isNew,mode:'scheduled',expectedVersion:0,
    options:type==='assembly'?['τι','το','σπί']:type==='recognition'?[word.russian,'другой ответ','ещё ответ','неверно']:type==='listening'?[word.greek,'ναι','όχι','ευχαριστώ']:[]}));
   tx.objectStore('sessions').put({id:'objective',createdAt:new Date().toISOString(),planDate:'2026-09-16',items,index:0,status:'active',activeTimeMs:0,
    objectiveVersion:type==='recall'?undefined:1,introducedWordIds:[]});
  };
  await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
  db.close();
 },{type,isNew,count});
 await page.goto('/session');
 await page.getByTestId('prompt').first().waitFor();
}

async function stored(page:Page){
 return page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('lexi');r.onsuccess=()=>resolve(r.result)});
  const read=(name:string)=>new Promise<any[]>(resolve=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result)});
  const [events,states,sessions]=await Promise.all([read('events'),read('states'),read('sessions')]);
  db.close();return {events,states,session:sessions.find(s=>s.id==='objective')};
 });
}

test.beforeEach(async({page})=>{await page.goto('/');await ready(page)});

for(const type of ['recognition','assembly','spelling','listening']){
 test(`${type}: «Не знаю» показывает ответ, сохраняет ошибку и одну тренировку`,async({page})=>{
  await installSession(page,type);
  await expect(page.getByTestId('grade')).toHaveCount(0);
  await expect(page.getByText('Насколько легко вспомнилось?')).toHaveCount(0);
  await page.getByRole('button',{name:'Не знаю',exact:true}).click();
  await expect(page.getByTestId('feedback')).toBeVisible();
  const first=await stored(page);
  expect(first.events).toHaveLength(1);
  expect(first.events[0]).toMatchObject({correct:false,rating:1,answer:'',type});
  expect(first.session.items).toHaveLength(2);
  expect(first.session.status).toBe('active');
  // Перезагрузка сразу после ответа продолжает дополнительную попытку.
  await page.reload();
  await page.getByRole('button',{name:'Не знаю',exact:true}).click();
  await expect(page.getByTestId('feedback')).toBeVisible();
  const second=await stored(page);
  expect(second.events).toHaveLength(2);
  expect(second.events.some(e=>e.mode==='practice')).toBe(true);
  expect(second.states).toEqual(first.states);
  expect(second.session.items).toHaveLength(2);
  await page.getByRole('button',{name:'Далее',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Занятие завершено'})).toBeVisible();
 });
}

test('знакомство идёт отдельным проходом и переживает перезагрузку без ответа',async({page})=>{
 await installSession(page,'recognition',true,3);
 await expect(page.getByTestId('prompt')).toHaveText('Новое слово');
 await page.getByRole('button',{name:'Далее',exact:true}).click();
 await expect(page.getByLabel('Знакомство 2 из 3')).toBeVisible();
 const first=await stored(page);
 expect(first.events).toEqual([]);
 expect(first.states).toEqual([]);
 expect(first.session.introducedWordIds).toHaveLength(1);
 await page.reload();
 await expect(page.getByLabel('Знакомство 2 из 3')).toBeVisible();
 await page.getByRole('button',{name:'Далее',exact:true}).click();
 await expect(page.getByLabel('Знакомство 3 из 3')).toBeVisible();
 await page.getByRole('button',{name:'Далее',exact:true}).click();
 await expect(page.getByTestId('prompt')).toHaveText('Что значит это слово?');
 const after=await stored(page);
 expect(after.events).toEqual([]);
 expect(after.session.introducedWordIds).toHaveLength(3);
 await page.getByTestId('option').first().click();
 await expect(page.getByTestId('feedback')).toHaveText('Правильно!');
 expect((await stored(page)).events[0]).toMatchObject({correct:true,rating:3});
});

test('старое вспоминание заменяется объективным заданием при продолжении',async({page})=>{
 await installSession(page,'recall');
 await expect(page.getByTestId('prompt')).toHaveText('Что значит это слово?');
 await expect(page.getByRole('button',{name:'Показать ответ'})).toHaveCount(0);
 await expect(page.getByTestId('grade')).toHaveCount(0);
 await page.getByRole('button',{name:'Не знаю',exact:true}).click();
 await expect(page.getByTestId('feedback')).toBeVisible();
 expect((await stored(page)).events[0]).toMatchObject({type:'recognition',correct:false});
});
