import 'fake-indexeddb/auto';
import {beforeEach, describe, expect, it} from 'vitest';
import {indexWord, LexiDatabase} from '../src/storage/db';
import {dexieSource, importPreview, searchWordIds, wordPage, type WordCursor} from '../src/storage/queries';
import {commitImport, saveWord} from '../src/storage/ops';
import {fromSnapshot} from '../src/domain/snapshot-source';
import {progress} from '../src/domain/stats';
import {parseImport} from '../src/domain/import';
import {defaultSettings, type Snapshot, type Word} from '../src/domain/types';
import {recordFor, scenarios} from './plan-golden.test';
import {content, installLessons} from './helpers/content';

let db:LexiDatabase;
beforeEach(async()=>{
 await new LexiDatabase('lexi-queries').delete();
 db=new LexiDatabase('lexi-queries');
 await db.open();
});
const now=new Date('2026-09-15T09:00:00Z');
const iso=now.toISOString();
const word=(index:number,over:Partial<Word>={}):Word=>({
 id:`w${String(index).padStart(5,'0')}`,greek:`το λέξη${index}`,russian:`слово${index}`,ipa:'',segments:[],examples:[],verified:false,createdAt:iso,updatedAt:iso,...over,
});
/** Снимок раскладывается в базу как есть; порядок массивов приводится к порядку ключей, как у Dexie. */
async function load(data:Snapshot){
 await db.transaction('rw',db.tables,async()=>{
  await db.words.bulkAdd(data.words.map(indexWord));
  await db.lessons.bulkAdd(data.lessons);
  await db.lessonWords.bulkAdd(data.links);
  await db.states.bulkAdd(data.states);
  await db.events.bulkAdd(data.events);
  await db.sessions.bulkAdd(data.sessions);
  await db.settings.put(data.settings);
 });
 const byId=<T extends {id:string}>(items:T[])=>[...items].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 return {...data,words:byId(data.words),lessons:byId(data.lessons)};
}

describe('эквивалентность планирования на базе и на снимке',()=>{
 for(const [name,data] of Object.entries(scenarios)){
  it(`сценарий ${name}: очередь, сроки, задания и варианты совпадают при том же источнике случайности`,async()=>{
   const sorted=await load(data);
   const ids=data.words.slice(0,3).map(w=>w.id);
   const [fromDb,fromMemory]=await Promise.all([recordFor(dexieSource(db),ids),recordFor(fromSnapshot(sorted),ids)]);
   expect(fromDb).toEqual(fromMemory);
   expect(await progress(dexieSource(db),now)).toEqual(await progress(fromSnapshot(sorted),now));
  });
 }
 it('слова неустановленного урока не существуют локально и не попадают в очередь',async()=>{
  await installLessons(db,['lesson-1-1']);
  const plan=await dexieSource(db).lessons();
  expect(plan.map(l=>l.id)).toEqual(['lesson-1-1']);
  expect(await db.catalog.count()).toBe(content.catalog.lessons.length);
  expect(await db.words.count()).toBe(33);
 });
});

