import {db, type LexiDatabase} from './db';
import {localDay, nextState, objectiveExercise, spaceSingleIntroduction} from '../domain/learning';
import {normalize, wordKey, type ImportRow} from '../domain/import';
import {scheduleLessons} from '../domain/schedule';
import {fillSettings, type Asset, type Lesson, type ReviewEvent, type Session, type SessionItem, type Settings, type Word} from '../domain/types';

export class ConflictError extends Error {constructor(){super('Слово уже отвечено в другой вкладке. Обновите страницу.')}}
const stamp=(now:Date)=>now.toISOString();
export const newId=(prefix:string)=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

export interface AnswerInput {
 session:Session; item:SessionItem; correct:boolean; answer:string;
 responseTimeMs:number; activeTimeMs:number; timezone:string; now?:Date; database?:LexiDatabase;
}
/** Один ответ = одно событие, один пересчёт FSRS и одна позиция сессии, в одной транзакции. */
export async function submitAnswer({session,item,correct,answer,responseTimeMs,activeTimeMs,timezone,now=new Date(),database=db}:AnswerInput):Promise<ReviewEvent>{
 if(typeof correct!=='boolean'||item.type==='recall')throw new Error('Нужен ответ на объективное задание');
 const rating=correct?3:1;
 const eventId=`e-${item.id}`;
 return database.transaction('rw',database.events,database.states,database.sessions,async()=>{
  const existing=await database.events.get(eventId);
  if(existing)return existing; // повторное нажатие не создаёт второй ответ
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
  const answered=items.filter(entry=>entry.eventId).length;
  await database.sessions.put({...stored,items,index:answered,activeTimeMs,status:answered>=items.length?'done':'active'});
  return event;
 });
}
export const saveSession=(session:Session,database:LexiDatabase=db)=>database.sessions.put(session);
export const endSession=async(session:Session,database:LexiDatabase=db)=>{await database.sessions.put({...session,status:session.index>=session.items.length?'done':'ended'})};

export async function saveWord(word:Word,database:LexiDatabase=db){
 const previous=await database.words.get(word.id);
 const greekChanged=previous&&normalize(previous.greek)!==normalize(word.greek);
 await database.words.put({...word,verified:greekChanged?false:word.verified,updatedAt:stamp(new Date())});
}
/** Мягкое удаление: история ответов остаётся достоверной. */
export async function deleteWord(id:string,database:LexiDatabase=db){
 await database.words.update(id,{deletedAt:stamp(new Date())});
}
export type LessonPatch=Partial<Pick<Lesson,'title'|'targetDate'|'status'|'wordIds'>>;
/** Частичная правка сырой записи: вычисленная по расписанию дата из снимка не попадает в базу. */
export async function updateLesson(id:string,patch:LessonPatch,database:LexiDatabase=db){
 await database.lessons.update(id,{...patch,updatedAt:stamp(new Date())});
}
export async function removeFromLesson(lessonId:string,wordId:string,database:LexiDatabase=db){
 const lesson=await database.lessons.get(lessonId);
 if(lesson)await updateLesson(lessonId,{wordIds:lesson.wordIds.filter(id=>id!==wordId)},database);
}
/** Новый набор без даты: её назначит расписание, а своя дата задаётся на экране урока. */
export async function createLesson(title:string,database:LexiDatabase=db):Promise<Lesson>{
 const now=stamp(new Date());
 const lesson:Lesson={id:newId('lesson'),title,targetDate:null,status:'upcoming',wordIds:[],createdAt:now,updatedAt:now};
 await database.lessons.add(lesson);
 return lesson;
}
/**
 * Урок, чей день по расписанию уже прошёл, становится проведённым, а дата — его собственной,
 * поэтому дальнейшие изменения расписания его не трогают. Повторный вызов ничего не пишет.
 */
export async function settleLessons(now:Date,database:LexiDatabase=db):Promise<number>{
 return database.transaction('rw',database.lessons,database.settings,async()=>{
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
 return database.transaction('rw',database.words,database.lessons,async()=>{
  const existing=await database.words.toArray();
  const byKey=new Map(existing.filter(w=>!w.deletedAt).map(w=>[wordKey(w.greek,w.russian),w]));
  const lesson=plan.lessonId
   ?await database.lessons.get(plan.lessonId)
   :{id:newId('lesson'),title:plan.lessonTitle,targetDate:null,status:'upcoming' as const,wordIds:[],createdAt:now,updatedAt:now};
  if(!lesson)throw new Error('Набор не найден');
  const wordIds=[...lesson.wordIds];
  let added=0,linked=0,conflicts=0;
  for(const row of plan.rows){
   const key=wordKey(row.greek,row.russian);
   const known=byKey.get(key);
   if(known){
    if(!wordIds.includes(known.id)){wordIds.push(known.id);linked++}
    continue;
   }
   if(existing.some(w=>!w.deletedAt&&normalize(w.greek)===normalize(row.greek)))conflicts++;
   const word:Word={
    id:newId('w'),greek:row.greek,russian:row.russian,ipa:row.ipa,segments:[],examples:[],
    sourceMastered:row.sourceMastered,verified:false,source:row.ipa?'Импорт пользователя (фонетика не проверена)':undefined,
    createdAt:now,updatedAt:now,
   };
   await database.words.add(word);
   byKey.set(key,word);
   wordIds.push(word.id);
   added++;
  }
  await database.lessons.put({...lesson,wordIds,updatedAt:now});
  return {lessonId:lesson.id,added,linked,conflicts};
 });
}
export async function saveSettings(settings:Settings,database:LexiDatabase=db){await database.settings.put(settings)}

/** Старые неотвеченные recall заменяются один раз, история остаётся неизменной. */
export async function prepareObjectiveSession(id:string,database:LexiDatabase=db):Promise<void>{
 await database.transaction('rw',database.sessions,database.words,async()=>{
  const session=await database.sessions.get(id);
  if(!session||session.objectiveVersion===1)return;
  const pool=(await database.words.toArray()).filter(word=>!word.deletedAt);
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
