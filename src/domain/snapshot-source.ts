import {localDay, type SessionSource} from './learning';
import {byTime, emptyStats, foldStats, summarizeEvents} from './skills';
import {scheduleCourses} from './schedule';
import type {StatsSource} from './stats';
import {defaultSchedule, DEFAULT_NEW_WORDS_PER_DAY, fillSettings, LOCAL_COURSE, type Course, type Snapshot} from './types';

/**
 * Источник из полного снимка в памяти. Нужен тестам: те же правила планирования проверяются
 * на снимке и на базе, поэтому новая выборка обязана давать тот же результат, что и старый снимок.
 */
export function fromSnapshot(data:Snapshot):SessionSource&StatsSource{
 const settings=fillSettings(data.settings);
 // Снимок без курсов — это один локальный курс со стандартным темпом: так выглядела база до разделения.
 const courses:Course[]=data.courses??[{id:LOCAL_COURSE,title:'Мои слова',origin:'local',subscribed:true,
  schedule:defaultSchedule,newWordsPerDay:DEFAULT_NEW_WORDS_PER_DAY,createdAt:'',updatedAt:''}];
 const courseOfLesson=new Map(data.lessons.map(lesson=>[lesson.id,lesson.courseId??LOCAL_COURSE]));
 const live=new Map(data.words.filter(word=>!word.deletedAt).map(word=>[word.id,word]));
 const states=new Map(data.states.map(state=>[state.wordId,state]));
 const deleted=new Set(data.words.filter(word=>word.deletedAt).map(word=>word.id));
 const sorted=(events:typeof data.events)=>[...events].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 return {
  settings:async()=>settings,
  lessons:async()=>scheduleCourses(data.lessons,courses),
  courses:async()=>courses,
  lessonWordIds:async lessonId=>data.links.filter(link=>link.lessonId===lessonId).sort((a,b)=>a.position-b.position||a.wordId.localeCompare(b.wordId)).map(link=>link.wordId),
  introducedTodayByCourse:async(today,timezone)=>{
   const counts=new Map<string,number>();
   for(const state of data.states){
    if(localDay(new Date(state.introducedAt),timezone)!==today)continue;
    const owners=new Set(data.links.filter(link=>link.wordId===state.wordId).map(link=>courseOfLesson.get(link.lessonId)??LOCAL_COURSE));
    if(!owners.size)owners.add(LOCAL_COURSE);
    for(const courseId of owners)counts.set(courseId,(counts.get(courseId)??0)+1);
   }
   return counts;
  },
  statesOf:async ids=>new Map(ids.filter(id=>states.has(id)).map(id=>[id,states.get(id)!])),
  liveWordIds:async ids=>new Set(ids.filter(id=>live.has(id))),
  dueStates:async now=>data.states.filter(state=>new Date(state.card.due).getTime()<=now.getTime()),
  scanLiveWordIds:async(after,limit)=>{
   const ids=[...live.keys()];
   const start=after===null?0:ids.indexOf(after)+1;
   return ids.slice(start,start+limit);
  },
  wordsOf:async ids=>ids.map(id=>live.get(id)).filter((word):word is NonNullable<typeof word>=>!!word),
  skillsOf:async word=>summarizeEvents(word.id,data.events),
  optionPool:async()=>[...live.values()],
  daysBetween:async(from,to)=>byTime(data.events.filter(event=>event.localDate>=from&&event.localDate<=to)).reduce((summary,event)=>foldStats(summary,event,Infinity),emptyStats()).days,
  recentByType:async(type,limit)=>sorted(data.events.filter(event=>event.type===type)).slice(-limit).map(event=>event.correct===null?event.rating>1:event.correct),
  dueWordIdsBefore:async instant=>data.states.filter(state=>new Date(state.card.due).getTime()<instant.getTime()).map(state=>state.wordId),
  deletedWordIds:async()=>deleted,
  wordCount:async()=>data.words.length,
  eachState:async visit=>{for(const state of data.states)visit(state)},
  totals:async()=>({answers:data.events.length,words:new Set(data.events.map(event=>event.wordId)).size}),
 };
}
