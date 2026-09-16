import {createEmptyCard, fsrs, generatorParameters, State, type Card, type Grade} from 'ts-fsrs';
import {tiles} from './syllables';
import type {ExerciseType, LearningState, Lesson, ReviewEvent, Session, SessionItem, Settings, Word} from './types';

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
/** Момент начала календарного дня в зоне; переход летнего времени учитывается повторным расчётом смещения. */
export function zonedStart(day:string,timezone:string):Date{
 const guess=new Date(`${day}T00:00:00Z`);
 const offset=(date:Date)=>{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(date);
  const get=(type:string)=>Number(parts.find(p=>p.type===type)!.value);
  return Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'),get('second'))-date.getTime();
 };
 const first=new Date(guess.getTime()-offset(guess));
 return new Date(guess.getTime()-offset(first));
}

export interface DeadlinePlan {lessonId:string;title:string;targetDate:string;daysLeft:number;newLeft:number;requiredPerDay:number}
export interface DailyPlan {
 today:string; requiredPerDay:number; budget:number; introducedToday:number;
 newWordIds:string[]; reviews:{wordId:string;state:LearningState}[]; deadlines:DeadlinePlan[]; shortfall:boolean;
}

/**
 * Источник данных планировщика: ограниченные выборки вместо полного снимка.
 * Уроки приходят с датами по расписанию в порядке первичного ключа; списки слов уроков — в порядке связей.
 */
export interface PlanSource {
 settings():Promise<Settings>;
 lessons():Promise<Lesson[]>;
 lessonWordIds(lessonId:string):Promise<string[]>;
 introducedToday(today:string,timezone:string):Promise<number>;
 statesOf(wordIds:string[]):Promise<Map<string,LearningState>>;
 liveWordIds(wordIds:string[]):Promise<Set<string>>;
 /** Удалённых слов мало: их множество дешевле, чем проверять существование тысяч срочных повторений. */
 deletedWordIds():Promise<Set<string>>;
 dueStates(now:Date):Promise<LearningState[]>;
 scanLiveWordIds(after:string|null,limit:number):Promise<string[]>;
}
export interface SessionSource extends PlanSource {
 wordsOf(wordIds:string[]):Promise<Word[]>;
 historyOf(wordId:string):Promise<ReviewEvent[]>;
 optionPool(want:number):Promise<Word[]>;
}
export const OPTION_POOL=48;
const SCAN=200;

export async function makePlan(source:PlanSource,now:Date):Promise<DailyPlan>{
 const settings=await source.settings();
 const timezone=settings.timezone;
 const today=localDay(now,timezone);
 const introducedToday=await source.introducedToday(today,timezone);
 const budget=Math.max(0,settings.newWordsPerDay-introducedToday);
 const lessons=await source.lessons();
 const upcoming=lessons
  .filter(l=>l.targetDate&&l.status!=='completed'&&daysBetween(today,l.targetDate)>=0)
  .sort((a,b)=>(a.targetDate!).localeCompare(b.targetDate!)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));

 const seen=new Set<string>(); const deadlines:DeadlinePlan[]=[]; const dated:string[]=[];
 const fresh=async(ids:string[])=>{
  const unseen=ids.filter(id=>!seen.has(id));
  const [live,states]=await Promise.all([source.liveWordIds(unseen),source.statesOf(unseen)]);
  return unseen.filter(id=>live.has(id)&&!states.has(id));
 };
 for(const lesson of upcoming){
  for(const id of await fresh(await source.lessonWordIds(lesson.id))) if(!seen.has(id)){seen.add(id);dated.push(id)}
  const daysLeft=Math.max(1,daysBetween(today,lesson.targetDate!));
  deadlines.push({lessonId:lesson.id,title:lesson.title,targetDate:lesson.targetDate!,daysLeft:daysBetween(today,lesson.targetDate!),newLeft:seen.size,requiredPerDay:Math.ceil(seen.size/daysLeft)});
 }
 const requiredPerDay=deadlines.reduce((max,d)=>Math.max(max,d.requiredPerDay),0);

 // Датированные слова идут первыми; остальные подтягиваются порциями, только пока не заполнен дневной бюджет.
 const picked=[...dated];
 if(picked.length<budget){
  for(const lesson of lessons){
   if(picked.length>=budget)break;
   for(const id of await fresh(await source.lessonWordIds(lesson.id))) if(!seen.has(id)){seen.add(id);picked.push(id)}
  }
  let cursor:string|null=null;
  while(picked.length<budget){
   const chunk=await source.scanLiveWordIds(cursor,SCAN);
   if(!chunk.length)break;
   const states=await source.statesOf(chunk.filter(id=>!seen.has(id)));
   for(const id of chunk) if(!seen.has(id)&&!states.has(id)){seen.add(id);picked.push(id)}
   cursor=chunk[chunk.length-1];
  }
 }
 const newWordIds=picked.slice(0,budget);

 const [due,deleted]=await Promise.all([source.dueStates(now),source.deletedWordIds()]);
 const rank=(state:LearningState)=>state.card.state===State.Relearning?0:state.card.state===State.Learning?1:2;
 const reviews=due
  .filter(s=>!deleted.has(s.wordId))
  .sort((a,b)=>rank(a)-rank(b)||new Date(a.card.due).getTime()-new Date(b.card.due).getTime()||a.wordId.localeCompare(b.wordId))
  .map(s=>({wordId:s.wordId,state:s}));

 return {today,requiredPerDay,budget,introducedToday,newWordIds,reviews,deadlines,shortfall:requiredPerDay>settings.newWordsPerDay};
}

const ORDER:ExerciseType[]=['recognition','assembly','spelling','listening'];
const succeeded=(event:ReviewEvent)=>event.correct===null?event.rating>1:event.correct;
export interface SkillContext {hasAudio?:boolean;hasOptions?:boolean;canAssemble?:boolean}

