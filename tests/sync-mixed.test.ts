import 'fake-indexeddb/auto';
import {beforeEach, describe, expect, it} from 'vitest';
import {LexiDatabase} from '../src/storage/db';
import {applySnapshot, buildAndCommit, buildSnapshot, hasMixedProgress, META, readMeta} from '../src/sync/snapshot';
import {decodeSnapshot, encodeRef, encodeSnapshot, SnapshotFormatError} from '../src/sync/codec';
import {kvAdapter, splitParts} from '../src/sync/adapter';
import {SyncCoordinator} from '../src/sync/coordinator';
import {CLOUD_LIMITS, memoryTransport, type MemoryTransport} from '../src/sync/transport';
import {LEGACY_SNAPSHOT_FORMAT, SNAPSHOT_FORMAT, type CompactSnapshot} from '../src/sync/types';
import {dexieSource} from '../src/storage/queries';
import {makeSession} from '../src/domain/learning';
import {installLesson, refreshCatalog} from '../src/content/client';
import {submitAnswer} from '../src/storage/ops';
import {unitKey} from './helpers/cards';
import {memoryFetcher} from './helpers/content';
import {installMixed, MIXED_LESSON, mixedContent} from './helpers/mixed';
import type {LearningRef} from '../src/domain/types';

let cloud:MemoryTransport;
let clockMs=Date.parse('2026-09-16T08:00:00Z');
const tick=(minutes=1)=>{clockMs+=minutes*60000;return new Date(clockMs)};
const now=()=>new Date(clockMs);
let counter=0;
const W=(id:string):LearningRef=>({kind:'word',id});
const P=(id:string):LearningRef=>({kind:'phrase',id});
const C=(id:string):LearningRef=>({kind:'cloze',id});

async function device(name:string,options:{mixed?:boolean;maxKeys?:number}={}){
 const db=new LexiDatabase(`lexi-sync-mixed-${name}-${++counter}`);
 await db.delete();await db.open();
 if(options.mixed)await installMixed(db);
 const sync=new SyncCoordinator({database:db,adapter:kvAdapter(cloud),now,label:name,schedule:()=>()=>undefined,retryBaseMs:1});
 return {db,sync,name};
}
type Device=Awaited<ReturnType<typeof device>>;
/** Ответы на конкретные карточки: состояние и навык получает именно та карточка, что названа. */
async function study(dev:Device,refs:LearningRef[],answers:boolean[]){
 const session=await makeSession({source:dexieSource(dev.db),now:tick(),random:()=>0.31,refs});
 await dev.db.sessions.add(session);
 for(const [index,item] of session.items.entries())
  await submitAnswer({session,item,correct:answers[index]??true,answer:'',responseTimeMs:900,activeTimeMs:900,timezone:'Asia/Nicosia',now:tick(),database:dev.db});
 return session.items.map(item=>item.unitKey);
}
const statesOf=async(dev:Device)=>(await dev.db.cardStates.orderBy('unitKey').toArray())
 .map(state=>({...state,card:{...state.card,due:new Date(state.card.due).toISOString(),last_review:state.card.last_review?new Date(state.card.last_review).toISOString():undefined}}));

beforeEach(()=>{cloud=memoryTransport();clockMs=Date.parse('2026-09-16T08:00:00Z')});

