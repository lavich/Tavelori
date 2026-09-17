import {createEmptyCard, fsrs, generatorParameters, State, type Card, type Grade} from 'ts-fsrs';
import {emptySkills, summarizeEvents, type SkillSummary} from './skills';
import {tiles} from './syllables';
import {LOCAL_COURSE, type Course, type ExerciseType, type LearningState, type Lesson, type ReviewEvent, type Session, type SessionItem, type Settings, type Word} from './types';

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
/** Хвост прошедших занятий: слова, до которых очередь не дошла, пока урок был впереди. */
export interface Backlog {wordIds:string[];lessons:number}
/** План одного курса: свой предел, своя очередь и свой срок — курсы не делят их между собой. */
export interface CoursePlan {
 courseId:string; title:string; newWordsPerDay:number; budget:number; introducedToday:number;
 newWordIds:string[]; requiredPerDay:number; shortfall:boolean; deadlines:DeadlinePlan[]; backlog:Backlog;
}
export interface DailyPlan {
 today:string; requiredPerDay:number; budget:number; introducedToday:number;
 newWordIds:string[]; reviews:{wordId:string;state:LearningState}[]; deadlines:DeadlinePlan[]; shortfall:boolean;
 backlog:Backlog; courses:CoursePlan[];
}

/**
 * Источник данных планировщика: ограниченные выборки вместо полного снимка.
 * Уроки приходят с датами по расписанию в порядке первичного ключа; списки слов уроков — в порядке связей.
 */
export interface PlanSource {
 settings():Promise<Settings>;
 lessons():Promise<Lesson[]>;
 courses():Promise<Course[]>;
 lessonWordIds(lessonId:string):Promise<string[]>;
 /** Введённые сегодня слова в разрезе курсов: слово из двух курсов считается каждому. */
 introducedTodayByCourse(today:string,timezone:string):Promise<Map<string,number>>;
 statesOf(wordIds:string[]):Promise<Map<string,LearningState>>;
 liveWordIds(wordIds:string[]):Promise<Set<string>>;
 /** Удалённых слов мало: их множество дешевле, чем проверять существование тысяч срочных повторений. */
 deletedWordIds():Promise<Set<string>>;
 dueStates(now:Date):Promise<LearningState[]>;
 scanLiveWordIds(after:string|null,limit:number):Promise<string[]>;
}
export interface SessionSource extends PlanSource {
 wordsOf(wordIds:string[]):Promise<Word[]>;
 /** Компактная сводка навыков слова: синхронизированная база плюс локальные ответы после неё. */
 skillsOf(word:Word):Promise<SkillSummary>;
 optionPool(want:number):Promise<Word[]>;
}
export const OPTION_POOL=48;
const SCAN=200;

