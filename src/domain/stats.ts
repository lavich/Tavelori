import {State} from 'ts-fsrs';
import {addDays, localDay, zonedStart} from './learning';
import type {DaySummary} from './skills';
import type {ExerciseType, LearningState, Settings} from './types';

export interface DayStat {date:string;answers:number;words:number}
export interface SkillStat {type:ExerciseType;attempts:number;correct:number;rate:number|null}
export interface Progress {days:DayStat[];skills:SkillStat[];due:{today:number;tomorrow:number;week:number};groups:{fresh:number;learning:number;review:number;solid:number};totals:{answers:number;words:number}}

export interface StatsSource {
 settings():Promise<Settings>;
 /** Дни периода с числом ответов и словами; источник сам сводит базу и локальные события. */
 daysBetween(fromDay:string,toDay:string):Promise<DaySummary[]>;
 /** Исходы последних ответов типа (старые → новые). */
 recentByType(type:ExerciseType,limit:number):Promise<boolean[]>;
 dueWordIdsBefore(instant:Date):Promise<string[]>;
 deletedWordIds():Promise<Set<string>>;
 wordCount():Promise<number>;
 eachState(visit:(state:LearningState)=>void):Promise<void>;
 totals():Promise<{answers:number;words:number}>;
}

const TYPES:ExerciseType[]=['recall','recognition','assembly','spelling','listening'];
/** Статистика считается по записанным событиям, а не по показам экрана. */
export async function progress(source:StatsSource,now:Date):Promise<Progress>{
 const {timezone}=await source.settings();
 const today=localDay(now,timezone);
 const period=await source.daysBetween(addDays(today,-6),today);
 const days:DayStat[]=Array.from({length:7},(_,index)=>{
  const date=addDays(today,index-6);
  const day=period.find(entry=>entry.date===date);
  return {date,answers:day?.answers??0,words:day?new Set(day.wordIds).size:0};
 });
 const skills:SkillStat[]=[];
 for(const type of TYPES){
  const recent=await source.recentByType(type,10);
  const correct=recent.filter(Boolean).length;
  skills.push({type,attempts:recent.length,correct,rate:recent.length?correct/recent.length:null});
 }
 const deleted=await source.deletedWordIds();
 // Срок сравниваем по календарной дате в зоне пользователя: «не позже дня» значит раньше начала следующего дня.
 const dueBefore=async(date:string)=>(await source.dueWordIdsBefore(zonedStart(addDays(date,1),timezone))).filter(id=>!deleted.has(id)).length;
 const groups={fresh:0,learning:0,review:0,solid:0};
 let tracked=0;
 await source.eachState(state=>{
  if(deleted.has(state.wordId))return;
  tracked++;
  if(state.card.state===State.Learning||state.card.state===State.Relearning)groups.learning++;
  else if(state.card.state===State.Review)groups[state.card.scheduled_days>=21?'solid':'review']++;
 });
 groups.fresh=Math.max(0,await source.wordCount()-deleted.size-tracked);
 return {
  days,skills,
  due:{today:await dueBefore(today),tomorrow:await dueBefore(addDays(today,1)),week:await dueBefore(addDays(today,7))},
  groups,totals:await source.totals(),
 };
}
export interface LessonProgress {solid:number;review:number;fresh:number}
/** Три группы слов урока для строки списка: устойчивые — Review с интервалом от 21 дня, в повторении — любое другое состояние, новые — без состояния. */
export function lessonProgress(ids:Iterable<string>,states:Map<string,LearningState>):LessonProgress{
 const groups:LessonProgress={solid:0,review:0,fresh:0};
 for(const id of ids){
  const state=states.get(id);
  if(!state)groups.fresh++;
  else if(state.card.state===State.Review&&state.card.scheduled_days>=21)groups.solid++;
  else groups.review++;
 }
 return groups;
}
export const SKILL_NAMES:Record<ExerciseType,string>={recall:'Вспомнить слово',recognition:'Выбрать перевод',assembly:'Сборка из слогов',spelling:'Написание',listening:'Аудирование'};
