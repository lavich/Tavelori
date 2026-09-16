import type {SkillSummary, StatsSummary, TypeSkill} from '../domain/skills';
import type {ExerciseType} from '../domain/types';
import {SNAPSHOT_FORMAT, type CompactSnapshot, type CompactState, type SerializedCard} from './types';

/**
 * Проводной формат снимка: массивы вместо объектов, миллисекунды вместо ISO, исходы ответов — битовой строкой.
 * Числа FSRS не округляются: второе устройство должно получить те же интервалы. Кодек обратим, что проверяется тестом.
 */
const TYPE_CODE:Record<ExerciseType,string>={recall:'c',recognition:'r',assembly:'a',spelling:'s',listening:'l'};
const CODE_TYPE=Object.fromEntries(Object.entries(TYPE_CODE).map(([type,code])=>[code,type])) as Record<string,ExerciseType>;
const ms=(iso:string|undefined)=>iso?Date.parse(iso):0;
const iso=(value:number)=>new Date(value).toISOString();
const bits=(recent:boolean[])=>recent.map(flag=>flag?'1':'0').join('');
const unbits=(text:string)=>[...text].map(char=>char==='1');

type WireState=[string,number,number,number,number,number,number,number,number,number,number,number,number];
type WireSkill=[string,string,number,Record<string,[string,number]>];
type WireDay=[string,number,string[]];
interface Wire {
 f:number;c:number;
 s:CompactSnapshot['settings'];
 l:[string,string|null,'upcoming'|'completed',number][];
 p:string[];
 st:WireState[];
 sk:WireSkill[];
 x:{d:WireDay[];r:Record<string,string>;n:number;w:string[]};
}
const encodeState=(state:CompactState):WireState=>{
 const card=state.card;
 return [state.wordId,ms(card.due),card.stability,card.difficulty,card.elapsed_days,card.scheduled_days,card.reps,card.lapses,card.state,card.learning_steps??0,ms(card.last_review),ms(state.introducedAt),state.version];
};
const decodeState=(wire:WireState):CompactState=>{
 const [wordId,due,stability,difficulty,elapsed_days,scheduled_days,reps,lapses,state,learning_steps,last,intro,version]=wire;
 const card:SerializedCard={due:iso(due),stability,difficulty,elapsed_days,scheduled_days,reps,lapses,state,learning_steps,...(last?{last_review:iso(last)}:{})};
 return {wordId,card,introducedAt:iso(intro),version};
};
const encodeSkill=(wordId:string,skills:SkillSummary):WireSkill=>[
 wordId,skills.lastTypes.map(type=>TYPE_CODE[type]).join(''),skills.cleanAssemblies,
 Object.fromEntries(Object.entries(skills.types).filter((entry):entry is [string,TypeSkill]=>!!entry[1]).map(([type,skill])=>[TYPE_CODE[type as ExerciseType],[bits(skill.recent),ms(skill.lastAt)]])),
];
const decodeSkill=(wire:WireSkill):{wordId:string;skills:SkillSummary}=>{
 const [wordId,last,cleanAssemblies,types]=wire;
 return {wordId,skills:{
  lastTypes:[...last].map(code=>CODE_TYPE[code]).filter(Boolean),
  cleanAssemblies,
  types:Object.fromEntries(Object.entries(types).map(([code,[recent,at]])=>[CODE_TYPE[code],{recent:unbits(recent),lastAt:iso(at)}])),
 }};
};
const encodeStats=(stats:StatsSummary):Wire['x']=>({
 d:stats.days.map(day=>[day.date,day.answers,day.wordIds]),
 r:Object.fromEntries(Object.entries(stats.recentByType).filter((entry):entry is [string,boolean[]]=>!!entry[1]).map(([type,recent])=>[TYPE_CODE[type as ExerciseType],bits(recent)])),
 n:stats.answers,w:stats.answeredWordIds,
});
const decodeStats=(wire:Wire['x']):StatsSummary=>({
 days:wire.d.map(([date,answers,wordIds])=>({date,answers,wordIds})),
 recentByType:Object.fromEntries(Object.entries(wire.r).map(([code,recent])=>[CODE_TYPE[code],unbits(recent)])),
 answers:wire.n,answeredWordIds:wire.w,
});

export function encodeSnapshot(snapshot:CompactSnapshot):string{
 const wire:Wire={
  f:snapshot.format,c:ms(snapshot.createdAt),s:snapshot.settings,
  l:snapshot.lessons.map(lesson=>[lesson.id,lesson.targetDate,lesson.status,ms(lesson.updatedAt)]),
  p:snapshot.packages,
  st:snapshot.states.map(encodeState),
  sk:snapshot.skills.map(entry=>encodeSkill(entry.wordId,entry.skills)),
  x:encodeStats(snapshot.stats),
 };
 return JSON.stringify(wire);
}
export class SnapshotFormatError extends Error {}
/** Бросает `SnapshotFormatError` при другой версии формата или неверной структуре; повреждённый JSON — обычная ошибка разбора. */
export function decodeSnapshot(text:string):CompactSnapshot{
 const wire=JSON.parse(text) as Partial<Wire>;
 if(wire?.f!==SNAPSHOT_FORMAT)throw new SnapshotFormatError(`Формат снимка ${String(wire?.f)} не поддерживается`);
 if(!Array.isArray(wire.st)||!Array.isArray(wire.sk)||!wire.s||!wire.x||!Array.isArray(wire.l)||!Array.isArray(wire.p))throw new SnapshotFormatError('Структура снимка не соответствует формату');
 return {
  format:SNAPSHOT_FORMAT,createdAt:iso(wire.c??0),settings:wire.s,
  lessons:wire.l.map(([id,targetDate,status,updatedAt])=>({id,targetDate,status,updatedAt:iso(updatedAt)})),
  packages:wire.p,
  states:wire.st.map(decodeState),
  skills:wire.sk.map(decodeSkill),
  stats:decodeStats(wire.x),
 };
}
