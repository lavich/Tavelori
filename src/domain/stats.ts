import {State} from 'ts-fsrs';
import {addDays, localDay} from './learning';
import type {ExerciseType, Snapshot} from './types';

export interface DayStat {date:string;answers:number;words:number}
export interface SkillStat {type:ExerciseType;attempts:number;correct:number;rate:number|null}
export interface Progress {days:DayStat[];skills:SkillStat[];due:{today:number;tomorrow:number;week:number};groups:{fresh:number;learning:number;review:number;solid:number}}

const TYPES:ExerciseType[]=['recall','recognition','assembly','spelling','listening'];
/** Статистика считается по записанным событиям, а не по показам экрана. */
export function progress(data:Snapshot,now:Date):Progress{
 const timezone=data.settings.timezone;
 const today=localDay(now,timezone);
 const days:DayStat[]=Array.from({length:7},(_,index)=>{
  const date=addDays(today,index-6);
  const events=data.events.filter(event=>event.localDate===date);
  return {date,answers:events.length,words:new Set(events.map(event=>event.wordId)).size};
 });
 const skills=TYPES.map(type=>{
  const recent=data.events.filter(event=>event.type===type).slice(-10);
  const correct=recent.filter(event=>event.correct===null?event.rating>1:event.correct).length;
  return {type,attempts:recent.length,correct,rate:recent.length?correct/recent.length:null};
 });
 const live=new Set(data.words.filter(word=>!word.deletedAt).map(word=>word.id));
 const states=data.states.filter(state=>live.has(state.wordId));
 // Срок сравниваем по календарной дате в зоне пользователя, а не по границе суток UTC.
 const dueBefore=(date:string)=>states.filter(state=>localDay(new Date(state.card.due),timezone)<=date).length;
 return {
  days,skills,
  due:{today:dueBefore(today),tomorrow:dueBefore(addDays(today,1)),week:dueBefore(addDays(today,7))},
  groups:{
   fresh:live.size-states.length,
   learning:states.filter(state=>state.card.state===State.Learning||state.card.state===State.Relearning).length,
   review:states.filter(state=>state.card.state===State.Review&&state.card.scheduled_days<21).length,
   solid:states.filter(state=>state.card.state===State.Review&&state.card.scheduled_days>=21).length,
  },
 };
}
export const SKILL_NAMES:Record<ExerciseType,string>={recall:'Вспомнить слово',recognition:'Выбрать перевод',assembly:'Сборка из слогов',spelling:'Написание',listening:'Аудирование'};
