import type {ExerciseType, ReviewEvent} from './types';

/**
 * Компактное состояние навыков слова: всё, что нужно выбору упражнения, без полной истории ответов.
 * `recent` — исходы последних десяти ответов данного типа (старые → новые), `lastAt` — время последнего,
 * `lastTypes` — типы двух последних ответов, `cleanAssemblies` — чистые сборки после последней ошибки в написании.
 */
export interface TypeSkill {recent:boolean[];lastAt:string}
export interface SkillSummary {types:Partial<Record<ExerciseType,TypeSkill>>;lastTypes:ExerciseType[];cleanAssemblies:number}
export const RECENT=10;
export const emptySkills=():SkillSummary=>({types:{},lastTypes:[],cleanAssemblies:0});
export const succeeded=(event:Pick<ReviewEvent,'correct'|'rating'>)=>event.correct===null?event.rating>1:event.correct;

/** Один ответ меняет сводку так же, как его добавление в историю: это проверяется эквивалентностью с событиями. */
export function foldSkill(summary:SkillSummary,event:Pick<ReviewEvent,'type'|'correct'|'rating'|'createdAt'>):SkillSummary{
 const previous=summary.types[event.type];
 const recent=[...(previous?.recent??[]),succeeded(event)].slice(-RECENT);
 const cleanAssemblies=event.type==='spelling'&&event.correct===false?0:event.type==='assembly'&&event.correct===true?summary.cleanAssemblies+1:summary.cleanAssemblies;
 return {
  types:{...summary.types,[event.type]:{recent,lastAt:event.createdAt}},
  lastTypes:[...summary.lastTypes,event.type].slice(-2),
  cleanAssemblies,
 };
}
export const byTime=<T extends {createdAt:string}>(events:T[])=>[...events].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
/** Сводка из полной истории слова; события других слов отбрасываются. */
export function summarizeEvents(wordId:string,events:ReviewEvent[],base:SkillSummary=emptySkills()):SkillSummary{
 return byTime(events.filter(event=>event.wordId===wordId)).reduce(foldSkill,base);
}

/** Сводные показатели статистики: дни, последние исходы по типам и итоги — тоже без полной истории. */
export interface DaySummary {date:string;answers:number;wordIds:string[]}
export interface StatsSummary {days:DaySummary[];recentByType:Partial<Record<ExerciseType,boolean[]>>;answers:number;answeredWordIds:string[]}
export const emptyStats=():StatsSummary=>({days:[],recentByType:{},answers:0,answeredWordIds:[]});
export function foldStats(summary:StatsSummary,event:Pick<ReviewEvent,'type'|'correct'|'rating'|'wordId'|'localDate'>,keepDays=14):StatsSummary{
 const days=summary.days.some(day=>day.date===event.localDate)
  ?summary.days.map(day=>day.date===event.localDate?{...day,answers:day.answers+1,wordIds:day.wordIds.includes(event.wordId)?day.wordIds:[...day.wordIds,event.wordId]}:day)
  :[...summary.days,{date:event.localDate,answers:1,wordIds:[event.wordId]}];
 const sorted=days.sort((a,b)=>a.date.localeCompare(b.date));
 return {
  days:sorted.slice(-keepDays),
  recentByType:{...summary.recentByType,[event.type]:[...(summary.recentByType[event.type]??[]),succeeded(event)].slice(-RECENT)},
  answers:summary.answers+1,
  answeredWordIds:summary.answeredWordIds.includes(event.wordId)?summary.answeredWordIds:[...summary.answeredWordIds,event.wordId],
 };
}
