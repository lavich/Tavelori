import 'fake-indexeddb/auto';
import {beforeEach, describe, expect, it} from 'vitest';
import {createEmptyCard, Rating, State} from 'ts-fsrs';
import {LexiDatabase} from '../src/storage/db';
import {dexieSource, lessonItems, loadLessons} from '../src/storage/queries';
import {wordRef} from './helpers/cards';
import {ConflictError, commitImport, createLesson, markIntroduced, prepareObjectiveSession, saveCourseTempo, saveSettings, saveWord, settleLessons, submitAnswer, updateLesson} from '../src/storage/ops';
import {makePlan, makeSession} from '../src/domain/learning';
import {defaultSettings, type Settings} from '../src/domain/types';
import {parseImport} from '../src/domain/import';
import {content, installLessons, wordsOf} from './helpers/content';
import {installMixed, mixedPackage} from './helpers/mixed';
import {unitKey} from './helpers/cards';
import {applyPackage} from '../src/content/client';
import {checkTextAnswer} from '../src/domain/cloze';
import {tiles} from '../src/domain/syllables';
import {clozeRevisionOf} from '../content/build';
import type {Cloze} from '../src/domain/types';

const now=new Date('2026-09-15T09:00:00Z');
let db:LexiDatabase;
beforeEach(async()=>{
 await new LexiDatabase('lexi-test').delete();
 db=new LexiDatabase('lexi-test');
 await db.open();
});
const ALL=['lesson-1-1','lesson-1-2','lesson-1-3','lesson-1-4'];
/** Слова установленных уроков: каталог шире, чем набор, который тесты разворачивают в базе. */
const seedWords=[...new Map(ALL.flatMap(id=>wordsOf(id)).map(word=>[word.id,word])).values()];
/** Замена старого seed: все четыре урока устанавливаются из пакетов в памяти. */
const ensureSeed=(database=db)=>installLessons(database,ALL);
const source=()=>dexieSource(db);
const scheduled=async(id:string)=>(await loadLessons(db)).find(l=>l.id===id)!;