describe('страницы словаря',()=>{
 const words=Array.from({length:130},(_,i)=>word(i,i%40===7?{deletedAt:iso}:{}));
 const populate=()=>load({words,lessons:[{id:'l',title:'l',targetDate:null,status:'upcoming',createdAt:iso,updatedAt:iso}],links:words.slice(0,12).map((w,position)=>({lessonId:'l',wordId:w.id,position})),states:[],events:[],sessions:[],settings:defaultSettings});
 it('первая страница — не больше 50 живых карточек, курсор ведёт дальше без повторов и пропусков',async()=>{
  await populate();
  const seen:string[]=[]; let cursor:WordCursor|null=null; let pages=0;
  do{
   const page=await wordPage({query:'',filter:'all',lessonId:null,cursor},db);
   expect(page.items.length).toBeLessThanOrEqual(50);
   seen.push(...page.items.map(item=>item.word.id));
   cursor=page.cursor; pages++;
  }while(cursor);
  expect(pages).toBe(3);
  expect(new Set(seen).size).toBe(seen.length);
  expect(seen).toHaveLength(words.filter(w=>!w.deletedAt).length);
  expect(seen).toEqual([...seen].sort((a,b)=>{const x=words.find(w=>w.id===a)!,y=words.find(w=>w.id===b)!;return x.greek.localeCompare(y.greek)}));
 });
 it('фильтр по состоянию заполняет страницу порциями, не читая всю таблицу за раз',async()=>{
  await populate();
  await db.states.bulkAdd(words.slice(20,25).map(w=>({wordId:w.id,card:{due:new Date('2026-09-20'),state:2,scheduled_days:30} as never,introducedAt:iso,version:1})));
  const solid=await wordPage({query:'',filter:'solid',lessonId:null,cursor:null},db);
  expect(solid.items.map(item=>item.word.id)).toEqual(words.slice(20,25).map(w=>w.id));
  expect(solid.cursor).toBeNull();
  const fresh=await wordPage({query:'',filter:'new',lessonId:null,cursor:null},db);
  expect(fresh.items).toHaveLength(50);
  expect(fresh.items.every(item=>item.group==='new')).toBe(true);
 });
 it('фильтр по уроку ограничен связями урока и сохраняет их порядок',async()=>{
  await populate();
  const page=await wordPage({query:'',filter:'all',lessonId:'l',cursor:null},db);
  expect(page.scope).toBe('lesson');
  expect(page.items.map(item=>item.word.id)).toEqual(words.slice(0,12).filter(w=>!w.deletedAt).map(w=>w.id));
 });
});

describe('локальный поиск',()=>{
 it('ищет по началу токенов без учёта диакритики и регистра, по греческому и русскому',async()=>{
  await installLessons(db,['lesson-1-2']);
  expect(await searchWordIds('σπι',db)).toEqual(['w12-16']);
  expect(await searchWordIds('ΣΠΊ',db)).toEqual(['w12-16']);
  expect(await searchWordIds('дом',db)).toContain('w12-16');
  expect(await searchWordIds('πίτι',db)).toEqual([]); // не подстрока, а префикс токена
  const page=await wordPage({query:'σπ',filter:'all',lessonId:null,cursor:null},db);
  expect(page.scope).toBe('search');
  expect(page.items.some(item=>item.word.id==='w12-16')).toBe(true);
 });
 it('несколько слов запроса сужают выборку, результаты выдаются страницами по идентификаторам',async()=>{
  const words=Array.from({length:120},(_,i)=>word(i,{greek:`το κοινό${i}`,russian:i%2?`общее слово${i}`:`другое${i}`}));
  await load({words,lessons:[],links:[],states:[],events:[],sessions:[],settings:defaultSettings});
  const ids=await searchWordIds('κοιν общ',db);
  expect(ids).toHaveLength(60);
  const first=await wordPage({query:'κοιν общ',filter:'all',lessonId:null,cursor:null},db);
  expect(first.items).toHaveLength(50);
  const second=await wordPage({query:'κοιν общ',filter:'all',lessonId:null,cursor:first.cursor},db);
  expect(second.items).toHaveLength(10);
  expect(second.cursor).toBeNull();
  expect(new Set([...first.items,...second.items].map(i=>i.word.id)).size).toBe(60);
 });
 it('правка слова и импорт обновляют индекс вместе с записью',async()=>{
  await installLessons(db,['lesson-1-2']);
  const house=(await db.words.get('w12-16'))!;
  await saveWord({...house,russian:'жилище'},db);
  expect(await searchWordIds('жил',db)).toEqual(['w12-16']);
  expect(await searchWordIds('дом',db)).not.toContain('w12-16');
  const rows=parseImport('η καρέκλα\nстул').rows;
  const outcome=await commitImport({rows,lessonId:null,lessonTitle:'Мебель'},db);
  expect(outcome.added).toBe(1);
  expect(await searchWordIds('καρεκ',db)).toHaveLength(1);
  expect(await searchWordIds('стул',db)).toHaveLength(1);
 });
 it('предпросмотр импорта считает дубликаты и совпадения по индексам ключей',async()=>{
  await installLessons(db,['lesson-1-2']);
  const rows=parseImport('το σπίτι\nдом\nτο σπίτι\nздание\nη καρέκλα\nстул').rows;
  expect(await importPreview(rows,db)).toEqual({duplicates:1,conflicts:1});
 });
});
