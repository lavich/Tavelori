import {createEmptyCard, fsrs, generatorParameters, State, type Card, type Grade} from 'ts-fsrs';
import {unitKey, wordRef} from './refs';
import {emptySkills, summarizeEvents, type SkillSummary} from './skills';
import {assemblyOptions, splitWriting} from './syllables';
import {LOCAL_COURSE, type CardKind, type Course, type ExerciseType, type LearningRef, type LearningState, type Lesson, type Phrase, type ReviewEvent, type Session, type SessionCard, type SessionItem, type Settings, type Word} from './types';

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
/** Хвост прошедших занятий: карточки, до которых очередь не дошла, пока урок был впереди. */
export interface Backlog {refs:LearningRef[];lessons:number}
/** Откуда взята новая карточка; у слова из скана словаря источника нет. */
export interface WordOrigin {lessonId:string;title:string;past:boolean}
/**
 * План одного курса: свой предел, своя очередь и свой срок — курсы не делят их между собой.
 * `unavailable` — новые карточки без доступного объективного упражнения: видны отдельно, квоту и темп не расходуют.
 */
export interface CoursePlan {
 courseId:string; title:string; newItemsPerDay:number; budget:number; introducedToday:number;
 newRefs:LearningRef[]; requiredPerDay:number; shortfall:boolean; deadlines:DeadlinePlan[]; backlog:Backlog;
 origins:Map<string,WordOrigin>; unavailable:LearningRef[];
}
export interface DailyPlan {
 today:string; requiredPerDay:number; budget:number; introducedToday:number;
 newRefs:LearningRef[]; reviews:{ref:LearningRef;state:LearningState}[]; deadlines:DeadlinePlan[]; shortfall:boolean;
 backlog:Backlog; courses:CoursePlan[]; origins:Map<string,WordOrigin>; unavailable:LearningRef[];
}

/** Лёгкие признаки доступности проверки: для фразы — наличие перевода и файла аудио; слова и пропуски проверяемы всегда. */
export interface CardFacts {kind:CardKind;hasTranslation?:boolean;hasAudio?:boolean}
export interface AvailabilityContext {hasVoice:boolean;phrasePool:number}
/**
 * Есть ли у карточки объективное упражнение. Фраза без перевода проверяется только аудированием,
 * для которого нужны голос или файл и четыре различных фразы в пуле. Агент не дописывает перевод для обхода.
 */
export const isCheckable=(facts:CardFacts,context:AvailabilityContext)=>
 facts.kind!=='phrase'||!!facts.hasTranslation||((!!facts.hasAudio||context.hasVoice)&&context.phrasePool>=4);

/**
 * Источник данных планировщика: ограниченные выборки вместо полного снимка.
 * Уроки приходят с датами по расписанию в порядке первичного ключа; списки карточек уроков — в порядке связей.
 * Все карты ключуются `unitKey`.
 */
export interface PlanSource {
 settings():Promise<Settings>;
 lessons():Promise<Lesson[]>;
 courses():Promise<Course[]>;
 lessonRefs(lessonId:string):Promise<LearningRef[]>;
 /** Введённые сегодня карточки в разрезе курсов: карточка из двух курсов считается каждому. */
 introducedTodayByCourse(today:string,timezone:string):Promise<Map<string,number>>;
 statesOf(refs:LearningRef[]):Promise<Map<string,LearningState>>;
 /** Ключи существующих и не удалённых карточек. */
 liveKeys(refs:LearningRef[]):Promise<Set<string>>;
 /** Удалённых карточек мало: их множество дешевле, чем проверять существование тысяч срочных повторений. */
 deletedKeys():Promise<Set<string>>;
 dueStates(now:Date):Promise<LearningState[]>;
 /** Слова вне уроков добираются сканом словаря: пользовательские наборы состоят только из слов. */
 scanLiveWordIds(after:string|null,limit:number):Promise<string[]>;
 /** Карточки, входящие хоть в один урок. */
 lessonBoundKeys(refs:LearningRef[]):Promise<Set<string>>;
 /** Признаки доступности упражнения для перечисленных карточек; тексты при этом не нужны. */
 factsOf(refs:LearningRef[]):Promise<Map<string,CardFacts>>;
 /** Число живых фраз: достаточность пула вариантов для аудирования фраз. */
 phraseCount():Promise<number>;
}
export interface SessionSource extends PlanSource {
 /** Полное содержимое только выбранных карточек. */
 cardsOf(refs:LearningRef[]):Promise<Map<string,SessionCard>>;
 /** Компактная сводка навыков карточки: синхронизированная база плюс локальные ответы после неё. */
 skillsOf(card:SessionCard):Promise<SkillSummary>;
 optionPool(want:number):Promise<Word[]>;
 /** Ограниченный пул фраз для вариантов ответа; читается, только если в сессии есть фразы. */
 phrasePool(want:number):Promise<Phrase[]>;
}
export const OPTION_POOL=48;
const SCAN=200;

