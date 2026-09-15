import 'fake-indexeddb/auto';
import {beforeEach, describe, expect, it} from 'vitest';
import {Rating} from 'ts-fsrs';
import {LexiDatabase, ensureSeed, loadSnapshot} from '../src/storage/db';
import {ConflictError, commitImport, deleteWord, saveWord, submitAnswer} from '../src/storage/ops';
import {makeSession} from '../src/domain/learning';
import {parseImport} from '../src/domain/import';
import {seedWords} from '../src/content';

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
  expect(await db.words.count()).toBe(63);
  expect(await db.assets.count()).toBe(63);
  expect(await db.lessons.count()).toBe(2);
 });
 it('не воскрешает удалённое пользователем слово',async()=>{
  await ensureSeed(db);
  await deleteWord(seedWords[0].id,db);
  await db.meta.delete('seed'); // имитируем обновление приложения
  await ensureSeed(db);
  expect((await db.words.get(seedWords[0].id))!.deletedAt).toBeTruthy();
  expect(await db.words.count()).toBe(63);
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
  session,item,rating:Rating.Good,correct:null,answer:'',responseTimeMs:1200,activeTimeMs:5000,
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
  const rows=parseImport('το σπίτι\nдом\nτο τραπέζι\nстол').rows;
  const outcome=await commitImport({rows,lessonId:null,lessonTitle:'Урок 1.3',targetDate:'2026-09-25'},db);
  expect(outcome).toMatchObject({added:1,linked:1});
  expect(await db.words.count()).toBe(64);
  const lesson=await db.lessons.get(outcome.lessonId);
  expect(lesson!.wordIds).toHaveLength(2);
  expect(lesson!.targetDate).toBe('2026-09-25');
 });
 it('при ошибке не оставляет половину набора',async()=>{
  await ensureSeed(db);
  const rows=parseImport('το τραπέζι\nстол\nη καρέκλα\nстул').rows;
  await expect(commitImport({rows,lessonId:'нет-такого',lessonTitle:'',targetDate:null},db)).rejects.toThrow();
  expect(await db.words.count()).toBe(63);
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
