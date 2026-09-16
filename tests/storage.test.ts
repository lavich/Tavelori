import 'fake-indexeddb/auto';
import {beforeEach, describe, expect, it} from 'vitest';
import {Rating} from 'ts-fsrs';
import {LexiDatabase, ensureSeed, loadSnapshot} from '../src/storage/db';
import {ConflictError, commitImport, deleteWord, markIntroduced, prepareObjectiveSession, saveSettings, saveWord, submitAnswer} from '../src/storage/ops';
import {makePlan, makeSession} from '../src/domain/learning';
import {defaultSettings, type Settings} from '../src/domain/types';
import {parseImport} from '../src/domain/import';
import {seedAssets, seedLessons, seedWords} from '../src/content';

const now=new Date('2026-09-15T09:00:00Z');
let db:LexiDatabase;
beforeEach(async()=>{
 await new LexiDatabase('lexi-test').delete();
 db=new LexiDatabase('lexi-test');
 await db.open();
});
const snapshot=()=>loadSnapshot(db);

describe('исходные данные',()=>{
 it('наполняет базу один раз и не дублирует слова при повторном запуске',async()=>{
  expect(await ensureSeed(db)).toBe(true);
  expect(await ensureSeed(db)).toBe(false);
  expect(await db.words.count()).toBe(seedWords.length);
  expect(await db.assets.count()).toBe(seedAssets().length);
  expect(await db.lessons.count()).toBe(seedLessons.length);
 });
 it('не воскрешает удалённое пользователем слово',async()=>{
  await ensureSeed(db);
  await deleteWord(seedWords[0].id,db);
  await db.meta.delete('seed'); // имитируем обновление приложения
  await ensureSeed(db);
  expect((await db.words.get(seedWords[0].id))!.deletedAt).toBeTruthy();
  expect(await db.words.count()).toBe(seedWords.length);
 });
 it('сохраняет blob картинки после повторного открытия базы',async()=>{
  await ensureSeed(db);
  db.close();
  const again=new LexiDatabase('lexi-test');
  await again.open();
  const asset=await again.assets.get('img-w12-16');
  expect(asset!.blob.size).toBeGreaterThan(200);
  expect(await asset!.blob.text()).toContain('<svg');
  again.close();
 });
});

describe('запись ответа',()=>{
 const prepare=async()=>{
  await ensureSeed(db);
  const data=await snapshot();
  const session=makeSession({data,now,random:()=>0.42});
  await db.sessions.add(session);
  return {data,session};
 };
 const answer=(session:ReturnType<typeof makeSession>,item=session.items[0],extra={})=>submitAnswer({
  session,item,correct:true,answer:'',responseTimeMs:1200,activeTimeMs:5000,
  timezone:'Asia/Nicosia',now,database:db,...extra,
 });
 it('двойное нажатие создаёт один ответ и один пересчёт FSRS',async()=>{
  const {session}=await prepare();
  await Promise.all([answer(session),answer(session)]);
  expect(await db.events.count()).toBe(1);
  expect((await db.states.get(session.items[0].wordId))!.version).toBe(1);
  expect((await db.sessions.get(session.id))!.index).toBe(1);
 });
 it('отклоняет ответ из другой вкладки и не теряет уже записанные данные',async()=>{
  const {session}=await prepare();
  await answer(session);
  const stale={...session.items[0],id:`${session.items[0].id}-copy`};
  await expect(answer(session,stale)).rejects.toBeInstanceOf(ConflictError);
  expect(await db.events.count()).toBe(1);
 });
 it('знакомство сохраняется без ответа и изменения расписания',async()=>{
  const {session}=await prepare();
  await markIntroduced(session.id,session.items[0].wordId,3000,db);
  await markIntroduced(session.id,session.items[0].wordId,4000,db);
  expect(await db.events.count()).toBe(0);
  expect(await db.states.count()).toBe(0);
  expect((await db.sessions.get(session.id))!.introducedWordIds).toEqual([session.items[0].wordId]);
  expect((await db.sessions.get(session.id))!.activeTimeMs).toBe(4000);
 });
 it('ошибка атомарно добавляет одну тренировку после двух заданий',async()=>{
  const {session}=await prepare();
  const event=await answer(session,session.items[0],{correct:false});
  expect(event.rating).toBe(Rating.Again);
  await answer(session,session.items[0],{correct:false});
  const stored=(await db.sessions.get(session.id))!;
  expect(stored.items).toHaveLength(session.items.length+1);
  expect(stored.items[3]).toMatchObject({retryOf:session.items[0].id,mode:'practice',isNew:false,expectedVersion:1});
  const before=await db.states.get(session.items[0].wordId);
  await answer(stored,stored.items[3],{correct:false});
  expect(await db.states.get(session.items[0].wordId)).toEqual(before);
  expect((await db.sessions.get(session.id))!.items).toHaveLength(stored.items.length);
  expect(await db.events.count()).toBe(2);
 });
 it('последняя ошибка не завершает занятие до дополнительной попытки',async()=>{
  const {data}=await prepare();
  const session=makeSession({data,now,wordIds:[seedWords[0].id],random:()=>0.7});
  await db.sessions.add(session);
  await answer(session,session.items[0],{correct:false});
  const stored=(await db.sessions.get(session.id))!;
  expect(stored.status).toBe('active');
  expect(stored.items).toHaveLength(2);
  const state=await db.states.get(session.items[0].wordId);
  const event=await answer(stored,stored.items[1]);
  expect(event.rating).toBe(Rating.Good);
  expect((await db.sessions.get(session.id))!.status).toBe('done');
  expect(await db.states.get(session.items[0].wordId)).toEqual(state);
 });
 it('обновляет только неотвеченный recall и сохраняет старую историю',async()=>{
  const {session}=await prepare();
  const event=await answer(session);
  const stored=(await db.sessions.get(session.id))!;
  const legacy={...stored,objectiveVersion:undefined,items:stored.items.map(item=>({...item,type:'recall' as const,options:[]}))};
  await db.sessions.put(legacy);
  await prepareObjectiveSession(session.id,db);
  const converted=(await db.sessions.get(session.id))!;
  expect(converted.items[0]).toEqual(legacy.items[0]);
  expect(converted.items.slice(1).every(item=>item.type!=='recall')).toBe(true);
  expect(await db.events.get(event.id)).toEqual(event);
  await prepareObjectiveSession(session.id,db);
  expect(await db.sessions.get(session.id)).toEqual(converted);
 });
 it('ошибка транзакции откатывает событие, состояние и дополнительную попытку',async()=>{
  const {session}=await prepare();
  const fail=()=>{throw new Error('storage failed')};
  db.sessions.hook('updating',fail);
  await expect(answer(session,session.items[0],{correct:false})).rejects.toThrow('storage failed');
  db.sessions.hook('updating').unsubscribe(fail);
  expect(await db.events.count()).toBe(0);
  expect(await db.states.count()).toBe(0);
  expect(await db.sessions.get(session.id)).toEqual(session);
  await answer(session,session.items[0],{correct:false});
  expect(await db.events.count()).toBe(1);
 });
 it('practice не сдвигает интервалы, но сохраняет результат навыка',async()=>{
  const {data}=await prepare();
  const practice=makeSession({data,now,random:()=>0.3,mode:'practice',wordIds:[seedWords[0].id]});
  await db.sessions.add(practice);
  await answer(practice,practice.items[0]);
  expect(await db.states.count()).toBe(0);
  expect((await db.events.toArray())[0].mode).toBe('practice');
 });
});

