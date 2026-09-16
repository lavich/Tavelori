import Dexie from 'dexie';
import {db, indexWord, type LexiDatabase} from './db';
import {optionPool} from './queries';
import {localDay, nextState, objectiveExercise, OPTION_POOL, spaceSingleIntroduction} from '../domain/learning';
import {normalize, wordKey, type ImportRow} from '../domain/import';
import {scheduleLessons} from '../domain/schedule';
import {fillSettings, type Asset, type Lesson, type ReviewEvent, type Session, type SessionItem, type Settings, type Word} from '../domain/types';
import {syncEvents} from '../sync/events';

/** Отметка «есть неопубликованные изменения» пишется в той же транзакции, что и само изменение. */
export const DIRTY_KEY='sync:dirty';
const markChanged=(database:LexiDatabase)=>database.meta.put({key:DIRTY_KEY,value:'1'});
const announceChange=()=>syncEvents.emit('changed');
const settled=(items:SessionItem[])=>items.filter(entry=>entry.eventId||entry.skipped).length;

export class ConflictError extends Error {constructor(){super('Слово уже отвечено в другой вкладке. Обновите страницу.')}}
const stamp=(now:Date)=>now.toISOString();
export const newId=(prefix:string)=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

export interface AnswerInput {
 session:Session; item:SessionItem; correct:boolean; answer:string;
 responseTimeMs:number; activeTimeMs:number; timezone:string; now?:Date; database?:LexiDatabase;
}
/** Один ответ = одно событие, один пересчёт FSRS и одна позиция сессии, в одной транзакции. */
export async function submitAnswer(input:AnswerInput):Promise<ReviewEvent>{
 return (await recordAnswer(input)).event;
}
/** `created:false` — ответ уже был записан (повторное нажатие, вторая вкладка): отклик и синхронизация не повторяются. */
export async function recordAnswer({session,item,correct,answer,responseTimeMs,activeTimeMs,timezone,now=new Date(),database=db}:AnswerInput):Promise<{event:ReviewEvent;created:boolean}>{
 if(typeof correct!=='boolean'||item.type==='recall')throw new Error('Нужен ответ на объективное задание');
 const rating=correct?3:1;
 const eventId=`e-${item.id}`;
 const result=await database.transaction('rw',database.events,database.states,database.sessions,database.meta,async()=>{
  const existing=await database.events.get(eventId);
  if(existing)return {event:existing,created:false}; // повторное нажатие не создаёт второй ответ
  const state=await database.states.get(item.wordId);
  if((state?.version??0)!==item.expectedVersion)throw new ConflictError();
  const scheduled=item.mode==='scheduled';
  const updated=scheduled?nextState(state,item.wordId,rating,now):undefined;
  const event:ReviewEvent={
   id:eventId,sessionId:session.id,itemId:item.id,wordId:item.wordId,
   snapshot:{greek:item.word.greek,russian:item.word.russian},type:item.type,mode:item.mode,
   rating,correct,answer,createdAt:stamp(now),localDate:localDay(now,timezone),responseTimeMs,
   before:state?.card,after:updated?.card,
  };
  await database.events.add(event);
  if(updated)await database.states.put(updated);
  // Позиция сессии = сколько упражнений уже отвечено; экран сам решает, когда листать дальше.
  const stored=await database.sessions.get(session.id)??session;
  const items=stored.items.map(entry=>entry.id===item.id?{...entry,eventId}:entry);
  if(!correct&&!items.some(entry=>entry.retryOf&&entry.wordId===item.wordId)){
   const position=items.findIndex(entry=>entry.id===item.id);
   items.splice(Math.min(position+3,items.length),0,{
    ...item,id:`${item.id}-retry`,isNew:false,mode:'practice',
    expectedVersion:updated?.version??state?.version??0,eventId:undefined,retryOf:item.id,
   });
  }
  const answered=settled(items);
  await database.sessions.put({...stored,items,index:answered,activeTimeMs,status:answered>=items.length?'done':'active'});
  await markChanged(database);
  return {event,created:true};
 });
 if(result.created)announceChange();
 return result;
}
/**
 * Пропуск без оценки знания: аудио недоступно или не воспроизвелось. События нет, интервалы не меняются,
 * упражнение считается пройденным для позиции занятия.
 */