describe('запись ответа',()=>{
 const prepare=async()=>{
  await ensureSeed(db);
  const session=await makeSession({source:source(),now,random:()=>0.42});
  await db.sessions.add(session);
  return {session};
 };
 const answer=(session:Awaited<ReturnType<typeof makeSession>>,item=session.items[0],extra={})=>submitAnswer({
  session,item,correct:true,answer:'',responseTimeMs:1200,activeTimeMs:5000,
  timezone:'Asia/Nicosia',now,database:db,...extra,
 });
 /** Карточка уже введена, срок ещё не наступил: в занятии она была бы подготовкой, а не повторением. */
 const asPreview=async(item:Awaited<ReturnType<typeof makeSession>>['items'][number],due:Date)=>{
  await db.cardStates.put({unitKey:item.unitKey,ref:item.ref,introducedAt:'2026-09-14T09:00:00Z',version:1,
   card:{...createEmptyCard(new Date('2026-09-14')),due,state:State.Review,scheduled_days:5,reps:2}});
  return {...item,mode:'preview' as const,isNew:false,expectedVersion:1};
 };
 it('верный ответ в подготовке не двигает срок',async()=>{
  const {session}=await prepare();
  const due=new Date('2026-09-22T09:00:00Z');
  const item=await asPreview(session.items[0],due);
  await answer(session,item,{correct:true});
  const after=await db.cardStates.get(item.unitKey);
  expect(after!.card.due).toEqual(due);
  expect(after!.version).toBe(1);
  const event=await db.events.get(`e-${item.id}`);
  expect(event!.mode).toBe('preview');
  expect(event!.after).toBeUndefined();
 });
 it('ошибка в подготовке возвращает карточку в переучивание',async()=>{
  const {session}=await prepare();
  const due=new Date('2026-09-22T09:00:00Z');
  const item=await asPreview(session.items[1],due);
  await answer(session,item,{correct:false});
  const after=await db.cardStates.get(item.unitKey);
  expect(after!.card.state).toBe(State.Relearning);
  expect(after!.card.due.getTime()).toBeLessThan(due.getTime());
  expect(after!.version).toBe(2);
  expect((await db.events.get(`e-${item.id}`))!.rating).toBe(Rating.Again);
 });
 /** Зрелая карточка в Review: на ней видно, сбрасывает «Почти» интервал или нет. */
 const asMature=async(item:Awaited<ReturnType<typeof makeSession>>['items'][number])=>{
  await db.cardStates.put({unitKey:item.unitKey,ref:item.ref,introducedAt:'2026-08-01T09:00:00Z',version:1,
   card:{...createEmptyCard(new Date('2026-08-01')),due:now,state:State.Review,stability:30,difficulty:5,
    scheduled_days:30,elapsed_days:30,reps:5,last_review:new Date('2026-08-16T09:00:00Z')}});
  return {...item,isNew:false,expectedVersion:1};
 };
 it('«Почти» получает Hard, оставляет карточку в повторении и добавляет тренировку',async()=>{
  const {session}=await prepare();
  const item=await asMature(session.items[0]);
  const event=await answer(session,{...item,type:'spelling'},{correct:false,status:'almost',answer:'σπιτι'});
  expect(event.rating).toBe(Rating.Hard);
  expect(event.correct).toBe(false); // для сводки навыков «Почти» остаётся ошибкой
  const after=await db.cardStates.get(item.unitKey);
  expect(after!.card.state).toBe(State.Review);
  expect(after!.card.scheduled_days).toBeGreaterThan(1);
  const stored=(await db.sessions.get(session.id))!;
  expect(stored.items.some(entry=>entry.retryOf===item.id)).toBe(true);
 });
 it('быстрый верный выбор получает Easy, неспешный — Good',async()=>{
  const {session}=await prepare();
  const fast=await answer(session,{...session.items[0],type:'recognition'},{responseTimeMs:1200});
  const slow=await answer(session,{...session.items[1],type:'recognition'},{responseTimeMs:9000});
  expect(fast.rating).toBe(Rating.Easy);
  expect(slow.rating).toBe(Rating.Good);
 });
 it('быстрое написание остаётся Good',async()=>{
  const {session}=await prepare();
  const event=await answer(session,{...session.items[0],type:'spelling'},{responseTimeMs:900});
  expect(event.rating).toBe(Rating.Good);
 });
 it('провал дополнительной попытки расписание не двигает',async()=>{
  const {session}=await prepare();
  const item=session.items[0];
  await answer(session,item,{correct:false});
  const afterFirst=await db.cardStates.get(item.unitKey);
  const stored=(await db.sessions.get(session.id))!;
  const retry=stored.items.find(entry=>entry.retryOf===item.id)!;
  expect(retry.mode).toBe('practice');
  await answer(stored,retry,{correct:false});
  const afterRetry=await db.cardStates.get(item.unitKey);
  expect(afterRetry!.version).toBe(afterFirst!.version);
  expect(afterRetry!.card.due).toEqual(afterFirst!.card.due);
 });
 it('двойное нажатие создаёт один ответ и один пересчёт FSRS',async()=>{
  const {session}=await prepare();
  await Promise.all([answer(session),answer(session)]);
  expect(await db.events.count()).toBe(1);
  expect((await db.cardStates.get(session.items[0].unitKey))!.version).toBe(1);
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
  await markIntroduced(session.id,session.items[0].unitKey,3000,db);
  await markIntroduced(session.id,session.items[0].unitKey,4000,db);
  expect(await db.events.count()).toBe(0);
  expect(await db.cardStates.count()).toBe(0);
  expect((await db.sessions.get(session.id))!.introducedKeys).toEqual([session.items[0].unitKey]);
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
  const before=await db.cardStates.get(session.items[0].unitKey);
  await answer(stored,stored.items[3],{correct:false});
  expect(await db.cardStates.get(session.items[0].unitKey)).toEqual(before);
  expect((await db.sessions.get(session.id))!.items).toHaveLength(stored.items.length);
  expect(await db.events.count()).toBe(2);
 });
 it('ошибка в написании даёт в попытке сборку, а не повторный набор',async()=>{
  const {session}=await prepare();
  const item={...session.items[0],type:'spelling' as const,options:[]};
  const stored={...session,items:[item,...session.items.slice(1)]};
  await db.sessions.put(stored);
  const parts=tiles(item.card.kind==='word'?item.card.word.greek:'');
  expect(parts.length).toBeGreaterThan(1); // слово занятия делится на слоги
  await answer(stored,item,{correct:false});
  const retry=(await db.sessions.get(session.id))!.items.find(entry=>entry.retryOf===item.id)!;
  expect(retry).toMatchObject({type:'assembly',mode:'practice',isNew:false});
  expect([...retry.options].sort()).toEqual([...parts].sort());
 });
 it('ошибка в узнавании оставляет в попытке то же задание',async()=>{
  const {session}=await prepare();
  const item=session.items.find(entry=>entry.type==='recognition')!;
  await answer(session,item,{correct:false});
  const retry=(await db.sessions.get(session.id))!.items.find(entry=>entry.retryOf===item.id)!;
  expect(retry.type).toBe('recognition');
  expect(retry.options).toEqual(item.options);
 });
 it('последняя ошибка не завершает занятие до дополнительной попытки',async()=>{
  await prepare();
  const session=await makeSession({source:source(),now,refs:[wordRef(seedWords[0].id)],random:()=>0.7});
  await db.sessions.add(session);
  await answer(session,session.items[0],{correct:false});
  const stored=(await db.sessions.get(session.id))!;
  expect(stored.status).toBe('active');
  expect(stored.items).toHaveLength(2);
  const state=await db.cardStates.get(session.items[0].unitKey);
  const event=await answer(stored,stored.items[1]);
  expect(event.rating).toBe(Rating.Easy); // быстрое верное узнавание; на расписание это всё равно не влияет
  expect((await db.sessions.get(session.id))!.status).toBe('done');
  expect(await db.cardStates.get(session.items[0].unitKey)).toEqual(state);
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
  expect(await db.cardStates.count()).toBe(0);
  expect(await db.sessions.get(session.id)).toEqual(session);
  await answer(session,session.items[0],{correct:false});
  expect(await db.events.count()).toBe(1);
 });
 it('practice не сдвигает интервалы, но сохраняет результат навыка',async()=>{
  await prepare();
  const practice=await makeSession({source:source(),now,random:()=>0.3,mode:'practice',refs:[wordRef(seedWords[0].id)]});
  await db.sessions.add(practice);
  await answer(practice,practice.items[0]);
  expect(await db.cardStates.count()).toBe(0);
  expect((await db.events.toArray())[0].mode).toBe('practice');
 });
});