export async function makePlan(source:PlanSource,now:Date):Promise<DailyPlan>{
 const settings=await source.settings();
 const timezone=settings.timezone;
 const today=localDay(now,timezone);
 const [lessons,courses,introduced]=await Promise.all([source.lessons(),source.courses(),source.introducedTodayByCourse(today,timezone)]);

 const order=(a:Lesson,b:Lesson)=>(a.targetDate??'').localeCompare(b.targetDate??'')||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id);
 const grouped=new Map<string,Lesson[]>();
 for(const lesson of lessons){
  const key=lesson.courseId??LOCAL_COURSE;
  (grouped.get(key)??grouped.set(key,[]).get(key)!).push(lesson);
 }

 const plans:CoursePlan[]=[];
 for(const course of courses){
  const own=grouped.get(course.id)??[];
  if(!own.length&&course.id!==LOCAL_COURSE)continue;
  const introducedToday=introduced.get(course.id)??0;
  const budget=Math.max(0,course.newWordsPerDay-introducedToday);
  const past=own.filter(l=>l.status==='completed'||(l.targetDate&&daysBetween(today,l.targetDate)<0)).sort(order);
  const upcoming=own.filter(l=>l.targetDate&&l.status!=='completed'&&daysBetween(today,l.targetDate)>=0).sort(order);

  const seen=new Set<string>(); const deadlines:DeadlinePlan[]=[]; const dated:string[]=[];
  const fresh=async(ids:string[])=>{
   const unseen=ids.filter(id=>!seen.has(id));
   const [live,states]=await Promise.all([source.liveWordIds(unseen),source.statesOf(unseen)]);
   return unseen.filter(id=>live.has(id)&&!states.has(id));
  };
  // Слово прошедшего занятия просрочено уже сейчас, поэтому идёт раньше подготовки к будущим.
  const overdue:string[]=[]; const overdueLessons=new Set<string>();
  for(const lesson of past) for(const id of await fresh(await source.lessonWordIds(lesson.id))) if(!seen.has(id)){
   seen.add(id); overdue.push(id); overdueLessons.add(lesson.id);
  }
  for(const lesson of upcoming){
   for(const id of await fresh(await source.lessonWordIds(lesson.id))) if(!seen.has(id)){seen.add(id);dated.push(id)}
   const daysLeft=Math.max(1,daysBetween(today,lesson.targetDate!));
   deadlines.push({lessonId:lesson.id,title:lesson.title,targetDate:lesson.targetDate!,daysLeft:daysBetween(today,lesson.targetDate!),newLeft:seen.size,requiredPerDay:Math.ceil(seen.size/daysLeft)});
  }
  const picked=[...overdue,...dated];
  if(picked.length<budget){
   for(const lesson of own){
    if(picked.length>=budget)break;
    for(const id of await fresh(await source.lessonWordIds(lesson.id))) if(!seen.has(id)){seen.add(id);picked.push(id)}
   }
   // Слово вне уроков принадлежит только своим наборам: чужому курсу его добирать нечем.
   if(course.id===LOCAL_COURSE){
    let cursor:string|null=null;
    while(picked.length<budget){
     const chunk=await source.scanLiveWordIds(cursor,SCAN);
     if(!chunk.length)break;
     const states=await source.statesOf(chunk.filter(id=>!seen.has(id)));
     for(const id of chunk) if(!seen.has(id)&&!states.has(id)){seen.add(id);picked.push(id)}
     cursor=chunk[chunk.length-1];
    }
   }
  }
  const requiredPerDay=deadlines.reduce((max,d)=>Math.max(max,d.requiredPerDay),0);
  plans.push({
   courseId:course.id,title:course.title,newWordsPerDay:course.newWordsPerDay,budget,introducedToday,
   newWordIds:picked.slice(0,budget),requiredPerDay,shortfall:requiredPerDay>course.newWordsPerDay,
   deadlines,backlog:{wordIds:overdue,lessons:overdueLessons.size},
  });
 }

 // Курсы идут по ближайшему сроку: слова к завтрашнему занятию попадают в сессию раньше.
 const soonest=(plan:CoursePlan)=>plan.deadlines[0]?.targetDate??'\uffff';
 plans.sort((a,b)=>soonest(a).localeCompare(soonest(b))||a.courseId.localeCompare(b.courseId));

 const newWordIds=[...new Set(plans.flatMap(plan=>plan.newWordIds))];
 const backlogIds=[...new Set(plans.flatMap(plan=>plan.backlog.wordIds))];

 const [due,deleted]=await Promise.all([source.dueStates(now),source.deletedWordIds()]);
 const rank=(state:LearningState)=>state.card.state===State.Relearning?0:state.card.state===State.Learning?1:2;
 const reviews=due
  .filter(s=>!deleted.has(s.wordId))
  .sort((a,b)=>rank(a)-rank(b)||new Date(a.card.due).getTime()-new Date(b.card.due).getTime()||a.wordId.localeCompare(b.wordId))
  .map(s=>({wordId:s.wordId,state:s}));

 return {
  today,
  requiredPerDay:plans.reduce((max,plan)=>Math.max(max,plan.requiredPerDay),0),
  budget:plans.reduce((sum,plan)=>sum+plan.budget,0),
  introducedToday:plans.reduce((sum,plan)=>sum+plan.introducedToday,0),
  newWordIds,reviews,
  deadlines:plans.flatMap(plan=>plan.deadlines).sort((a,b)=>a.targetDate.localeCompare(b.targetDate)),
  shortfall:plans.some(plan=>plan.shortfall),
  backlog:{wordIds:backlogIds,lessons:plans.reduce((sum,plan)=>sum+plan.backlog.lessons,0)},
  courses:plans,
 };
}

