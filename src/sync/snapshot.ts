import type {Card} from 'ts-fsrs';
import {isStandardWord, SEED_LESSON, type LexiDatabase, type StoredWord} from '../storage/db';
import {byTime, emptySkills, emptyStats, foldSkill, foldStats, type SkillSummary, type StatsSummary} from '../domain/skills';
import {fillSettings, type LearningState, type ReviewEvent, type Word} from '../domain/types';
import {loadSettings} from '../storage/queries';
import {SNAPSHOT_FORMAT, type Clock, type CompactLesson, type CompactSnapshot, type CompactState, type SerializedCard} from './types';

/** Ключи служебных записей синхронизации в `meta`; префикс исключает их из копии. */
export const META={
 device:'sync:device',clock:'sync:clock',applied:'sync:applied',dirty:'sync:dirty',lastOk:'sync:lastOk',
 restored:'sync:restored',pendingLessons:'sync:pendingLessons',welcomed:'sync:welcomed',
} as const;
export const KEEP_DAYS=14;

export const serializeCard=(card:Card):SerializedCard=>({...card,due:new Date(card.due).toISOString(),last_review:card.last_review?new Date(card.last_review).toISOString():undefined});
export const reviveCard=(card:SerializedCard):Card=>({...card,due:new Date(card.due),last_review:card.last_review?new Date(card.last_review):undefined});
const serializeState=(state:LearningState):CompactState=>({wordId:state.wordId,card:serializeCard(state.card),introducedAt:state.introducedAt,version:state.version});
const reviveState=(state:CompactState):LearningState=>({wordId:state.wordId,card:reviveCard(state.card),introducedAt:state.introducedAt,version:state.version});

export const readMeta=async(database:LexiDatabase,key:string)=>(await database.meta.get(key))?.value??null;
export const writeMeta=(database:LexiDatabase,key:string,value:string|null)=>value===null?database.meta.delete(key):database.meta.put({key,value});
export const parseClock=(raw:string|null):Clock=>{try{const clock=raw?JSON.parse(raw):{};return clock&&typeof clock==='object'?clock:{}}catch{return {}}};

const isStandardLesson=(id:string,packages:Set<string>)=>packages.has(id)||SEED_LESSON.test(id);
async function standardWords(database:LexiDatabase,ids:string[]):Promise<Map<string,Word>>{
 const words=await database.words.bulkGet(ids);
 return new Map(words.filter((word):word is StoredWord=>!!word&&isStandardWord(word)).map(word=>[word.id,word]));
}

/**
 * Компактный снимок из локальной базы: база предыдущего снимка плюс локальные события после её отсечки.
 * Вызывается внутри транзакции чтения-записи вместе с `commitBase`, чтобы отсечка совпала с прочитанным.
 */
export async function buildSnapshot(database:LexiDatabase,now:Date):Promise<CompactSnapshot>{
 const base=await database.baseSummary.get('base');
 const settings=await loadSettings(database);
 const packages=new Set((await database.packages.toArray()).map(pack=>pack.lessonId));
 const lessons:CompactLesson[]=(await database.lessons.toArray()).filter(lesson=>isStandardLesson(lesson.id,packages))
  .map(lesson=>({id:lesson.id,targetDate:lesson.targetDate,status:lesson.status,updatedAt:lesson.updatedAt}));
 const rawStates=await database.states.toArray();
 const known=await standardWords(database,rawStates.map(state=>state.wordId));
 const states=rawStates.filter(state=>known.has(state.wordId)).map(serializeState);
 for(const row of await database.syncStash.toArray())if(!known.has(row.wordId))states.push(row.state);
 const fresh:ReviewEvent[]=byTime(base?await database.events.where('createdAt').above(base.asOf).toArray():await database.events.toArray());
 const skills=new Map<string,SkillSummary>((await database.baseSkills.toArray()).map(row=>[row.wordId,row.skills]));
 const eventWords=await standardWords(database,[...new Set(fresh.map(event=>event.wordId))]);
 for(const event of fresh)if(eventWords.has(event.wordId))skills.set(event.wordId,foldSkill(skills.get(event.wordId)??emptySkills(),event));
 const stats=fresh.reduce((summary,event)=>foldStats(summary,event,KEEP_DAYS),base?.stats??emptyStats());
 return {
  format:SNAPSHOT_FORMAT,createdAt:now.toISOString(),
  settings:{timezone:settings.timezone,newWordsPerDay:settings.newWordsPerDay,sessionSize:settings.sessionSize,schedule:settings.schedule},
  lessons,packages:[...packages].sort(),
  states:states.sort((a,b)=>a.wordId.localeCompare(b.wordId)),
  skills:[...skills].map(([wordId,summary])=>({wordId,skills:summary})).sort((a,b)=>a.wordId.localeCompare(b.wordId)),
  stats:{...stats,days:stats.days.slice(-KEEP_DAYS)},
 };
}
/** Новая база: отсечка — момент сборки, локальные события до неё считаются учтёнными в снимке. */
export async function commitBase(database:LexiDatabase,snapshot:CompactSnapshot,versionId:string,asOf:string){
 await database.baseSkills.clear();
 await database.baseSkills.bulkPut(snapshot.skills);
 await database.baseSummary.put({id:'base',asOf,versionId,stats:snapshot.stats});
}
export const SNAPSHOT_TABLES=['baseSkills','baseSummary','states','words','events','settings','lessons','packages','syncStash','meta'] as const;
/** Сборка и фиксация базы одной транзакцией: ответ, записанный после, гарантированно попадёт в следующую версию. */
export async function buildAndCommit(database:LexiDatabase,now:Date,versionId:string):Promise<CompactSnapshot>{
 return database.transaction('rw',SNAPSHOT_TABLES.map(name=>database.table(name)),async()=>{
  const snapshot=await buildSnapshot(database,now);
  await commitBase(database,snapshot,versionId,snapshot.createdAt);
  return snapshot;
 });
}