describe('компактный снимок формата 2',()=>{
 it('кодек обратим, числа FSRS не меняются, а тексты, ответы и цели в снимок не попадают',async()=>{
  const phone=await device('phone',{mixed:true});
  await study(phone,[W('w11-27'),P('p-grafo'),C('c-grafo'),C('c-vouno')],[true,false,true,true]);
  const snapshot=await buildAndCommit(phone.db,now(),'dev-1');
  expect(snapshot.format).toBe(SNAPSHOT_FORMAT);
  const text=encodeSnapshot(snapshot);
  expect(decodeSnapshot(text)).toEqual(snapshot); // обратимость
  const decoded=decodeSnapshot(text);
  expect(decoded.states.map(state=>state.ref)).toEqual(snapshot.states.map(state=>state.ref));
  expect(decoded.states.every((state,index)=>state.card.stability===snapshot.states[index].card.stability&&state.card.due===snapshot.states[index].card.due)).toBe(true);
  expect(decoded.stats).toEqual(snapshot.stats);
  // Виды карточек входят в идентичность прогресса.
  expect(new Set(snapshot.states.map(state=>state.ref.kind))).toEqual(new Set(['word','phrase','cloze']));
  expect(snapshot.skills.map(entry=>entry.ref.kind)).toContain('cloze');
  // Ни текстов карточек, ни ответов, ни описаний цели.
  for(const secret of ['Γράφω ένα γράμμα','{{gap}}','ψηλό','verb-form','adjective-form','Я пишу письмо'])
   expect(text,secret).not.toContain(secret);
  expect(text).toContain(encodeRef(C('c-grafo'))); // ссылка на карточку — вид и идентификатор
 });
 it('смешанный снимок укладывается в лимиты Telegram и не публикуется частично при их превышении',async()=>{
  const phone=await device('phone',{mixed:true});
  await study(phone,[P('p-grafo'),C('c-grafo')],[true,true]);
  const snapshot=await buildSnapshot(phone.db,now());
  const parts=splitParts(encodeSnapshot(snapshot));
  expect(parts.length*3+2).toBeLessThan(CLOUD_LIMITS.maxKeys);
  cloud=memoryTransport({limits:{maxKeys:1}});
  const tight=new SyncCoordinator({database:phone.db,adapter:kvAdapter(cloud),now,schedule:()=>()=>undefined,retryBaseMs:1});
  const before=await statesOf(phone);
  const status=await tight.exchange();
  expect(status.phase).toBe('error');
  expect(status.error?.kind).toBe('limit');
  expect(cloud.store.size).toBe(0); // частичной версии нет
  expect(await statesOf(phone)).toEqual(before); // локальные ответы сохранены
  expect(await readMeta(phone.db,META.dirty)).toBe('1');
 });
 it('словарный формат 1 читается как прогресс слов с теми же сроками и счётчиками',()=>{
  const due=Date.parse('2026-09-20T08:00:00Z'), intro=Date.parse('2026-09-10T09:00:00Z');
  const wire=JSON.stringify({
   f:LEGACY_SNAPSHOT_FORMAT,c:Date.parse('2026-09-16T08:00:00Z'),
   s:{timezone:'Asia/Nicosia',sessionSize:12},
   cs:[{id:'leeke',subscribed:true,newWordsPerDay:7,schedule:{startDate:'2026-09-14',weekdays:[1,4]}}],
   l:[['lesson-1-1',null,'upcoming',Date.parse('2026-09-15T08:00:00Z')]],p:['lesson-1-1'],
   st:[['w11-01',due,2.5,5.25,1,3,2,0,2,0,0,intro,4]],
   sk:[['w11-01','r',1,{r:['101',Date.parse('2026-09-15T08:00:00Z')]}]],
   x:{d:[['2026-09-15',3,['w11-01']]],r:{r:'101'},n:3,w:['w11-01']},
  });
  const snapshot=decodeSnapshot(wire);
  expect(snapshot.format).toBe(SNAPSHOT_FORMAT);
  expect(snapshot.states).toHaveLength(1);
  expect(snapshot.states[0]).toMatchObject({ref:W('w11-01'),version:4,introducedAt:new Date(intro).toISOString()});
  expect(snapshot.states[0].card.due).toBe(new Date(due).toISOString());
  expect(snapshot.states[0].card.stability).toBe(2.5);
  expect(snapshot.skills[0].ref).toEqual(W('w11-01'));
  expect(snapshot.stats.answeredKeys).toEqual([unitKey(W('w11-01'))]);
  expect(snapshot.stats.days[0].keys).toEqual([unitKey(W('w11-01'))]);
  expect(snapshot.courses[0]).toMatchObject({id:'leeke',newItemsPerDay:7}); // прежний предел слов стал пределом карточек
  expect(()=>decodeSnapshot(JSON.stringify({f:SNAPSHOT_FORMAT+1,st:[],sk:[],s:{},x:{d:[],r:{},n:0,w:[]},l:[],p:[]}))).toThrow(SnapshotFormatError);
 });
 it('формат 1 применяется к профилю без прогресса новых видов и отклоняется при смешанном прогрессе',async()=>{
  const phone=await device('phone',{mixed:true});
  const legacy:CompactSnapshot={
   format:SNAPSHOT_FORMAT,createdAt:now().toISOString(),settings:{timezone:'Asia/Nicosia',sessionSize:20},
   courses:[],lessons:[],packages:[MIXED_LESSON],
   states:[{ref:W('w11-27'),card:{due:'2026-09-25T08:00:00.000Z',stability:3,difficulty:5,elapsed_days:1,scheduled_days:9,reps:2,lapses:0,state:2,learning_steps:0},introducedAt:'2026-09-10T09:00:00.000Z',version:2}],
   skills:[],stats:{days:[],recentByType:{},answers:0,answeredKeys:[]},
  };
  // Наличие контента фраз и пропусков не мешает: важен сохранённый прогресс.
  expect(await hasMixedProgress(phone.db)).toBe(false);
  await applySnapshot(phone.db,legacy,'legacy-1',{other:1},now(),LEGACY_SNAPSHOT_FORMAT);
  expect((await phone.db.cardStates.get(unitKey(W('w11-27'))))!.version).toBe(2);
  // Появился прогресс пропуска — словарный снимок больше не может заменить смешанную историю.
  await study(phone,[C('c-grafo')],[true]);
  expect(await hasMixedProgress(phone.db)).toBe(true);
  const before=await statesOf(phone);
  const events=await phone.db.events.count();
  await expect(applySnapshot(phone.db,legacy,'legacy-2',{other:2},now(),LEGACY_SNAPSHOT_FORMAT)).rejects.toThrow(/формата 1|формат/i);
  expect(await statesOf(phone)).toEqual(before);
  expect(await phone.db.events.count()).toBe(events);
  expect(await readMeta(phone.db,META.applied)).toBe('legacy-1'); // применение не отмечено
  // Тот же снимок в формате 2 применяется и при смешанном прогрессе.
  await applySnapshot(phone.db,legacy,'v2',{other:3},now());
  expect(await phone.db.cardStates.get(unitKey(C('c-grafo')))).toBeUndefined(); // версия не содержит пропуска — он снова новый
 });
});