export interface PlanOptions {hasVoice?:boolean}
export async function makePlan(source:PlanSource,now:Date,options:PlanOptions={}):Promise<DailyPlan>{
 const settings=await source.settings();
 const timezone=settings.timezone;
 const today=localDay(now,timezone);
 const [lessons,courses,introduced,phrasePool]=await Promise.all([source.lessons(),source.courses(),source.introducedTodayByCourse(today,timezone),source.phraseCount()]);
 const availability:AvailabilityContext={hasVoice:!!options.hasVoice,phrasePool};

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
  const budget=Math.max(0,course.newItemsPerDay-introducedToday);
  const past=own.filter(l=>l.status==='completed'||(l.targetDate&&daysBetween(today,l.targetDate)<0)).sort(order);
  const upcoming=own.filter(l=>l.targetDate&&l.status!=='completed'&&daysBetween(today,l.targetDate)>=0).sort(order);

  const seen=new Set<string>(); const deadlines:DeadlinePlan[]=[]; const origins=new Map<string,WordOrigin>(); const unavailable:LearningRef[]=[];
  /** Новые живые карточки списка без состояния; непроверяемые отделяются и в счёт квоты не идут. */
  const fresh=async(refs:LearningRef[])=>{
   const unseen=refs.filter(ref=>!seen.has(unitKey(ref)));
   const [live,states]=await Promise.all([source.liveKeys(unseen),source.statesOf(unseen)]);
   const candidates=unseen.filter(ref=>live.has(unitKey(ref))&&!states.has(unitKey(ref)));
   const facts=await source.factsOf(candidates.filter(ref=>ref.kind==='phrase'));
   return candidates.filter(ref=>{
    if(ref.kind!=='phrase')return true;
    const info=facts.get(unitKey(ref));
    if(info&&isCheckable(info,availability))return true;
    if(!seen.has(unitKey(ref))){seen.add(unitKey(ref));unavailable.push(ref)}
    return false;
   });
  };
  const take=async(lesson:Lesson,into:LearningRef[],isPast:boolean)=>{
   let added=0;
   for(const ref of await fresh(await source.lessonRefs(lesson.id))){
    const key=unitKey(ref);
    if(seen.has(key))continue;
    seen.add(key); into.push(ref); origins.set(key,{lessonId:lesson.id,title:lesson.title,past:isPast}); added++;
   }
   return added;
  };
  // Ближайшее занятие — единственный срок, который ещё можно успеть: его карточки идут раньше хвоста, а хвост в счёт срока не входит.
  const dated:LearningRef[]=[]; let counted=0;
  for(const lesson of upcoming){
   counted+=await take(lesson,dated,false);
   const daysLeft=Math.max(1,daysBetween(today,lesson.targetDate!));
   deadlines.push({lessonId:lesson.id,title:lesson.title,targetDate:lesson.targetDate!,daysLeft:daysBetween(today,lesson.targetDate!),newLeft:counted,requiredPerDay:Math.ceil(counted/daysLeft)});
  }
  const overdue:LearningRef[]=[]; const overdueLessons=new Set<string>();
  for(const lesson of past) if(await take(lesson,overdue,true))overdueLessons.add(lesson.id);
  const picked=[...dated,...overdue];
  if(picked.length<budget){
   for(const lesson of own){
    if(picked.length>=budget)break;
    await take(lesson,picked,false);
   }
   // Слово вне уроков принадлежит только локальному курсу; карточка урока ведёт очередь его курса.
   if(course.id===LOCAL_COURSE){
    let cursor:string|null=null;
    while(picked.length<budget){
     const chunk=await source.scanLiveWordIds(cursor,SCAN);
     if(!chunk.length)break;
     const unseen=chunk.map(wordRef).filter(ref=>!seen.has(unitKey(ref)));
     const [states,bound]=await Promise.all([source.statesOf(unseen),source.lessonBoundKeys(unseen)]);
     for(const ref of unseen){const key=unitKey(ref);if(!states.has(key)&&!bound.has(key)){seen.add(key);picked.push(ref)}}
     cursor=chunk[chunk.length-1];
    }
   }
  }
  const requiredPerDay=deadlines.reduce((max,d)=>Math.max(max,d.requiredPerDay),0);
  plans.push({
   courseId:course.id,title:course.title,newItemsPerDay:course.newItemsPerDay,budget,introducedToday,
   newRefs:picked.slice(0,budget),requiredPerDay,shortfall:requiredPerDay>course.newItemsPerDay,
   deadlines,backlog:{refs:overdue,lessons:overdueLessons.size},origins,unavailable,
  });
 }

 // Курсы идут по ближайшему сроку: карточки к завтрашнему занятию попадают в сессию раньше.
 const soonest=(plan:CoursePlan)=>plan.deadlines[0]?.targetDate??'￿';
 plans.sort((a,b)=>soonest(a).localeCompare(soonest(b))||a.courseId.localeCompare(b.courseId));

 const uniqueRefs=(refs:LearningRef[])=>[...new Map(refs.map(ref=>[unitKey(ref),ref])).values()];
 const newRefs=uniqueRefs(plans.flatMap(plan=>plan.newRefs));
 const backlogRefs=uniqueRefs(plans.flatMap(plan=>plan.backlog.refs));

 const [due,deleted]=await Promise.all([source.dueStates(now),source.deletedKeys()]);
 const rank=(state:LearningState)=>state.card.state===State.Relearning?0:state.card.state===State.Learning?1:2;
 const reviews=due
  .filter(s=>!deleted.has(s.unitKey))
  .sort((a,b)=>rank(a)-rank(b)||new Date(a.card.due).getTime()-new Date(b.card.due).getTime()||a.unitKey.localeCompare(b.unitKey))
  .map(s=>({ref:s.ref,state:s}));

 return {
  today,
  requiredPerDay:plans.reduce((max,plan)=>Math.max(max,plan.requiredPerDay),0),
  budget:plans.reduce((sum,plan)=>sum+plan.budget,0),
  introducedToday:plans.reduce((sum,plan)=>sum+plan.introducedToday,0),
  newRefs,reviews,
  deadlines:plans.flatMap(plan=>plan.deadlines).sort((a,b)=>a.targetDate.localeCompare(b.targetDate)),
  shortfall:plans.some(plan=>plan.shortfall),
  backlog:{refs:backlogRefs,lessons:plans.reduce((sum,plan)=>sum+plan.backlog.lessons,0)},
  courses:plans,
  // Карточка из двух курсов подписывается уроком курса с ближайшим сроком.
  origins:new Map(plans.flatMap(plan=>[...plan.origins]).reverse()),
  unavailable:uniqueRefs(plans.flatMap(plan=>plan.unavailable)),
 };
}