/** Написание открывается, когда после последней ошибки в нём набрано две успешные сборки. */
export function spellingUnlocked(wordId:string,events:ReviewEvent[]):boolean{
 const history=events.filter(e=>e.wordId===wordId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 let since=0;
 for(const event of history){
  if(event.type==='spelling'&&event.correct===false)since=0;
  else if(event.type==='assembly'&&event.correct===true)since++;
 }
 return since>=2;
}

/** Эвристика выбора упражнения по последним ответам, а не оценка вероятности памяти. */
export function chooseType(wordId:string,events:ReviewEvent[],context:SkillContext={}):ExerciseType{
 const {hasAudio=false,hasOptions=true,canAssemble=false}=context;
 const history=events.filter(e=>e.wordId===wordId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 const available=ORDER.filter(type=>
  (type!=='listening'||(hasAudio&&hasOptions))
  &&(type!=='recognition'||hasOptions)
  &&(type!=='assembly'||canAssemble)
  &&(type!=='spelling'||!canAssemble||spellingUnlocked(wordId,events)));
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
/** Плитки перемешиваем так, чтобы правильный порядок не выпал сразу готовым. */
export function shuffleTiles(parts:string[],random:()=>number):string[]{
 if(parts.length<2)return [...parts];
 for(let attempt=0;attempt<8;attempt++){
  const mixed=shuffle(parts,random);
  if(mixed.join('')!==parts.join(''))return mixed;
 }
 return [...parts.slice(1),parts[0]];
}
export function optionsFor(word:Word,pool:Word[],type:ExerciseType,random:()=>number):string[]{
 const key=(w:Word)=>type==='recognition'?w.russian:w.greek;
 const unique=[...new Map(pool.filter(w=>w.id!==word.id&&key(w)!==key(word)).map(w=>[key(w),w])).values()];
 if(unique.length<3)return [];
 return shuffle([key(word),...shuffle(unique,random).slice(0,3).map(key)],random);
}

export interface SessionInput {source:SessionSource;now:Date;random?:()=>number;mode?:'scheduled'|'practice';wordIds?:string[];hasVoice?:boolean}
export async function makeSession({source,now,random=Math.random,mode='scheduled',wordIds,hasVoice=false}:SessionInput):Promise<Session>{
 const plan=await makePlan(source,now);
 const settings=await source.settings();
 const size=Math.max(2,settings.sessionSize);
 let chosen:{wordId:string;isNew:boolean}[];
 if(wordIds){
  const live=await source.liveWordIds(wordIds);
  const kept=wordIds.filter(id=>live.has(id));
  const states=await source.statesOf(kept);
  chosen=kept.map(wordId=>({wordId,isNew:!states.has(wordId)}));
 }else{
  const reserve=Math.min(plan.budget,Math.ceil(size/2));
  const newOnes=plan.newWordIds.slice(0,reserve);
  const reviews=plan.reviews.slice(0,Math.max(size-newOnes.length,plan.reviews.length?1:0));
  const extraNew=plan.newWordIds.slice(newOnes.length,Math.min(plan.newWordIds.length,newOnes.length+Math.max(0,size-newOnes.length-reviews.length)));
  chosen=[...newOnes.concat(extraNew).map(wordId=>({wordId,isNew:true})),...reviews.slice(0,Math.max(0,size-newOnes.length-extraNew.length)).map(r=>({wordId:r.wordId,isNew:false}))];
  chosen=shuffle(chosen,random).slice(0,size);
 }
 const ids=chosen.map(entry=>entry.wordId);
 const [words,states,pool]=await Promise.all([source.wordsOf(ids),source.statesOf(ids),source.optionPool(OPTION_POOL)]);
 const byId=new Map(words.map(word=>[word.id,word]));
 const id=`s-${now.getTime().toString(36)}-${Math.floor(random()*1e6).toString(36)}`;
 const items:SessionItem[]=[];
 for(const entry of chosen){
  const word=byId.get(entry.wordId);
  if(!word)continue;
  const events=entry.isNew?[]:await source.historyOf(entry.wordId);
  const exercise=objectiveExercise(word,pool,events,random,hasVoice);
  items.push({id:`${id}-${items.length}`,wordId:word.id,word,...exercise,isNew:entry.isNew,mode,expectedVersion:states.get(word.id)?.version??0});
 }
 return {id,createdAt:now.toISOString(),planDate:plan.today,items:spaceSingleIntroduction(items),index:0,status:'active',activeTimeMs:0,introducedWordIds:[],objectiveVersion:1};
}

/** Варианты проверяем по уникальным ответам, а не только по размеру словаря. */
export function objectiveExercise(word:Word,pool:Word[],events:ReviewEvent[]=[],random:()=>number=Math.random,hasVoice=false):Pick<SessionItem,'type'|'options'>{
 const parts=tiles(word.greek);
 const recognition=optionsFor(word,pool,'recognition',random);
 const listening=optionsFor(word,pool,'listening',random);
 const type=chooseType(word.id,events,{
  hasAudio:(!!word.audioAssetId||hasVoice)&&listening.length===4,
  hasOptions:recognition.length===4,canAssemble:parts.length>=2,
 });
 return {type,options:type==='assembly'?shuffleTiles(parts,random):type==='recognition'?recognition:type==='listening'?listening:[]};
}

export function spaceSingleIntroduction(items:SessionItem[]):SessionItem[]{
 const fresh=items.filter(item=>item.isNew&&!item.eventId&&!item.retryOf);
 if(fresh.length!==1||items.some(item=>item.eventId))return items;
 return [...items.filter(item=>item.id!==fresh[0].id),fresh[0]];
}