describe('свои наборы',()=>{
 it('созданный набор и набор из импорта попадают в курс «Мои слова»',async()=>{
  await ensureSeed(db);
  const own=await createLesson('Мой набор',db);
  expect(own.courseId).toBe('my');
  expect((await db.lessons.get(own.id))!.courseId).toBe('my');
  const rows=parseImport('η ομπρέλα\nзонт').rows;
  const outcome=await commitImport({rows,lessonId:null,lessonTitle:'Из Quizlet'},db);
  expect((await db.lessons.get(outcome.lessonId))!.courseId).toBe('my');
  expect(await db.courses.get('my')).toMatchObject({origin:'local',subscribed:true});
 });
});

describe('импорт',()=>{
 it('связывает известное слово с набором и не создаёт дубликат',async()=>{
  await ensureSeed(db);
  const rows=parseImport('το σπίτι\nдом\nη ομπρέλα\nзонт').rows;
  const outcome=await commitImport({rows,lessonId:null,lessonTitle:'Урок 1.5'},db);
  expect(outcome).toMatchObject({added:1,linked:1});
  expect(await db.words.count()).toBe(seedWords.length+1);
  const lesson=await db.lessons.get(outcome.lessonId);
  expect(await lessonItems(outcome.lessonId,db)).toHaveLength(2);
  expect(lesson!.targetDate).toBeNull(); // дату назначит расписание
 });
 it('при ошибке не оставляет половину набора',async()=>{
  await ensureSeed(db);
  const rows=parseImport('η ομπρέλα\nзонт\nτο ποτήρι\nстакан').rows;
  await expect(commitImport({rows,lessonId:'нет-такого',lessonTitle:''},db)).rejects.toThrow();
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
 const monThu={startDate:'2026-09-14',weekdays:[1,4]};
 const legacy={id:'settings',timezone:'Asia/Nicosia',newWordsPerDay:10,sessionSize:20} as unknown as Settings;
 it('дополняет запись настроек без расписания значением по умолчанию',async()=>{
  await ensureSeed(db);
  await db.settings.put(legacy);
  expect((await source().settings()).sessionSize).toBe(20);
  expect((await db.courses.get('leeke'))!.schedule).toEqual({startDate:null,weekdays:[]});
 });
 it('снимок даёт урокам 1.3 и 1.4 дни расписания после 1.2, а план считает сроки по ним',async()=>{
  await ensureSeed(db);
  await db.courses.update('leeke',{schedule:monThu}); // как saveSettings раньше: без закрепления прошедших
  const byId=Object.fromEntries((await loadLessons(db)).map(l=>[l.id,l]));
  // Поставка не несёт дат: все четыре урока раскладывает расписание курса по порядку номеров.
  expect(byId['lesson-1-1']).toMatchObject({targetDate:'2026-09-14',dateSource:'schedule',status:'upcoming'});
  expect(byId['lesson-1-2']).toMatchObject({targetDate:'2026-09-17',dateSource:'schedule'});
  expect(byId['lesson-1-3']).toMatchObject({targetDate:'2026-09-21',dateSource:'schedule'});
  expect(byId['lesson-1-4']).toMatchObject({targetDate:'2026-09-24',dateSource:'schedule'});
  expect((await db.lessons.get('lesson-1-3'))!.targetDate).toBeNull();
  const plan=await makePlan(source(),new Date('2026-09-16T09:00:00Z'));
  expect(plan.deadlines.map(d=>[d.lessonId,d.daysLeft])).toEqual([['lesson-1-2',1],['lesson-1-3',5],['lesson-1-4',8]]);
 });
});

describe('операции над уроками при расписании',()=>{
 const monThu={startDate:'2026-09-14',weekdays:[1,4]};
 const prepare=async()=>{await ensureSeed(db);await db.courses.update('leeke',{schedule:monThu})};
 const raw=(id:string)=>db.lessons.get(id).then(l=>l!);
 const shown=scheduled;
 it('правка названия урока по расписанию не записывает дату в базу',async()=>{
  await prepare();
  await updateLesson('lesson-1-3',{title:'Урок 1.3 (мебель)'},db);
  expect(await raw('lesson-1-3')).toMatchObject({title:'Урок 1.3 (мебель)',targetDate:null});
  expect((await shown('lesson-1-3')).targetDate).toBe('2026-09-21');
 });
 it('новый набор живёт по расписанию своего курса, а не соседнего',async()=>{
  await prepare(); // расписание задано курсу leeke
  const created=await createLesson('Урок 2.1',db);
  expect(created.courseId).toBe('my');
  expect(created.targetDate).toBeNull();
  expect((await shown(created.id)).targetDate).toBeNull(); // чужое расписание набор не подхватывает
  await db.courses.update('my',{schedule:{startDate:'2026-09-28',weekdays:[1,4]}});
  expect((await shown(created.id)).targetDate).toBe('2026-09-28');
 });
 it('закрепляет прошедший урок один раз и не трогает его при смене дней недели',async()=>{
  await prepare();
  expect(await settleLessons(new Date('2026-09-22T06:00:00Z'),db)).toBe(3); // 1.1, 1.2 и 1.3
  expect(await raw('lesson-1-1')).toMatchObject({targetDate:'2026-09-14',status:'completed'});
  expect(await raw('lesson-1-2')).toMatchObject({targetDate:'2026-09-17',status:'completed'});
  expect(await raw('lesson-1-3')).toMatchObject({targetDate:'2026-09-21',status:'completed'});
  expect(await raw('lesson-1-4')).toMatchObject({targetDate:null,status:'upcoming'});
  const before=await db.lessons.toArray();
  expect(await settleLessons(new Date('2026-09-22T06:00:00Z'),db)).toBe(0);
  expect(await db.lessons.toArray()).toEqual(before);
  await saveCourseTempo('leeke',{schedule:{startDate:'2026-09-14',weekdays:[2,5]}},new Date('2026-09-22T06:00:00Z'),db);
  expect(await shown('lesson-1-3')).toMatchObject({targetDate:'2026-09-21',status:'completed',dateSource:'manual'});
  expect((await shown('lesson-1-4')).targetDate).toBe('2026-09-22');
 });
 it('закрепляет ручную дату в прошлом у предстоящего урока и не трогает будущие',async()=>{
  await prepare();
  const past=await createLesson('Повторение',db);
  await updateLesson(past.id,{targetDate:'2026-09-10'},db);
  expect(await settleLessons(new Date('2026-09-16T06:00:00Z'),db)).toBe(2); // «Повторение» и 1.1
  expect(await raw(past.id)).toMatchObject({targetDate:'2026-09-10',status:'completed'});
  expect(await raw('lesson-1-2')).toMatchObject({status:'upcoming'});
 });
 it('первое занятие в прошлом: сохранение расписания сразу закрепляет прошедшие уроки',async()=>{
  await ensureSeed(db);
  await updateLesson('lesson-1-2',{targetDate:null},db);
  expect(await saveCourseTempo('leeke',{schedule:{startDate:'2026-09-01',weekdays:[2,5]}},new Date('2026-09-16T06:00:00Z'),db)).toBe(4);
  expect(await raw('lesson-1-1')).toMatchObject({targetDate:'2026-09-01',status:'completed'});
  expect(await raw('lesson-1-2')).toMatchObject({targetDate:'2026-09-04',status:'completed'});
  expect(await raw('lesson-1-3')).toMatchObject({targetDate:'2026-09-08',status:'completed'});
  expect(await raw('lesson-1-4')).toMatchObject({targetDate:'2026-09-11',status:'completed'});
  expect((await db.courses.get('leeke'))!.schedule).toEqual({startDate:'2026-09-01',weekdays:[2,5]});
 });
 it('день считается по зоне пользователя',async()=>{
  await prepare();
  // 18 сентября 21:30 UTC — в Никосии уже 19-е, урок 1.2 прошёл (и 1.1 с 14 сентября).
  expect(await settleLessons(new Date('2026-09-18T21:30:00Z'),db)).toBe(2);
 });
 it('отметка проведённым до даты закрепляет дату и не сдвигает следующие уроки',async()=>{
  await prepare();
  const lesson=await shown('lesson-1-3');
  await updateLesson(lesson.id,{status:'completed',targetDate:lesson.targetDate},db);
  expect(await raw('lesson-1-3')).toMatchObject({targetDate:'2026-09-21',status:'completed'});
  expect((await shown('lesson-1-4')).targetDate).toBe('2026-09-24');
 });
 it('возврат в расписание очищает дату и снова даёт день по порядку',async()=>{
  await prepare();
  await updateLesson('lesson-1-3',{targetDate:'2026-09-28'},db);
  expect(await shown('lesson-1-4')).toMatchObject({targetDate:'2026-10-01'});
  await updateLesson('lesson-1-3',{targetDate:null},db);
  expect(await shown('lesson-1-3')).toMatchObject({targetDate:'2026-09-21',dateSource:'schedule'});
  expect((await shown('lesson-1-4')).targetDate).toBe('2026-09-24');
 });
});

/** Смешанный урок: карточки трёх видов в одной базе; каждая — своя единица повторения. */
describe('запись ответа на смешанном уроке',()=>{
 const K=(kind:'word'|'phrase'|'cloze',id:string)=>unitKey({kind,id});
 const prepare=async(refs=[{kind:'cloze' as const,id:'c-grafo'},{kind:'word' as const,id:'w11-27'},{kind:'phrase' as const,id:'p-grafo'},{kind:'cloze' as const,id:'c-gramma'},{kind:'cloze' as const,id:'c-paidi'},{kind:'cloze' as const,id:'c-anoixi'}])=>{
  await installMixed(db);
  const session=await makeSession({source:source(),now,random:()=>0.42,refs});
  await db.sessions.add(session);
  const item=(id:string)=>session.items.find(entry=>entry.ref.id===id)!;
  return {session,item};
 };
 const answer=(session:Awaited<ReturnType<typeof makeSession>>,item:Awaited<ReturnType<typeof makeSession>>['items'][number],extra={})=>submitAnswer({
  session,item,correct:true,answer:'',responseTimeMs:1200,activeTimeMs:5000,timezone:'Asia/Nicosia',now,database:db,...extra,
 });
 it('ошибка в пропуске даёт попытку с четырьмя вариантами ответа',async()=>{
  const {session,item}=await prepare();
  const target=item('c-grafo');
  await answer(session,target,{correct:false,answer:'διαβάζω'});
  const retry=(await db.sessions.get(session.id))!.items.find(entry=>entry.retryOf===target.id)!;
  expect(retry.type).toBe('cloze'); // тот же пропуск, но с готовыми ответами
  expect(retry.mode).toBe('practice');
  expect(retry.options).toHaveLength(4);
  expect(retry.options).toContain('Γράφω');
  expect(new Set(retry.options).size).toBe(4);
 });
 it('слово, фраза и два пропуска одного предложения независимы; ошибка в пропуске не трогает слово',async()=>{
  const {session,item}=await prepare();
  expect(item('c-grafo').type).toBe('cloze');
  expect(item('c-grafo').card.kind).toBe('cloze');
  await answer(session,item('w11-27'));
  const word=await db.cardStates.get(K('word','w11-27'));
  expect(word!.version).toBe(1);
  const event=await answer(session,item('c-grafo'),{correct:false,answer:'γραφω'});
  expect(event.rating).toBe(Rating.Again);
  expect(event).toMatchObject({ref:{kind:'cloze',id:'c-grafo'},unitKey:K('cloze','c-grafo'),snapshot:{template:'{{gap}} ένα γράμμα.',answer:'Γράφω',target:{kind:'verb-form'}}});
  expect(await db.cardStates.get(K('word','w11-27'))).toEqual(word); // слово не изменилось
  expect(await db.cardStates.get(K('cloze','c-gramma'))).toBeUndefined(); // другое скрытое место того же предложения
  expect(await db.cardStates.get(K('phrase','p-grafo'))).toBeUndefined();
  const good=await answer(session,item('c-gramma'));
  expect(good.rating).toBe(Rating.Good);
  expect(good.snapshot).toEqual({template:'Γράφω ένα {{gap}}.',answer:'γράμμα'}); // цели нет — поле отсутствует
  // Again и Good дают разные интервалы; у каждого пропуска своё состояние.
  const again=(await db.cardStates.get(K('cloze','c-grafo')))!, goodState=(await db.cardStates.get(K('cloze','c-gramma')))!;
  expect(new Date(goodState.card.due).getTime()).toBeGreaterThan(new Date(again.card.due).getTime());
  expect(again.version).toBe(1);
  expect(goodState.version).toBe(1);
 });
 it('две карточки с одинаковой целью сохраняют независимые состояния',async()=>{
  const {session,item}=await prepare();
  await answer(session,item('c-paidi'));
  expect(await db.cardStates.get(K('cloze','c-paidi'))).toBeTruthy();
  expect(await db.cardStates.get(K('cloze','c-anoixi'))).toBeUndefined();
  const first=(await db.cardStates.get(K('cloze','c-paidi')))!;
  await answer(session,item('c-anoixi'),{correct:false});
  expect(await db.cardStates.get(K('cloze','c-paidi'))).toEqual(first); // ответ на вторую карточку не тронул первую
  const second=(await db.cardStates.get(K('cloze','c-anoixi')))!;
  expect(second.unitKey).not.toBe(first.unitKey);
  expect(new Date(second.card.due).getTime()).toBeLessThan(new Date(first.card.due).getTime());
 });
 it('двойное нажатие и вторая вкладка: одно событие, не более одной дополнительной попытки, конфликт версии',async()=>{
  const {session,item}=await prepare();
  const cloze=item('c-grafo');
  await Promise.all([answer(session,cloze,{correct:false}),answer(session,cloze,{correct:false})]);
  expect(await db.events.count()).toBe(1);
  const stored=(await db.sessions.get(session.id))!;
  expect(stored.items.filter(entry=>entry.retryOf===cloze.id)).toHaveLength(1);
  expect(stored.items).toHaveLength(session.items.length+1);
  const stale={...cloze,id:`${cloze.id}-copy`};
  await expect(answer(session,stale)).rejects.toBeInstanceOf(ConflictError);
  expect(await db.events.count()).toBe(1);
  expect((await db.cardStates.get(K('cloze','c-grafo')))!.version).toBe(1);
 });
 it('дополнительная и ручная тренировки сохраняют результат без сдвига расписания',async()=>{
  const {session,item}=await prepare();
  await answer(session,item('c-grafo'),{correct:false});
  const before=await db.cardStates.get(K('cloze','c-grafo'));
  const stored=(await db.sessions.get(session.id))!;
  const retry=stored.items.find(entry=>entry.retryOf===item('c-grafo').id)!;
  expect(retry).toMatchObject({mode:'practice',isNew:false,expectedVersion:1,type:'cloze'});
  await answer(stored,retry,{correct:false});
  expect(await db.cardStates.get(K('cloze','c-grafo'))).toEqual(before);
  expect((await db.sessions.get(session.id))!.items).toHaveLength(stored.items.length); // второй попытки нет
  const practice=await makeSession({source:source(),now,random:()=>0.3,mode:'practice',refs:[{kind:'phrase',id:'p-grafo'}]});
  await db.sessions.add(practice);
  await answer(practice,practice.items[0]);
  expect(await db.cardStates.get(K('phrase','p-grafo'))).toBeUndefined();
  expect((await db.events.toArray()).filter(event=>event.ref.kind==='phrase')[0].mode).toBe('practice');
 });
 it('ошибка записи откатывает событие, состояние и попытку; упражнение остаётся доступным',async()=>{
  const {session,item}=await prepare();
  const fail=()=>{throw new Error('storage failed')};
  db.sessions.hook('updating',fail);
  await expect(answer(session,item('c-grafo'),{correct:false})).rejects.toThrow('storage failed');
  db.sessions.hook('updating').unsubscribe(fail);
  expect(await db.events.count()).toBe(0);
  expect(await db.cardStates.count()).toBe(0);
  expect(await db.sessions.get(session.id)).toEqual(session);
  await answer(session,item('c-grafo'),{correct:false});
  expect(await db.events.count()).toBe(1);
 });
 it('исправление пакета во время занятия: сессия проверяет снимок, событие хранит цель из снимка, новая сессия — обновлённый пакет',async()=>{
  const {session,item}=await prepare([{kind:'cloze',id:'c-grafo'},{kind:'cloze',id:'c-gramma'}]);
  const pack=mixedPackage();
  const bump=(cloze:(typeof pack.clozes)[number],patch:Partial<(typeof pack.clozes)[number]>)=>{const {revision:_r,...rest}=cloze;const next={...rest,...patch};return {...next,revision:clozeRevisionOf(next)}};
  const next={...pack,version:`${pack.version}-fix`,clozes:pack.clozes.map(c=>c.id==='c-grafo'?bump(c,{acceptedAnswers:['Γράφω','γράφω'],target:{kind:'verb-form',ref:'w11-27',features:{tense:'present',person:1,number:'plural'}}}):c.id==='c-gramma'?bump(c,{target:{kind:'noun-form'}}):c)};
  await applyPackage(next,db);
  // Активная сессия хранит прежние допустимые ответы и прежнюю цель.
  const live=(await db.sessions.get(session.id))!;
  const grafo=live.items.find(entry=>entry.ref.id==='c-grafo')!;
  expect(grafo.card.kind==='cloze'&&grafo.card.cloze.acceptedAnswers).toEqual(['Γράφω']);
  expect(checkTextAnswer('γραφω',(grafo.card as {cloze:Cloze}).cloze.acceptedAnswers).status).toBe('almost');
  const event=await answer(live,grafo,{correct:false,answer:'γράφω'});
  expect(event.snapshot).toEqual({template:'{{gap}} ένα γράμμα.',answer:'Γράφω',target:{kind:'verb-form',ref:'w11-27',features:{tense:'present',person:1,number:'singular'}}});
  const late=await answer(live,live.items.find(entry=>entry.ref.id==='c-gramma')!);
  expect(late.snapshot).toEqual({template:'Γράφω ένα {{gap}}.',answer:'γράμμα'}); // поздняя разметка не приписана прошлому снимку
  // Новая сессия читает исправленный пакет: варианты и цель новые, состояние и история прежние.
  const fresh=await makeSession({source:source(),now:new Date('2026-09-15T10:00:00Z'),random:()=>0.1,mode:'practice',refs:[{kind:'cloze',id:'c-grafo'},{kind:'cloze',id:'c-gramma'}]});
  const updated=fresh.items.find(entry=>entry.ref.id==='c-grafo')!.card as {cloze:Cloze};
  expect(updated.cloze.acceptedAnswers).toEqual(['Γράφω','γράφω']);
  expect(updated.cloze.target?.features).toEqual({tense:'present',person:1,number:'plural'});
  expect(fresh.items.find(entry=>entry.ref.id==='c-grafo')!.expectedVersion).toBe(1);
  expect(await db.events.count()).toBe(2);
  expect(item('c-grafo').expectedVersion).toBe(0);
 });
 it('знакомство сохраняется по ключу карточки любого вида без события и без сдвига интервала',async()=>{
  const {session,item}=await prepare();
  await markIntroduced(session.id,K('cloze','c-grafo'),3000,db);
  await markIntroduced(session.id,K('phrase','p-grafo'),4000,db);
  await markIntroduced(session.id,K('cloze','c-grafo'),5000,db);
  expect((await db.sessions.get(session.id))!.introducedKeys).toEqual([K('cloze','c-grafo'),K('phrase','p-grafo')]);
  expect(await db.events.count()).toBe(0);
  expect(await db.cardStates.count()).toBe(0);
  await expect(markIntroduced(session.id,K('cloze','нет'),1,db)).rejects.toThrow(/недоступна/);
  expect(item('p-grafo').isNew).toBe(true);
 });
});