export type PendingLessons=Record<string,CompactLesson>;
export const readPending=async(database:LexiDatabase):Promise<PendingLessons>=>{try{return JSON.parse(await readMeta(database,META.pendingLessons)??'{}')}catch{return {}}};

/**
 * Применение целой версии одной транзакцией: настройки, даты стандартных уроков, состояния FSRS стандартных слов,
 * база навыков и сводок. История ответов остаётся локальной. Состояния неизвестных слов откладываются
 * до установки пакета, а не обнуляются и не попадают в план.
 */
export async function applySnapshot(database:LexiDatabase,snapshot:CompactSnapshot,versionId:string,clock:Clock,now:Date):Promise<void>{
 await database.transaction('rw',SNAPSHOT_TABLES.map(name=>database.table(name)),async()=>{
  const current=await loadSettings(database);
  await database.settings.put(fillSettings({...current,...snapshot.settings}));
  const pending:PendingLessons={};
  for(const lesson of snapshot.lessons){
   if(await database.lessons.get(lesson.id))await database.lessons.update(lesson.id,{targetDate:lesson.targetDate,status:lesson.status,updatedAt:lesson.updatedAt});
   else pending[lesson.id]=lesson;
  }
  await writeMeta(database,META.pendingLessons,Object.keys(pending).length?JSON.stringify(pending):null);
  const incoming=new Set(snapshot.states.map(state=>state.wordId));
  const local=await database.states.toArray();
  const localStandard=await standardWords(database,local.map(state=>state.wordId));
  // Стандартные слова, которых нет в выбранной версии, снова становятся новыми; пользовательские не трогаем.
  await database.states.bulkDelete(local.filter(state=>localStandard.has(state.wordId)&&!incoming.has(state.wordId)).map(state=>state.wordId));
  const known=await standardWords(database,[...incoming]);
  await database.syncStash.clear();
  for(const state of snapshot.states){
   if(known.has(state.wordId))await database.states.put(reviveState(state));
   else await database.syncStash.put({wordId:state.wordId,state});
  }
  await commitBase(database,snapshot,versionId,now.toISOString());
  await writeMeta(database,META.applied,versionId);
  await writeMeta(database,META.clock,JSON.stringify(clock));
  await writeMeta(database,META.dirty,null);
 });
}

/**
 * Пакет установлен: отложенные состояния его слов переходят в обычную таблицу, дата урока — из снимка.
 * Вызывается внутри транзакции установки пакета.
 */
export async function adoptStash(database:LexiDatabase,lessonId:string,wordIds:string[]):Promise<void>{
 const rows=(await database.syncStash.bulkGet(wordIds)).filter((row):row is NonNullable<typeof row>=>!!row);
 for(const row of rows){
  if(!await database.states.get(row.wordId))await database.states.put(reviveState(row.state));
  await database.syncStash.delete(row.wordId);
 }
 const pending=await readPending(database);
 const lesson=pending[lessonId];
 if(lesson){
  await database.lessons.update(lessonId,{targetDate:lesson.targetDate,status:lesson.status,updatedAt:lesson.updatedAt});
  delete pending[lessonId];
  await writeMeta(database,META.pendingLessons,Object.keys(pending).length?JSON.stringify(pending):null);
 }
}

export interface SnapshotDescription {words:number;answers:number;lastDay:string|null;lessons:number}
export const describeSnapshot=(snapshot:CompactSnapshot):SnapshotDescription=>({
 words:snapshot.states.length,answers:snapshot.stats.answers,lessons:snapshot.lessons.length,
 lastDay:snapshot.stats.days.length?snapshot.stats.days[snapshot.stats.days.length-1].date:null,
});
/** Есть ли локальный прогресс, который нельзя молча заменить облаком при первом подключении. */
export const hasLocalProgress=async(database:LexiDatabase)=>(await database.states.count())>0||(await database.events.count())>0;

