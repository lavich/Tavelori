import {createEmptyCard, fsrs, generatorParameters, State, type Card, type Grade} from 'ts-fsrs';
import type {ExerciseType, LearningState, ReviewEvent, Session, SessionItem, Snapshot, Word} from './types';

export const scheduler=fsrs(generatorParameters({enable_fuzz:false}));

/** Календарный день в выбранной зоне, без деления миллисекунд на сутки. */
export function localDay(date:Date,timezone:string):string{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const get=(type:string)=>parts.find(p=>p.type===type)!.value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
/** Разница календарных дней; переход летнего времени не сдвигает результат. */
export function daysBetween(from:string,to:string):number{
 return Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000);
}
export const addDays=(day:string,count:number)=>new Date(Date.parse(`${day}T00:00:00Z`)+count*86400000).toISOString().slice(0,10);
export const formatDay=(day:string)=>new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'});
export const weekdayOf=(day:string)=>new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU',{weekday:'long',timeZone:'UTC'});
const toDay=(value:string,timezone:string)=>localDay(new Date(value),timezone);

export interface DeadlinePlan {lessonId:string;title:string;targetDate:string;daysLeft:number;newLeft:number;requiredPerDay:number}
export interface DailyPlan {
 today:string; requiredPerDay:number; budget:number; introducedToday:number;
 newWords:Word[]; reviews:{word:Word;state:LearningState}[]; deadlines:DeadlinePlan[]; shortfall:boolean;
}

const alive=(words:Word[])=>words.filter(w=>!w.deletedAt);
export const activeWords=alive;

export function makePlan(data:Snapshot,now:Date):DailyPlan{
 const timezone=data.settings.timezone;
 const today=localDay(now,timezone);
 const words=new Map(alive(data.words).map(w=>[w.id,w]));
 const states=new Map(data.states.map(s=>[s.wordId,s]));
 const introducedToday=data.states.filter(s=>toDay(s.introducedAt,timezone)===today).length;
 const budget=Math.max(0,data.settings.newWordsPerDay-introducedToday);

 const upcoming=data.lessons
  .filter(l=>l.targetDate&&l.status!=='completed'&&daysBetween(today,l.targetDate)>=0)
  .sort((a,b)=>(a.targetDate!).localeCompare(b.targetDate!)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));

 const seen=new Set<string>(); const deadlines:DeadlinePlan[]=[]; const dated:string[]=[];
 for(const lesson of upcoming){
  for(const id of lesson.wordIds) if(words.has(id)&&!states.has(id)&&!seen.has(id)){seen.add(id);dated.push(id)}
  const daysLeft=Math.max(1,daysBetween(today,lesson.targetDate!));
  deadlines.push({lessonId:lesson.id,title:lesson.title,targetDate:lesson.targetDate!,daysLeft:daysBetween(today,lesson.targetDate!),newLeft:seen.size,requiredPerDay:Math.ceil(seen.size/daysLeft)});
 }
 const requiredPerDay=deadlines.reduce((max,d)=>Math.max(max,d.requiredPerDay),0);

 const rest:string[]=[];
 for(const lesson of data.lessons) for(const id of lesson.wordIds) if(words.has(id)&&!states.has(id)&&!seen.has(id)){seen.add(id);rest.push(id)}
 for(const word of words.values()) if(!states.has(word.id)&&!seen.has(word.id)){seen.add(word.id);rest.push(word.id)}

 const picked=[...dated.slice(0,Math.min(budget,requiredPerDay)),...dated.slice(Math.min(budget,requiredPerDay)).concat(rest)];
 const newWords=picked.slice(0,budget).map(id=>words.get(id)!);

 const rank=(state:LearningState)=>state.card.state===State.Relearning?0:state.card.state===State.Learning?1:2;
 const reviews=data.states
  .filter(s=>words.has(s.wordId)&&new Date(s.card.due).getTime()<=now.getTime())
  .sort((a,b)=>rank(a)-rank(b)||new Date(a.card.due).getTime()-new Date(b.card.due).getTime())
  .map(s=>({word:words.get(s.wordId)!,state:s}));

 return {today,requiredPerDay,budget,introducedToday,newWords,reviews,deadlines,shortfall:requiredPerDay>data.settings.newWordsPerDay};
}

const ORDER:ExerciseType[]=['recall','recognition','spelling','listening'];
const succeeded=(event:ReviewEvent)=>event.correct===null?event.rating>1:event.correct;