export async function skipItem(sessionId:string,itemId:string,activeTimeMs:number,database:LexiDatabase=db):Promise<void>{
 await database.transaction('rw',database.sessions,async()=>{
  const session=await database.sessions.get(sessionId);
  if(!session)throw new Error('Занятие недоступно');
  const items=session.items.map(entry=>entry.id===itemId&&!entry.eventId?{...entry,skipped:true}:entry);
  const answered=settled(items);
  await database.sessions.put({...session,items,index:answered,activeTimeMs,status:answered>=items.length?'done':'active'});
 });
}
export const saveSession=(session:Session,database:LexiDatabase=db)=>database.sessions.put(session);
export const endSession=async(session:Session,database:LexiDatabase=db)=>{await database.sessions.put({...session,status:session.index>=session.items.length?'done':'ended'})};

/** Правка поставленного слова помечается локальной: обновление пакета её не перезапишет. */
export async function saveWord(word:Word,database:LexiDatabase=db){
 const previous=await database.words.get(word.id);
 const greekChanged=previous&&normalize(previous.greek)!==normalize(word.greek);
 const edited=(previous?.revision??word.revision)?true:word.edited;
 await database.words.put(indexWord({...word,verified:greekChanged?false:word.verified,updatedAt:stamp(new Date()),...(edited?{edited}:{})}));
}
/** Мягкое удаление: история ответов остаётся достоверной. */
export async function deleteWord(id:string,database:LexiDatabase=db){
 await database.words.update(id,{deletedAt:stamp(new Date())});
}
export type LessonPatch=Partial<Pick<Lesson,'title'|'targetDate'|'status'>>;
/** Частичная правка сырой записи: вычисленная по расписанию дата из снимка не попадает в базу. */
export async function updateLesson(id:string,patch:LessonPatch,database:LexiDatabase=db){
 await database.transaction('rw',database.lessons,database.meta,async()=>{
  await database.lessons.update(id,{...patch,updatedAt:stamp(new Date())});
  await markChanged(database);
 });
 announceChange();
}
/** Для поставленного урока удаление связи запоминается, чтобы обновление пакета её не вернуло. */
export async function removeFromLesson(lessonId:string,wordId:string,database:LexiDatabase=db){
 await database.transaction('rw',database.lessons,database.lessonWords,database.packages,database.meta,async()=>{
  await database.lessonWords.delete([lessonId,wordId]);
  const pack=await database.packages.get(lessonId);
  if(pack&&!pack.removed.includes(wordId))await database.packages.put({...pack,removed:[...pack.removed,wordId]});
  await updateLesson(lessonId,{},database);
 });
}
export async function linkWords(lessonId:string,wordIds:string[],database:LexiDatabase=db):Promise<number>{
 const existing=await database.lessonWords.where('[lessonId+position]').between([lessonId,Dexie.minKey],[lessonId,Dexie.maxKey]).toArray();
 const known=new Set(existing.map(link=>link.wordId));
 let position=existing.reduce((max,link)=>Math.max(max,link.position+1),0);
 const fresh=wordIds.filter(id=>!known.has(id)&&known.add(id));
 await database.lessonWords.bulkAdd(fresh.map(wordId=>({lessonId,wordId,position:position++})));
 return fresh.length;
}
/** Новый набор без даты: её назначит расписание, а своя дата задаётся на экране урока. */
export async function createLesson(title:string,database:LexiDatabase=db):Promise<Lesson>{
 const now=stamp(new Date());
 const lesson:Lesson={id:newId('lesson'),title,targetDate:null,status:'upcoming',createdAt:now,updatedAt:now};
 await database.lessons.add(lesson);
 return lesson;
}
/**
 * Урок, чей день по расписанию уже прошёл, становится проведённым, а дата — его собственной,
 * поэтому дальнейшие изменения расписания его не трогают. Повторный вызов ничего не пишет.
 */