const ORDER:ExerciseType[]=['recognition','assembly','spelling','listening','comprehension'];
/**
 * `canSpell` — есть перевод, по которому пишут; у слов всегда, у фраз без перевода — нет.
 * `canListen` — аудирование доступно само по себе (у фраз варианты аудирования отделены от вариантов узнавания);
 * без него аудирование требует звука и вариантов узнавания, как у слов.
 */
export interface SkillContext {hasAudio?:boolean;hasOptions?:boolean;canAssemble?:boolean;canSpell?:boolean;canListen?:boolean;canComprehend?:boolean}

/** Написание открывается, когда после последней ошибки в нём набрано две успешные сборки. */
export const spellingUnlockedFor=(skills:SkillSummary)=>skills.cleanAssemblies>=2;
/**
 * Понимание на слух открывается после первого верного узнавания: пока значение не связано с формой,
 * выбор из четырёх переводов к незнакомому звуку — угадайка. Ошибка условие не сбрасывает: навык уже открыт,
 * а слабость видна планировщику по доле ошибок.
 */
export const comprehensionUnlockedFor=(skills:SkillSummary)=>!!skills.types.recognition?.recent.some(Boolean);
export function spellingUnlocked(unitKey:string,events:ReviewEvent[]):boolean{
 return spellingUnlockedFor(summarizeEvents(unitKey,events));
}

