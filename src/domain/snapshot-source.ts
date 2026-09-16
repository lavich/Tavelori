import {localDay, type SessionSource} from './learning';
import {scheduleLessons} from './schedule';
import type {StatsSource} from './stats';
import {fillSettings, type Snapshot} from './types';

/**
 * Источник из полного снимка в памяти. Нужен тестам: те же правила планирования проверяются
 * на снимке и на базе, поэтому новая выборка обязана давать тот же результат, что и старый снимок.
 */
export function fromSnapshot(data:Snapshot):SessionSource&StatsSource{
 const settings=fillSettings(data.settings);
 const live=new Map(data.words.filter(word=>!word.deletedAt).map(word=>[word.id,word]));
 const states=new Map(data.states.map(state=>[state.wordId,state]));
 const deleted=new Set(data.words.filter(word=>word.deletedAt).map(word=>word.id));
 const sorted=(events:typeof data.events)=>[...events].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 return {
  settings:async()=>settings,
  lessons:async()=>scheduleLessons(data.lessons,settings.schedule),
  lessonWordIds:async lessonId=>data.links.filter(link=>link.lessonId===lessonId).sort((a,b)=>a.position-b.position||a.wordId.localeCompare(b.wordId)).map(link=>link.wordId),
  introducedToday:async(today,timezone)=>data.states.filter(state=>localDay(new Date(state.introducedAt),timezone)===today).length,
  statesOf:async ids=>new Map(ids.filter(id=>states.has(id)).map(id=>[id,states.get(id)!])),
  liveWordIds:async ids=>new Set(ids.filter(id=>live.has(id))),
  dueStates:async now=>data.states.filter(state=>new Date(state.card.due).getTime()<=now.getTime()),
  scanLiveWordIds:async(after,limit)=>{
   const ids=[...live.keys()];
   const start=after===null?0:ids.indexOf(after)+1;
   return ids.slice(start,start+limit);
  },
  wordsOf:async ids=>ids.map(id=>live.get(id)).filter((word):word is NonNullable<typeof word>=>!!word),
  historyOf:async wordId=>sorted(data.events.filter(event=>event.wordId===wordId)),
  optionPool:async()=>[...live.values()],
  eventsBetween:async(from,to)=>data.events.filter(event=>event.localDate>=from&&event.localDate<=to),
  recentByType:async(type,limit)=>sorted(data.events.filter(event=>event.type===type)).slice(-limit),
  dueWordIdsBefore:async instant=>data.states.filter(state=>new Date(state.card.due).getTime()<instant.getTime()).map(state=>state.wordId),
  deletedWordIds:async()=>deleted,
  wordCount:async()=>data.words.length,
  eachState:async visit=>{for(const state of data.states)visit(state)},
  totals:async()=>({answers:data.events.length,words:new Set(data.events.map(event=>event.wordId)).size}),
 };
}