export async function settleLessons(now:Date,database:LexiDatabase=db):Promise<number>{
 return database.transaction('rw',database.lessons,database.settings,database.meta,async()=>{
  const settings=fillSettings(await database.settings.get('settings'));
  const today=localDay(now,settings.timezone);
  const stored=await database.lessons.toArray();
  const raw=new Map(stored.map(lesson=>[lesson.id,lesson]));
  const passed=scheduleLessons(stored,settings.schedule)
   .filter(lesson=>lesson.targetDate&&lesson.targetDate<today&&(raw.get(lesson.id)!.status!=='completed'||!raw.get(lesson.id)!.targetDate));
  for(const lesson of passed)await updateLesson(lesson.id,{targetDate:lesson.targetDate,status:'completed'},database);
  return passed.length;
 });
}
export async function putAsset(asset:Asset,database:LexiDatabase=db){await database.assets.put(asset)}

export interface ImportPlan {rows:ImportRow[];lessonId:string|null;lessonTitle:string}
export interface ImportOutcome {lessonId:string;added:number;linked:number;conflicts:number}
export async function commitImport(plan:ImportPlan,database:LexiDatabase=db):Promise<ImportOutcome>{
 const now=stamp(new Date());
 return database.transaction('rw',database.words,database.lessons,database.lessonWords,async()=>{
  const lesson=plan.lessonId
   ?await database.lessons.get(plan.lessonId)
   :{id:newId('lesson'),title:plan.lessonTitle,targetDate:null,status:'upcoming' as const,createdAt:now,updatedAt:now};
  if(!lesson)throw new Error('Набор не найден');
  const wordIds:string[]=[];
  let added=0,conflicts=0;
  for(const row of plan.rows){
   const known=await database.words.where('key').equals(wordKey(row.greek,row.russian)).filter(word=>!word.deletedAt).first();
   if(known){if(!wordIds.includes(known.id))wordIds.push(known.id);continue}
   if(await database.words.where('greekKey').equals(normalize(row.greek)).filter(word=>!word.deletedAt).count())conflicts++;
   const word:Word={
    id:newId('w'),greek:row.greek,russian:row.russian,ipa:row.ipa,segments:[],examples:[],
    sourceMastered:row.sourceMastered,verified:false,source:row.ipa?'Импорт пользователя (фонетика не проверена)':undefined,
    createdAt:now,updatedAt:now,
   };
   await database.words.add(indexWord(word));
   wordIds.push(word.id);
   added++;
  }
  await database.lessons.put({...lesson,updatedAt:now});
  const linked=await linkWords(lesson.id,wordIds,database);
  return {lessonId:lesson.id,added,linked:linked-added,conflicts};
 });
}
export async function saveSettings(settings:Settings,database:LexiDatabase=db){
 await database.transaction('rw',database.settings,database.meta,async()=>{await database.settings.put(settings);await markChanged(database)});
 announceChange();
}
/** Дата первого занятия может быть в прошлом: уроки, чьи дни уже прошли, закрепляются сразу, не дожидаясь запуска. */
export async function saveSchedule(settings:Settings,now:Date,database:LexiDatabase=db):Promise<number>{
 await saveSettings(settings,database);
 return settleLessons(now,database);
}

/** Старые неотвеченные recall заменяются один раз, история остаётся неизменной. */
export async function prepareObjectiveSession(id:string,database:LexiDatabase=db):Promise<void>{
 await database.transaction('rw',database.sessions,database.words,async()=>{
  const session=await database.sessions.get(id);
  if(!session||session.objectiveVersion===1)return;
  const pool=await optionPool(OPTION_POOL,database);
  const items=session.items.map(item=>item.type==='recall'&&!item.eventId
   ?{...item,...objectiveExercise(item.word,pool)}:item);
  await database.sessions.put({...session,items:spaceSingleIntroduction(items),objectiveVersion:1,introducedWordIds:session.introducedWordIds??[]});
 });
}

/** Просмотр не является ответом и не меняет расписание. */
export async function markIntroduced(id:string,wordId:string,activeTimeMs:number,database:LexiDatabase=db):Promise<void>{
 await database.transaction('rw',database.sessions,async()=>{
  const session=await database.sessions.get(id);
  if(!session||session.status!=='active')throw new Error('Занятие недоступно');
  if(!session.items.some(item=>item.wordId===wordId&&item.isNew&&!item.eventId))throw new Error('Слово недоступно');
  await database.sessions.put({...session,introducedWordIds:[...new Set([...(session.introducedWordIds??[]),wordId])],activeTimeMs});
 });
}