/** Доступные упражнения в порядке предпочтения; пусто — карточку нечем объективно проверить. */
export function availableTypes(skills:SkillSummary,context:SkillContext={}):ExerciseType[]{
 const {hasAudio=false,hasOptions=true,canAssemble=false,canSpell=true,canListen=hasAudio&&hasOptions,canComprehend=false}=context;
 return ORDER.filter(type=>
  (type!=='listening'||canListen)
  &&(type!=='comprehension'||(canComprehend&&hasOptions&&canSpell&&comprehensionUnlockedFor(skills)))
  &&(type!=='recognition'||(hasOptions&&canSpell))
  &&(type!=='assembly'||canAssemble)
  &&(type!=='spelling'||(canSpell&&(!canAssemble||spellingUnlockedFor(skills)))));
}
/** Эвристика выбора упражнения по последним ответам, а не оценка вероятности памяти. */
export function chooseTypeFor(skills:SkillSummary,context:SkillContext={}):ExerciseType{
 const available=availableTypes(skills,context);
 if(!available.length)return 'spelling';
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
/** Совместимая форма: история карточки сворачивается в сводку и даёт тот же выбор. */
export function chooseType(unitKey:string,events:ReviewEvent[],context:SkillContext={}):ExerciseType{
 return chooseTypeFor(summarizeEvents(unitKey,events),context);
}

/** Practice сюда не попадает: ручная тренировка не должна двигать интервалы. */
export function nextState(state:LearningState|undefined,ref:LearningRef,rating:Grade,now:Date):LearningState{
 const card:Card=state?{...state.card,due:new Date(state.card.due),last_review:state.card.last_review?new Date(state.card.last_review):undefined}:createEmptyCard(now);
 const next=scheduler.next(card,now,rating).card;
 return {unitKey:unitKey(ref),ref,card:next,introducedAt:state?.introducedAt??now.toISOString(),version:(state?.version??0)+1};
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
 return optionsAmong(word.id,key(word),pool.map(w=>[w.id,key(w)]),random);
}
/** Четыре различных варианта: свой ответ и три чужих; совпадающие нормализованные ответы не считаются разными. */
function optionsAmong(ownId:string,own:string,pool:[string,string][],random:()=>number):string[]{
 const norm=(value:string)=>value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('el');
 const unique=[...new Map(pool.filter(([id,value])=>id!==ownId&&value&&norm(value)!==norm(own)).map(([id,value])=>[norm(value),[id,value] as const])).values()];
 if(unique.length<3)return [];
 return shuffle([own,...shuffle(unique,random).slice(0,3).map(([,value])=>value)],random);
}
/** Варианты для фразы подбираются только среди фраз: по переводу для узнавания, по тексту для аудирования. */
export function phraseOptionsFor(phrase:Phrase,pool:Phrase[],type:ExerciseType,random:()=>number):string[]{
 const key=(p:Phrase)=>type==='recognition'?(p.translation??''):p.text;
 if(!key(phrase))return [];
 return optionsAmong(phrase.id,key(phrase),pool.map(p=>[p.id,key(p)]),random);
}

export interface SessionInput {source:SessionSource;now:Date;random?:()=>number;mode?:'scheduled'|'practice';refs?:LearningRef[];hasVoice?:boolean}
export async function makeSession({source,now,random=Math.random,mode='scheduled',refs,hasVoice=false}:SessionInput):Promise<Session>{
 const plan=await makePlan(source,now,{hasVoice});
 const settings=await source.settings();
 const size=Math.max(2,settings.sessionSize);
 let chosen:{ref:LearningRef;isNew:boolean}[];
 if(refs){
  const live=await source.liveKeys(refs);
  const kept=refs.filter(ref=>live.has(unitKey(ref)));
  const states=await source.statesOf(kept);
  chosen=kept.map(ref=>({ref,isNew:!states.has(unitKey(ref))}));
 }else{
  const reserve=Math.min(plan.budget,Math.ceil(size/2));
  const newOnes=plan.newRefs.slice(0,reserve);
  const reviews=plan.reviews.slice(0,Math.max(size-newOnes.length,plan.reviews.length?1:0));
  const extraNew=plan.newRefs.slice(newOnes.length,Math.min(plan.newRefs.length,newOnes.length+Math.max(0,size-newOnes.length-reviews.length)));
  chosen=[...newOnes.concat(extraNew).map(ref=>({ref,isNew:true})),...reviews.slice(0,Math.max(0,size-newOnes.length-extraNew.length)).map(r=>({ref:r.ref,isNew:false}))];
  chosen=shuffle(chosen,random).slice(0,size);
 }
 const wanted=chosen.map(entry=>entry.ref);
 const [cards,states,pool]=await Promise.all([source.cardsOf(wanted),source.statesOf(wanted),source.optionPool(OPTION_POOL)]);
 // Пул фраз читается только когда в занятии есть фразы: словарная сессия не трогает таблицу фраз.
 const phrases=[...cards.values()].some(card=>card.kind==='phrase')?await source.phrasePool(OPTION_POOL):[];
 const id=`s-${now.getTime().toString(36)}-${Math.floor(random()*1e6).toString(36)}`;
 const items:SessionItem[]=[];
 for(const entry of chosen){
  const key=unitKey(entry.ref);
  const card=cards.get(key);
  if(!card)continue;
  const skills=entry.isNew?emptySkills():await source.skillsOf(card);
  const exercise=exerciseFor(card,{words:pool,phrases},skills,random,hasVoice);
  if(!exercise)continue; // объективного упражнения нет: карточка остаётся для просмотра
  const origin=entry.isNew?plan.origins.get(key):undefined;
  items.push({id:`${id}-${items.length}`,ref:entry.ref,unitKey:key,card,...exercise,isNew:entry.isNew,mode,expectedVersion:states.get(key)?.version??0,...(origin?{lessonTitle:origin.title,lessonPast:origin.past}:{})});
 }
 return {id,createdAt:now.toISOString(),planDate:plan.today,items:spaceSingleIntroduction(items),index:0,status:'active',activeTimeMs:0,introducedKeys:[],objectiveVersion:1};
}

export interface OptionPools {words:Word[];phrases:Phrase[]}
/**
 * Ступени вниз после ошибки: попытка сразу после показанного ответа должна быть поддержанной,
 * а не повторным экзаменом. Сборка даёт слоги, узнавание — варианты; ниже узнавания ступеней нет.
 */
const EASIER:Partial<Record<ExerciseType,ExerciseType[]>>={spelling:['assembly','recognition'],assembly:['recognition'],comprehension:['recognition']};
/** Есть ли под заданием ступень: пул вариантов читается только ради неё. */
export const hasEasierStep=(type:ExerciseType)=>!!EASIER[type];
/**
 * Упражнение дополнительной попытки: ближайшая доступная ступень проще провалённой.
 * `null` — ступени нет (узнавание, аудирование, пропуск, нехватка слогов или вариантов): попытка повторяет то же задание.
 * Условие открытия написания здесь не действует: попытка идёт вниз по ступеням, а не вверх.
 */
export function easierExercise(card:SessionCard,type:ExerciseType,pools:OptionPools,random:()=>number=Math.random):Pick<SessionItem,'type'|'options'>|null{
 for(const step of EASIER[type]??[]){
  if(step==='assembly'){
   const exercise=card.kind==='word'?assemblyExercise(card.word,random):null;
   if(exercise)return exercise;
   continue;
  }
  const options=card.kind==='word'?optionsFor(card.word,pools.words,'recognition',random)
   :card.kind==='phrase'?phraseOptionsFor(card.phrase,pools.phrases,'recognition',random):[];
  if(options.length===4)return {type:'recognition',options};
 }
 return null;
}
/** Сборка слова: `null` — слогов меньше двух. Артикль остаётся условием задания, лишней плиткой не ложится. */
function assemblyExercise(word:Word,random:()=>number):Pick<SessionItem,'type'|'options'>|null{
 const writing=splitWriting(word.greek);
 const parts=writing.syllables;
 if(parts.length<2)return null;
 // Перемешивание полной старой последовательности сохраняет детерминированный поток random для остальных заданий.
 const shuffled=shuffleTiles(writing.article?[writing.article,...parts]:parts,random);
 const options=assemblyOptions(word.greek,shuffled);
 return {type:'assembly',options:options.join('')===parts.join('')?[...options.slice(1),options[0]]:options};
}
/** Упражнение для карточки любого вида; `null` — фразу нечем объективно проверить. */
export function exerciseFor(card:SessionCard,pools:OptionPools,skills:SkillSummary,random:()=>number,hasVoice:boolean):Pick<SessionItem,'type'|'options'>|null{
 if(card.kind==='word')return objectiveExercise(card.word,pools.words,skills,random,hasVoice);
 if(card.kind==='cloze')return {type:'cloze',options:[]};
 return phraseExercise(card.phrase,pools.phrases,skills,random,hasVoice);
}

/** Варианты проверяем по уникальным ответам, а не только по размеру словаря. */
export function objectiveExercise(word:Word,pool:Word[],skills:SkillSummary=emptySkills(),random:()=>number=Math.random,hasVoice=false):Pick<SessionItem,'type'|'options'>{
 const writing=splitWriting(word.greek);
 const parts=writing.syllables;
 const recognition=optionsFor(word,pool,'recognition',random);
 const listening=optionsFor(word,pool,'listening',random);
 const sounds=!!word.audioAssetId||hasVoice;
 const type=chooseTypeFor(skills,{
  hasAudio:sounds&&listening.length===4,
  hasOptions:recognition.length===4,canAssemble:parts.length>=2,
  canComprehend:sounds&&recognition.length===4,
 });
 if(type==='assembly'){
  const exercise=assemblyExercise(word,random);
  if(exercise)return exercise;
 }
 return {type,options:type==='recognition'||type==='comprehension'?recognition:type==='listening'?listening:[]};
}
/**
 * Фраза: узнавание и написание при переводе, аудирование при голосе или файле и четырёх различных фразах.
 * Слоговой сборки и её условий нет; при недостатке вариантов — написание. Без единого доступного упражнения — `null`.
 */
export function phraseExercise(phrase:Phrase,pool:Phrase[],skills:SkillSummary=emptySkills(),random:()=>number=Math.random,hasVoice=false):Pick<SessionItem,'type'|'options'>|null{
 const recognition=phraseOptionsFor(phrase,pool,'recognition',random);
 const listening=phraseOptionsFor(phrase,pool,'listening',random);
 const sounds=!!phrase.audioAssetId||hasVoice;
 const canListen=sounds&&listening.length===4;
 const context:SkillContext={hasAudio:canListen,canListen,hasOptions:recognition.length===4,canAssemble:false,canSpell:!!phrase.translation,canComprehend:sounds&&recognition.length===4};
 if(!availableTypes(skills,context).length)return null;
 const type=chooseTypeFor(skills,context);
 return {type,options:type==='recognition'||type==='comprehension'?recognition:type==='listening'?listening:[]};
}

export function spaceSingleIntroduction(items:SessionItem[]):SessionItem[]{
 const fresh=items.filter(item=>item.isNew&&!item.eventId&&!item.retryOf);
 if(fresh.length!==1||items.some(item=>item.eventId))return items;
 return [...items.filter(item=>item.id!==fresh[0].id),fresh[0]];
}
