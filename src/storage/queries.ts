import Dexie from 'dexie';
import {State} from 'ts-fsrs';
import {db, isStandardWord, searchTokens, type LexiDatabase, type StoredWord} from './db';
import {addDays, localDay, type SessionSource} from '../domain/learning';
import {byTime, emptyStats, emptySkills, foldStats, succeeded, summarizeEvents, type DaySummary} from '../domain/skills';
import {normalize, wordKey} from '../domain/import';
import {scheduleCourses} from '../domain/schedule';
import {lessonProgress, type LessonProgress, type StatsSource} from '../domain/stats';
import {defaultSchedule, DEFAULT_NEW_WORDS_PER_DAY, fillSettings, LOCAL_COURSE, type LearningState, type Lesson, type LessonWord, type Word} from '../domain/types';

const span=(first:string)=>[[first,Dexie.minKey],[first,Dexie.maxKey]] as const;
export const PAGE_SIZE=50;

export const loadSettings=async(database:LexiDatabase=db)=>fillSettings(await database.settings.get('settings'));
/** Уроки с датами по расписанию: единственное место, где даты вычисляются для чтения. */
export const loadLessons=async(database:LexiDatabase=db)=>scheduleCourses(await database.lessons.toArray(),await database.courses.toArray());
export const lessonLinks=(lessonId:string,database:LexiDatabase=db):Promise<LessonWord[]>=>
 database.lessonWords.where('[lessonId+position]').between(...span(lessonId)).toArray();
export const lessonWordCount=(lessonId:string,database:LexiDatabase=db)=>database.lessonWords.where('[lessonId+position]').between(...span(lessonId)).count();
export const deletedWordIds=async(database:LexiDatabase=db)=>new Set(await database.words.where('deletedAt').above('').primaryKeys());
export async function liveWordIds(ids:string[],database:LexiDatabase=db):Promise<Set<string>>{
 if(!ids.length)return new Set();
 const [present,deleted]=await Promise.all([database.words.where('id').anyOf(ids).primaryKeys(),deletedWordIds(database)]);
 return new Set(present.filter(id=>!deleted.has(id)));
}
export const statesOf=async(ids:string[],database:LexiDatabase=db)=>new Map((await database.states.bulkGet(ids)).filter((s):s is LearningState=>!!s).map(s=>[s.wordId,s]));
export const liveWords=async(ids:string[],database:LexiDatabase=db):Promise<StoredWord[]>=>
 (await database.words.bulkGet(ids)).filter((w):w is StoredWord=>!!w&&!w.deletedAt);