describe('обмен смешанным прогрессом между устройствами',()=>{
 it('второе устройство получает сроки и навыки фраз и пропусков, прогресс слова не подменяется',async()=>{
  const phone=await device('phone',{mixed:true});
  const tablet=await device('tablet',{mixed:true});
  await study(phone,[W('w11-27'),P('p-grafo'),C('c-grafo'),C('c-gramma')],[true,false,true,false]);
  expect((await phone.sync.exchange()).phase).toBe('synced');
  expect((await tablet.sync.exchange()).phase).toBe('synced');
  expect(await statesOf(tablet)).toEqual(await statesOf(phone));
  const kinds=(await tablet.db.cardStates.toArray()).map(state=>state.ref.kind);
  expect(new Set(kinds)).toEqual(new Set(['word','phrase','cloze']));
  // Навыки совпадают покарточно, а связанное слово не получает прогресс пропуска.
  const source=dexieSource(tablet.db);
  const cards=await source.cardsOf([C('c-grafo'),W('w11-27')]);
  const clozeSkills=await source.skillsOf(cards.get(unitKey(C('c-grafo')))!);
  const wordSkills=await source.skillsOf(cards.get(unitKey(W('w11-27')))!);
  expect(clozeSkills.types.cloze).toBeTruthy();
  expect(wordSkills.types.cloze).toBeUndefined();
  expect((await tablet.db.cardStates.get(unitKey(W('w11-27'))))!.card.due).not.toEqual((await tablet.db.cardStates.get(unitKey(C('c-grafo'))))!.card.due);
  // Повторный обмен без изменений ничего не публикует.
  const keys=cloud.store.size;
  await phone.sync.exchange();await tablet.sync.exchange();
  expect(cloud.store.size).toBe(keys);
 });
 it('прогресс карточек неустановленного пакета ждёт установки, не участвует в обучении и принимается после неё',async()=>{
  const phone=await device('phone',{mixed:true});
  const fresh=await device('fresh');
  await study(phone,[P('p-grafo'),C('c-grafo')],[true,true]);
  await phone.sync.exchange();
  const missing:string[][]=[];
  fresh.sync.onMissingPackages=ids=>{missing.push(ids)};
  expect((await fresh.sync.exchange()).phase).toBe('synced');
  expect(await fresh.db.cardStates.count()).toBe(0);
  expect(await fresh.db.cardStash.count()).toBe(2);
  expect((await fresh.db.cardStash.toArray()).map(row=>row.ref.kind).sort()).toEqual(['cloze','phrase']);
  expect(missing[0]).toContain(MIXED_LESSON);
  expect((await dexieSource(fresh.db).dueStates(now()))).toHaveLength(0); // отложенное не попадает в очередь
  // Пакет установлен — отложенный прогресс становится обычным состоянием с теми же сроками.
  const fetcher=memoryFetcher(mixedContent());
  await refreshCatalog(fresh.db,fetcher);
  await installLesson(MIXED_LESSON,fresh.db,fetcher);
  expect(await fresh.db.cardStash.count()).toBe(0);
  expect(await statesOf(fresh)).toEqual(await statesOf(phone));
 });
 it('версия неподдерживаемого формата не применяется и не перезаписывается своим снимком',async()=>{
  // Тот же механизм отказа, которым клиент формата 1 отвергает формат 2: неизвестная версия не читается и не затирается.
  const phone=await device('phone',{mixed:true});
  const tablet=await device('tablet',{mixed:true});
  await study(phone,[C('c-grafo')],[true]);
  await phone.sync.exchange();
  await tablet.sync.exchange();
  const device1=await phone.sync.deviceId();
  const pointer=JSON.parse(cloud.store.get(`p_${device1}`)!);
  cloud.store.set(`p_${device1}`,JSON.stringify({...pointer,id:`${device1}-9`,format:SNAPSHOT_FORMAT+1,clock:{[device1]:9}}));
  await study(tablet,[C('c-gramma')],[false]);
  const before=await statesOf(tablet);
  const status=await tablet.sync.exchange();
  expect(status.phase).toBe('error');
  expect(status.error?.kind).toBe('format');
  expect(status.error?.message).toMatch(/Обновите приложение/);
  expect(await statesOf(tablet)).toEqual(before);
  expect(cloud.store.has(`p_${await tablet.sync.deviceId()}`)).toBe(false);
  expect(await readMeta(tablet.db,META.dirty)).toBe('1');
 });
});