const ORDER:ExerciseType[]=['recognition','assembly','spelling','listening'];
export interface SkillContext {hasAudio?:boolean;hasOptions?:boolean;canAssemble?:boolean}

/** Написание открывается, когда после последней ошибки в нём набрано две успешные сборки. */
export const spellingUnlockedFor=(skills:SkillSummary)=>skills.cleanAssemblies>=2;
export function spellingUnlocked(wordId:string,events:ReviewEvent[]):boolean{
 return spellingUnlockedFor(summarizeEvents(wordId,events));
}

/** Эвристика выбора упражнения по последним ответам, а не оценка вероятности памяти. */
export function chooseTypeFor(skills:SkillSummary,context:SkillContext={}):ExerciseType{
 const {hasAudio=false,hasOptions=true,canAssemble=false}=context;
 const available=ORDER.filter(type=>
  (type!=='listening'||(hasAudio&&hasOptions))
  &&(type!=='recognition'||hasOptions)
  &&(type!=='assembly'||canAssemble)
  &&(type!=='spelling'||!canAssemble||spellingUnlockedFor(skills)));
 const [beforeLast,last]=skills.lastTypes.length===2?skills.lastTypes:[undefined,skills.lastTypes[0]];
 const repeated=last&&beforeLast&&last===beforeLast?last:null;
 const allowed=available.filter(type=>type!==repeated);
 const pool=allowed.length?allowed:available;
 const untested=pool.find(type=>!skills.types[type]);
 if(untested)return untested;
 const score=(type:ExerciseType)=>{
  const recent=skills.types[type]!;
  return {rate:recent.recent.filter(Boolean).length/recent.recent.length,at:recent.lastAt};
 };
 return pool.slice(1).reduce((best,type)=>{
  const a=score(best), b=score(type);
  return b.rate<a.rate||(b.rate===a.rate&&b.at<a.at)?type:best;
 },pool[0]);
}
/** Совместимая форма: история слова сворачивается в сводку и даёт тот же выбор. */
export function chooseType(wordId:string,events:ReviewEvent[],context:SkillContext={}):ExerciseType{
 return chooseTypeFor(summarizeEvents(wordId,events),context);
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
  const skills=entry.isNew?emptySkills():await source.skillsOf(word);
  const exercise=objectiveExercise(word,pool,skills,random,hasVoice);
  items.push({id:`${id}-${items.length}`,wordId:word.id,word,...exercise,isNew:entry.isNew,mode,expectedVersion:states.get(word.id)?.version??0});
 }
 return {id,createdAt:now.toISOString(),planDate:plan.today,items:spaceSingleIntroduction(items),index:0,status:'active',activeTimeMs:0,introducedWordIds:[],objectiveVersion:1};
}

/** Варианты проверяем по уникальным ответам, а не только по размеру словаря. */
export function objectiveExercise(word:Word,pool:Word[],skills:SkillSummary=emptySkills(),random:()=>number=Math.random,hasVoice=false):Pick<SessionItem,'type'|'options'>{
 const parts=tiles(word.greek);
 const recognition=optionsFor(word,pool,'recognition',random);
 const listening=optionsFor(word,pool,'listening',random);
 const type=chooseTypeFor(skills,{
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