/** Эвристика выбора упражнения по последним ответам, а не оценка вероятности памяти. */
export function chooseType(wordId:string,events:ReviewEvent[],hasAudio:boolean,hasOptions=true):ExerciseType{
 const history=events.filter(e=>e.wordId===wordId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 const available=ORDER.filter(type=>(type!=='listening'||hasAudio)&&(type!=='recognition'||hasOptions));
 const last=history[history.length-1], beforeLast=history[history.length-2];
 const repeated=last&&beforeLast&&last.type===beforeLast.type?last.type:null;
 const allowed=available.filter(type=>type!==repeated);
 const pool=allowed.length?allowed:available;
 const untested=pool.find(type=>!history.some(e=>e.type===type));
 if(untested)return untested;
 const score=(type:ExerciseType)=>{
  const recent=history.filter(e=>e.type===type).slice(-10);
  return {rate:recent.filter(succeeded).length/recent.length,at:recent[recent.length-1].createdAt};
 };
 return pool.slice(1).reduce((best,type)=>{
  const a=score(best), b=score(type);
  return b.rate<a.rate||(b.rate===a.rate&&b.at<a.at)?type:best;
 },pool[0]);
}

/** Practice сюда не попадает: ручная тренировка не должна двигать интервалы. */
export function nextState(state:LearningState|undefined,wordId:string,rating:Grade,now:Date):LearningState{
 const card:Card=state?{...state.card,due:new Date(state.card.due),last_review:state.card.last_review?new Date(state.card.last_review):undefined}:createEmptyCard(now);
 const next=scheduler.next(card,now,rating).card;
 return {wordId,card:next,introducedAt:state?.introducedAt??now.toISOString(),version:(state?.version??0)+1};
}

const shuffle=<T,>(items:T[],random:()=>number)=>{
 const copy=[...items];
 for(let i=copy.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}
 return copy;
};
export function optionsFor(word:Word,pool:Word[],type:ExerciseType,random:()=>number):string[]{
 const key=(w:Word)=>type==='recognition'?w.russian:w.greek;
 const unique=[...new Map(pool.filter(w=>w.id!==word.id&&key(w)!==key(word)).map(w=>[key(w),w])).values()];
 if(unique.length<3)return [];
 return shuffle([key(word),...shuffle(unique,random).slice(0,3).map(key)],random);
}

export interface SessionInput {data:Snapshot;now:Date;random?:()=>number;mode?:'scheduled'|'practice';wordIds?:string[]}
export function makeSession({data,now,random=Math.random,mode='scheduled',wordIds}:SessionInput):Session{
 const plan=makePlan(data,now);
 const pool=alive(data.words);
 const states=new Map(data.states.map(s=>[s.wordId,s]));
 const size=Math.max(2,data.settings.sessionSize);
 let chosen:{word:Word;isNew:boolean}[];
 if(wordIds){
  chosen=wordIds.map(id=>pool.find(w=>w.id===id)).filter((w):w is Word=>!!w).map(word=>({word,isNew:!states.has(word.id)}));
 }else{
  const reserve=Math.min(plan.budget,Math.ceil(size/2));
  const newOnes=plan.newWords.slice(0,reserve);
  const reviews=plan.reviews.slice(0,Math.max(size-newOnes.length,plan.reviews.length?1:0));
  const extraNew=plan.newWords.slice(newOnes.length,Math.min(plan.newWords.length,newOnes.length+Math.max(0,size-newOnes.length-reviews.length)));
  chosen=[...newOnes.concat(extraNew).map(word=>({word,isNew:true})),...reviews.slice(0,Math.max(0,size-newOnes.length-extraNew.length)).map(r=>({word:r.word,isNew:false}))];
  chosen=shuffle(chosen,random).slice(0,size);
 }
 const id=`s-${now.getTime().toString(36)}-${Math.floor(random()*1e6).toString(36)}`;
 const items:SessionItem[]=chosen.map((entry,index)=>{
  const hasAudio=!!entry.word.audioAssetId;
  const type:ExerciseType=entry.isNew?'recall':chooseType(entry.word.id,data.events,hasAudio,pool.length>=4);
  const options=type==='recognition'||type==='listening'?optionsFor(entry.word,pool,type,random):[];
  const fallback:ExerciseType=(type==='recognition'||type==='listening')&&options.length===0?'recall':type;
  return {id:`${id}-${index}`,wordId:entry.word.id,word:entry.word,type:fallback,options:fallback===type?options:[],isNew:entry.isNew,mode,expectedVersion:states.get(entry.word.id)?.version??0};
 });
 return {id,createdAt:now.toISOString(),planDate:plan.today,items,index:0,status:'active',activeTimeMs:0};
}