export function dexieSource(database:LexiDatabase=db):SessionSource&StatsSource{
 return {
  settings:()=>loadSettings(database),
  lessons:()=>loadLessons(database),
  lessonWordIds:async lessonId=>(await lessonLinks(lessonId,database)).map(link=>link.wordId),
  courses:async()=>{
   const rows=await database.courses.toArray();
   // База без курсов (старый профиль до первого запуска приложения) планируется как один локальный курс.
   return rows.length?rows:[{id:LOCAL_COURSE,title:'Мои слова',origin:'local' as const,subscribed:true,
    schedule:defaultSchedule,newWordsPerDay:DEFAULT_NEW_WORDS_PER_DAY,createdAt:'',updatedAt:''}];
  },
  introducedTodayByCourse:async(today,timezone)=>{
   const rows=await database.states.where('introducedAt').between(`${addDays(today,-1)}T00:00:00.000Z`,`${addDays(today,2)}T00:00:00.000Z`).toArray();
   const wordIds=rows.filter(state=>localDay(new Date(state.introducedAt),timezone)===today).map(state=>state.wordId);
   const counts=new Map<string,number>();
   if(!wordIds.length)return counts;
   // Введённых за день немного — не больше суммы пределов, поэтому связи читаются точечно.
   const links=await database.lessonWords.where('wordId').anyOf(wordIds).toArray();
   const lessons=new Map((await database.lessons.bulkGet([...new Set(links.map(link=>link.lessonId))])).filter(Boolean).map(lesson=>[lesson!.id,lesson!.courseId??LOCAL_COURSE]));
   for(const wordId of wordIds){
    const owners=new Set(links.filter(link=>link.wordId===wordId).map(link=>lessons.get(link.lessonId)??LOCAL_COURSE));
    if(!owners.size)owners.add(LOCAL_COURSE);
    for(const courseId of owners)counts.set(courseId,(counts.get(courseId)??0)+1);
   }
   return counts;
  },
  statesOf:ids=>statesOf(ids,database),
  liveWordIds:ids=>liveWordIds(ids,database),
  dueStates:now=>database.states.where('card.due').belowOrEqual(now).toArray(),
  lessonBoundWordIds:async ids=>new Set(ids.length?(await database.lessonWords.where('wordId').anyOf(ids).toArray()).map(link=>link.wordId):[]),
  scanLiveWordIds:async(after,limit)=>{
   const deleted=await deletedWordIds(database);
   let cursor=after;
   for(;;){
    const keys=await database.words.where('id').above(cursor??Dexie.minKey).limit(limit).primaryKeys();
    if(!keys.length)return [];
    const live=keys.filter(id=>!deleted.has(id));
    if(live.length)return live;
    cursor=keys[keys.length-1];
   }
  },
  wordsOf:ids=>liveWords(ids,database),
  skillsOf:async word=>{
   const base=await database.baseSummary.get('base');
   // Без базы или для пользовательского слова сводка считается по всей локальной истории.
   if(!base||!isStandardWord(word))return summarizeEvents(word.id,await database.events.where('[wordId+createdAt]').between(...span(word.id)).toArray());
   const row=await database.baseSkills.get(word.id);
   return summarizeEvents(word.id,await eventsAfter(database,word.id,base.asOf),row?.skills??emptySkills());
  },
  optionPool:want=>optionPool(want,database),
  daysBetween:async(from,to)=>{
   const base=await database.baseSummary.get('base');
   const local=await database.events.where('localDate').between(from,to,true,true).toArray();
   const fresh=base?local.filter(event=>event.createdAt>base.asOf):local;
   const start:DaySummary[]=(base?.stats.days??[]).filter(day=>day.date>=from&&day.date<=to).map(day=>({...day,wordIds:[...day.wordIds]}));
   return byTime(fresh).reduce((summary,event)=>foldStats(summary,event,Infinity),{...emptyStats(),days:start}).days;
  },
  recentByType:async(type,limit)=>{
   const base=await database.baseSummary.get('base');
   const range=base?database.events.where('[type+createdAt]').between([type,base.asOf],[type,Dexie.maxKey],false,true):database.events.where('[type+createdAt]').between(...span(type));
   const local=(await range.reverse().limit(limit).toArray()).reverse().map(succeeded);
   return [...(base?.stats.recentByType[type]??[]),...local].slice(-limit);
  },
  dueWordIdsBefore:instant=>database.states.where('card.due').below(instant).primaryKeys(),
  deletedWordIds:()=>deletedWordIds(database),
  wordCount:()=>database.words.count(),
  eachState:visit=>database.states.each(visit),
  totals:async()=>{
   const base=await database.baseSummary.get('base');
   if(!base)return {answers:await database.events.count(),words:(await database.events.orderBy('wordId').uniqueKeys()).length};
   const fresh=await database.events.where('createdAt').above(base.asOf).toArray();
   const known=new Set(base.stats.answeredWordIds);
   return {answers:base.stats.answers+fresh.length,words:known.size+new Set(fresh.map(event=>event.wordId).filter(id=>!known.has(id))).size};
  },
 };
}

/** События слова строго после отсечки базы: включённые в базу ответы не учитываются второй раз. */
export const eventsAfter=(database:LexiDatabase,wordId:string,asOf:string)=>
 database.events.where('[wordId+createdAt]').between([wordId,asOf],[wordId,Dexie.maxKey],false,true).toArray();

/**
 * Пул вариантов ответа. Маленький словарь берётся целиком в порядке идентификаторов, поэтому совпадает
 * с полным снимком; большой — несколькими случайными порциями без чтения всей таблицы.
 */
export async function optionPool(want:number,database:LexiDatabase=db):Promise<Word[]>{
 const total=await database.words.count();
 if(total<=want)return (await database.words.toArray()).filter(word=>!word.deletedAt);
 const chunk=Math.ceil(want/4);
 const seen=new Map<string,Word>();
 for(let draw=0;draw<8&&seen.size<want;draw++){
  const offset=Math.floor(Math.random()*Math.max(1,total-chunk));
  for(const word of await database.words.orderBy('id').offset(offset).limit(chunk).toArray()) if(!word.deletedAt)seen.set(word.id,word);
 }
 return [...seen.values()];
}

export interface LessonView extends Lesson {wordCount:number;progress?:LessonProgress}
/** С прогрессом состояния слов урока читаются один раз здесь, по ключам связей; экраны получают группы готовыми. */
export async function lessonViews(database:LexiDatabase=db,withProgress=false):Promise<LessonView[]>{
 const lessons=await loadLessons(database);
 return Promise.all(lessons.map(async lesson=>{
  const links=await lessonLinks(lesson.id,database);
  const view:LessonView={...lesson,wordCount:links.length};
  if(withProgress){
   const ids=links.map(link=>link.wordId);
   const [live,states]=await Promise.all([liveWordIds(ids,database),statesOf(ids,database)]);
   view.wordCount=live.size;
   view.progress=lessonProgress(ids.filter(id=>live.has(id)),states);
  }
  return view;
 }));
}
export async function lessonsOfWord(wordId:string,database:LexiDatabase=db):Promise<Lesson[]>{
 const links=await database.lessonWords.where('wordId').equals(wordId).toArray();
 const lessons=await loadLessons(database);
 return lessons.filter(lesson=>links.some(link=>link.lessonId===lesson.id));
}
export interface LessonDetail {lesson:Lesson;words:StoredWord[];states:Map<string,LearningState>}
export async function lessonDetail(id:string,database:LexiDatabase=db):Promise<LessonDetail|null>{
 const lesson=(await loadLessons(database)).find(item=>item.id===id);
 if(!lesson)return null;
 const ids=(await lessonLinks(id,database)).map(link=>link.wordId);
 const words=await liveWords(ids,database);
 return {lesson,words,states:await statesOf(words.map(w=>w.id),database)};
}