describe('импорт',()=>{
 it('связывает известное слово с набором и не создаёт дубликат',async()=>{
  await ensureSeed(db);
  const rows=parseImport('το σπίτι\nдом\nη ομπρέλα\nзонт').rows;
  const outcome=await commitImport({rows,lessonId:null,lessonTitle:'Урок 1.3',targetDate:'2026-09-25'},db);
  expect(outcome).toMatchObject({added:1,linked:1});
  expect(await db.words.count()).toBe(seedWords.length+1);
  const lesson=await db.lessons.get(outcome.lessonId);
  expect(lesson!.wordIds).toHaveLength(2);
  expect(lesson!.targetDate).toBe('2026-09-25');
 });
 it('при ошибке не оставляет половину набора',async()=>{
  await ensureSeed(db);
  const rows=parseImport('η ομπρέλα\nзонт\nτο ποτήρι\nстакан').rows;
  await expect(commitImport({rows,lessonId:'нет-такого',lessonTitle:'',targetDate:null},db)).rejects.toThrow();
  expect(await db.words.count()).toBe(seedWords.length);
 });
 it('меняет перевод без потери истории и сбрасывает проверку фонетики после правки греческого',async()=>{
  await ensureSeed(db);
  const word=(await db.words.get('w12-16'))!;
  await saveWord({...word,russian:'жилище'},db);
  expect((await db.words.get('w12-16'))!.verified).toBe(true);
  await saveWord({...word,greek:'το σπιτάκι'},db);
  expect((await db.words.get('w12-16'))!.verified).toBe(false);
 });
});

describe('расписание занятий',()=>{
 const monThu={startDate:'2026-09-18',weekdays:[1,4]};
 const legacy={id:'settings',timezone:'Asia/Nicosia',newWordsPerDay:10,sessionSize:20} as Settings;
 it('дополняет запись настроек без расписания значением по умолчанию',async()=>{
  await ensureSeed(db);
  await db.settings.put(legacy);
  expect((await snapshot()).settings.schedule).toEqual({startDate:null,weekdays:[]});
  expect(defaultSettings.schedule).toEqual({startDate:null,weekdays:[]});
 });
 it('снимок даёт урокам 1.3 и 1.4 дни расписания после 1.2, а план считает сроки по ним',async()=>{
  await ensureSeed(db);
  await saveSettings({...defaultSettings,schedule:monThu},db);
  const data=await snapshot();
  const byId=Object.fromEntries(data.lessons.map(l=>[l.id,l]));
  expect(byId['lesson-1-2']).toMatchObject({targetDate:'2026-09-18',dateSource:'manual'});
  expect(byId['lesson-1-3']).toMatchObject({targetDate:'2026-09-21',dateSource:'schedule'});
  expect(byId['lesson-1-4']).toMatchObject({targetDate:'2026-09-24',dateSource:'schedule'});
  expect((await db.lessons.get('lesson-1-3'))!.targetDate).toBeNull();
  const plan=makePlan(data,new Date('2026-09-16T09:00:00Z'));
  expect(plan.deadlines.map(d=>[d.lessonId,d.daysLeft])).toEqual([['lesson-1-2',2],['lesson-1-3',5],['lesson-1-4',8]]);
 });
});