export type WordGroup='new'|'learning'|'review'|'solid';
export type WordFilter='all'|WordGroup;
export const stateGroup=(state:LearningState|undefined):WordGroup=>{
 if(!state)return 'new';
 if(state.card.state===State.Learning||state.card.state===State.Relearning)return 'learning';
 return state.card.scheduled_days>=21?'solid':'review';
};
export interface WordPageRequest {query:string;filter:WordFilter;lessonId:string|null;cursor:WordCursor|null;limit?:number}
/** Курсор устойчив к вставкам: для просмотра — последняя пара «ключ сортировки + id», для поиска и урока — смещение в списке идентификаторов. */
export type WordCursor={kind:'browse';sortKey:string;id:string}|{kind:'list';offset:number};
export interface WordPage {items:{word:StoredWord;group:WordGroup}[];cursor:WordCursor|null;scope:'search'|'lesson'|'all'}

export async function searchWordIds(query:string,database:LexiDatabase=db):Promise<string[]>{
 const tokens=searchTokens(query);
 if(!tokens.length)return [];
 const sets=await Promise.all(tokens.map(token=>database.words.where('tokens').startsWith(token).primaryKeys()));
 const [first,...rest]=sets;
 const others=rest.map(set=>new Set(set));
 return [...new Set(first)].filter(id=>others.every(set=>set.has(id)));
}

export async function wordPage({query,filter,lessonId,cursor,limit=PAGE_SIZE}:WordPageRequest,database:LexiDatabase=db):Promise<WordPage>{
 const items:WordPage['items']=[];
 const groupsOf=async(words:(StoredWord|undefined)[])=>{
  const live=words.filter((w):w is StoredWord=>!!w&&!w.deletedAt);
  const states=await statesOf(live.map(w=>w.id),database);
  return new Map(live.map(word=>[word.id,stateGroup(states.get(word.id))]));
 };
 const wanted=(group:WordGroup)=>filter==='all'||group===filter;
 if(query.trim()||lessonId){
  const ids=lessonId
   ?(await lessonLinks(lessonId,database)).map(link=>link.wordId).filter(await matches(query,database))
   :await searchWordIds(query,database);
  let offset=cursor?.kind==='list'?cursor.offset:0, next:number|null=null;
  scan: while(offset<ids.length){
   const slice=ids.slice(offset,offset+limit-items.length);
   const words=await database.words.bulkGet(slice);
   const groups=await groupsOf(words);
   for(let index=0;index<slice.length;index++){
    const word=words[index], group=word&&groups.get(word.id);
    if(!word||!group||!wanted(group))continue;
    items.push({word,group});
    if(items.length===limit){next=offset+index+1;break scan}
   }
   offset+=slice.length;
  }
  return {items,cursor:next!==null&&next<ids.length?{kind:'list',offset:next}:null,scope:lessonId?'lesson':'search'};
 }
 let last=cursor?.kind==='browse'?cursor:null;
 for(;;){
  const range=last?database.words.where('[sortKey+id]').above([last.sortKey,last.id]):database.words.orderBy('[sortKey+id]');
  const chunk=await range.limit(limit-items.length).toArray(); // дочитывается только недостающее
  if(!chunk.length)return {items,cursor:null,scope:'all'};
  const groups=await groupsOf(chunk);
  for(const word of chunk){
   const group=groups.get(word.id);
   last={kind:'browse',sortKey:word.sortKey,id:word.id};
   if(!group||!wanted(group))continue;
   items.push({word,group});
   if(items.length===limit)return {items,cursor:last,scope:'all'};
  }
 }
}
async function matches(query:string,database:LexiDatabase){
 if(!query.trim())return()=>true;
 const found=new Set(await searchWordIds(query,database));
 return(id:string)=>found.has(id);
}

export async function importPreview(rows:{greek:string;russian:string}[],database:LexiDatabase=db):Promise<{duplicates:number;conflicts:number}>{
 let duplicates=0,conflicts=0;
 for(const row of rows){
  if(await database.words.where('key').equals(wordKey(row.greek,row.russian)).filter(word=>!word.deletedAt).count()){duplicates++;continue}
  if(await database.words.where('greekKey').equals(normalize(row.greek)).filter(word=>!word.deletedAt).count())conflicts++;
 }
 return {duplicates,conflicts};
}
