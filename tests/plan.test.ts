import {describe, expect, it} from 'vitest';
import {createEmptyCard, Rating, State} from 'ts-fsrs';
import {chooseType, daysBetween, localDay, makePlan, makeSession, nextState, optionsFor} from '../src/domain/learning';
import {diffChars} from '../src/domain/spelling';
import {checkAnswer} from '../src/domain/import';
import {progress} from '../src/domain/stats';
import {defaultSettings, type ExerciseType, type LearningState, type Lesson, type ReviewEvent, type Snapshot, type Word} from '../src/domain/types';

const now=new Date('2026-09-15T09:00:00Z');
const iso=now.toISOString();
const word=(id:string,index:number):Word=>({id,greek:`λέξη${index}`,russian:`слово${index}`,ipa:'',segments:[],examples:[],sourceMastered:false,verified:false,createdAt:iso,updatedAt:iso});
const words=(count:number,prefix='w')=>Array.from({length:count},(_,index)=>word(`${prefix}${index}`,index));
const lesson=(id:string,wordIds:string[],targetDate:string|null):Lesson=>({id,title:id,targetDate,status:'upcoming',wordIds,createdAt:iso,updatedAt:iso});
const base=(over:Partial<Snapshot>={}):Snapshot=>({words:[],lessons:[],states:[],events:[],sessions:[],settings:defaultSettings,...over});
const learned=(id:string,due:string,state=State.Review):LearningState=>({
 wordId:id,introducedAt:'2026-09-01T09:00:00Z',version:1,
 card:{...createEmptyCard(new Date('2026-09-01')),due:new Date(due),state,scheduled_days:3,reps:2},
});

describe('подготовка к нескольким занятиям',()=>{
 const pool=words(40);
 it('распределяет 30 слов на три дня и предупреждает, когда лимита не хватает',()=>{
  const data=base({words:pool,lessons:[lesson('l1',pool.slice(0,30).map(w=>w.id),'2026-09-18')]});
  expect(makePlan(data,now).requiredPerDay).toBe(10);
  expect(makePlan(data,now).shortfall).toBe(false);
  const urgent=base({words:pool,lessons:[lesson('l1',pool.slice(0,30).map(w=>w.id),'2026-09-16')]});
  const plan=makePlan(urgent,now);
  expect(plan.requiredPerDay).toBe(30);
  expect(plan.shortfall).toBe(true);
  expect(plan.newWords).toHaveLength(10); // дневной лимит не превышается автоматически
 });
 it('считает общее слово двух наборов один раз по самой ранней дате',()=>{
  const shared=pool.slice(0,10).map(w=>w.id);
  const data=base({words:pool,lessons:[lesson('l3',shared,'2026-09-17'),lesson('l4',[...shared,...pool.slice(10,20).map(w=>w.id)],'2026-09-19')]});
  const plan=makePlan(data,now);
  expect(plan.deadlines.map(d=>[d.newLeft,d.requiredPerDay])).toEqual([[10,5],[20,5]]);
  expect(plan.requiredPerDay).toBe(5);
 });
 it('перенос даты меняет темп, но не трогает уже введённые слова',()=>{
  const ids=pool.slice(0,30).map(w=>w.id);
  const states=ids.slice(0,6).map(id=>learned(id,'2026-09-20T09:00:00Z'));
  const moved=base({words:pool,lessons:[lesson('l1',ids,'2026-09-20')],states});
  const plan=makePlan(moved,now);
  expect(plan.deadlines[0].newLeft).toBe(24);
  expect(plan.requiredPerDay).toBe(5);
  expect(plan.newWords.every(item=>!states.some(state=>state.wordId===item.id))).toBe(true);
 });
 it('прошедший урок не исчезает: слова идут в общей очереди',()=>{
  const data=base({words:pool.slice(0,3),lessons:[lesson('old',pool.slice(0,3).map(w=>w.id),'2026-09-10')]});
  const plan=makePlan(data,now);
  expect(plan.deadlines).toHaveLength(0);
  expect(plan.newWords).toHaveLength(3);
 });
 it('день занятия считается догоняющей подготовкой с делителем один',()=>{
  const ids=pool.slice(0,8).map(w=>w.id);
  const plan=makePlan(base({words:pool,lessons:[lesson('today',ids,'2026-09-15')]}),now);
  expect(plan.deadlines[0].daysLeft).toBe(0);
  expect(plan.deadlines[0].requiredPerDay).toBe(8);
 });
 it('календарь работает по выбранной зоне и переживает переход летнего времени',()=>{
  expect(localDay(new Date('2026-09-15T22:30:00Z'),'Asia/Nicosia')).toBe('2026-09-16');
  expect(localDay(new Date('2026-09-15T22:30:00Z'),'UTC')).toBe('2026-09-15');
  expect(daysBetween('2026-10-24','2026-10-26')).toBe(2);
  expect(daysBetween('2026-09-18','2026-09-15')).toBe(-3);
 });
});

describe('дневной бюджет и состав занятия',()=>{
 const pool=words(30);
 const ids=pool.map(w=>w.id);
 it('смешивает новые и повторения и не превышает размер занятия',()=>{
  const states=ids.slice(20).map(id=>learned(id,'2026-09-15T06:00:00Z'));
  const data=base({words:pool,lessons:[lesson('l1',ids.slice(0,20),'2026-09-18')],states});
  const session=makeSession({data,now,random:()=>0.5});
  expect(session.items).toHaveLength(20);
  expect(session.items.filter(item=>item.isNew)).toHaveLength(10);
  expect(session.items.filter(item=>!item.isNew)).toHaveLength(10);
 });
 it('вторая сессия в тот же день не выдаёт новых слов сверх лимита',()=>{
  const introduced=ids.slice(0,10).map(id=>({...learned(id,'2026-09-16T09:00:00Z'),introducedAt:iso}));
  const data=base({words:pool,lessons:[lesson('l1',ids,'2026-09-18')],states:introduced});
  const plan=makePlan(data,now);
  expect(plan.introducedToday).toBe(10);
  expect(plan.budget).toBe(0);
  expect(makeSession({data,now,random:()=>0.5}).items.every(item=>!item.isNew)).toBe(true);
 });
 it('сначала relearning, затем просроченные, затем сегодняшние',()=>{
  const states=[
   learned(ids[0],'2026-09-15T08:00:00Z'),
   learned(ids[1],'2026-09-12T08:00:00Z'),
   {...learned(ids[2],'2026-09-14T08:00:00Z',State.Relearning)},
  ];
  const plan=makePlan(base({words:pool,states}),now);
  expect(plan.reviews.map(review=>review.word.id)).toEqual([ids[2],ids[1],ids[0]]);
 });
 it('аудирование доступно и без своего файла, если есть системный греческий голос',()=>{
  const history=(['recall','recognition','spelling'] as ExerciseType[]).map((type,index)=>({
   id:`${type}`,sessionId:'s',itemId:`${type}`,wordId:ids[0],snapshot:{greek:'',russian:''},
   type,mode:'scheduled' as const,rating:3 as const,correct:true,answer:'',
   createdAt:`2026-09-1${index}T09:00:00Z`,localDate:`2026-09-1${index}`,responseTimeMs:900,
  }));
  const data=base({words:pool,states:[learned(ids[0],'2026-09-14T08:00:00Z')],events:history});
  const silent=makeSession({data,now,random:()=>0.5,hasVoice:false}).items.find(item=>item.wordId===ids[0])!;
  expect(silent.type).not.toBe('listening');
  const spoken=makeSession({data,now,random:()=>0.5,hasVoice:true}).items.find(item=>item.wordId===ids[0])!;
  expect(spoken.type).toBe('listening');
  expect(new Set(spoken.options).size).toBe(4);
 });
 it('ручная тренировка набора берёт указанные слова в режиме practice',()=>{
  const data=base({words:pool,lessons:[lesson('l1',ids,'2026-09-18')]});
  const session=makeSession({data,now,random:()=>0.5,mode:'practice',wordIds:ids.slice(0,3)});
  expect(session.items.map(item=>item.wordId)).toEqual(ids.slice(0,3));
  expect(session.items.every(item=>item.mode==='practice')).toBe(true);
 });
 it('варианты ответа уникальны, а при нехватке слов упражнение заменяется на recall',()=>{
  const options=optionsFor(pool[0],pool,'recognition',()=>0.5);
  expect(new Set(options).size).toBe(4);
  expect(options).toContain(pool[0].russian);
  expect(optionsFor(pool[0],pool.slice(0,3),'recognition',()=>0.5)).toEqual([]);
  const small=base({words:pool.slice(0,2),states:[learned(ids[0],'2026-09-14T08:00:00Z')]});
  expect(makeSession({data:small,now,random:()=>0.5}).items[0].type).not.toBe('recognition');
 });
});

describe('интервалы FSRS',()=>{
 const later=(rating:1|2|3|4)=>nextState(undefined,'w0',rating as never,now).card;
 it('сохраняет состояние и даёт больший интервал за Легко, чем за Хорошо',()=>{
  expect(later(Rating.Again).state).toBe(State.Learning);
  expect(later(Rating.Easy).due.getTime()).toBeGreaterThan(later(Rating.Good).due.getTime());
  expect(later(Rating.Good).due.getTime()).toBeGreaterThan(later(Rating.Again).due.getTime());
  expect(later(Rating.Hard).stability).toBeGreaterThan(0);
 });
 it('после Again слово возвращается позже, а не бесконечно в этой же сессии',()=>{
  const state=nextState(undefined,'w0',Rating.Again,now);
  expect(state.card.due.getTime()).toBeGreaterThan(now.getTime());
  expect(state.version).toBe(1);
  const repeated=nextState(state,'w0',Rating.Good,new Date('2026-09-15T09:10:00Z'));
  expect(repeated.version).toBe(2);
  expect(repeated.introducedAt).toBe(state.introducedAt);
 });
});

describe('выбор упражнения',()=>{
 const event=(type:ExerciseType,correct:boolean,at:string):ReviewEvent=>({
  id:`${type}-${at}`,sessionId:'s',itemId:`${type}-${at}`,wordId:'w0',snapshot:{greek:'',russian:''},
  type,mode:'scheduled',rating:correct?3:1,correct,answer:'',createdAt:at,localDate:at.slice(0,10),responseTimeMs:1000,
 });
 it('сначала проверяет ещё не испытанные навыки в заданном порядке',()=>{
  expect(chooseType('w0',[],false)).toBe('recall');
  expect(chooseType('w0',[event('recall',true,'2026-09-10T09:00:00Z')],false)).toBe('recognition');
  expect(chooseType('w0',[event('recall',true,'2026-09-10T09:00:00Z'),event('recognition',true,'2026-09-11T09:00:00Z')],false)).toBe('spelling');
 });
 it('аудирование не предлагается без аудио, а варианты — без набора слов',()=>{
  const history=(['recall','recognition','spelling'] as ExerciseType[]).map((type,index)=>event(type,true,`2026-09-1${index}T09:00:00Z`));
  expect(chooseType('w0',history,false)).not.toBe('listening');
  expect(chooseType('w0',history,true)).toBe('listening');
  expect(chooseType('w0',history,false,false)).not.toBe('recognition');
 });
 it('выбирает самый слабый навык по последним ответам',()=>{
  const history=[
   event('recall',true,'2026-09-10T09:00:00Z'),event('recognition',true,'2026-09-11T09:00:00Z'),
   event('spelling',false,'2026-09-12T09:00:00Z'),event('listening',true,'2026-09-13T09:00:00Z'),
  ];
  expect(chooseType('w0',history,true)).toBe('spelling');
 });
 it('не повторяет один тип три раза подряд',()=>{
  const history=[
   event('recognition',true,'2026-09-10T09:00:00Z'),event('listening',true,'2026-09-11T09:00:00Z'),
   event('recall',false,'2026-09-12T09:00:00Z'),event('spelling',true,'2026-09-13T09:00:00Z'),
   event('spelling',true,'2026-09-14T09:00:00Z'),
  ];
  expect(chooseType('w0',history,true)).not.toBe('spelling');
 });
});

describe('проверка написания',()=>{
 it.each([
  ['το σπίτι','correct'],[' ΤΟ ΣΠΊΤΙ ','correct'],['το  σπίτι','correct'],
  ['το σπιτι','almost'],['σπίτι','almost'],['το σπίτη','wrong'],['ο σπίτι','almost'],
 ])('«%s» → %s',(answer,status)=>expect(checkAnswer(answer,'το σπίτι').status).toBe(status));
 it('конечная сигма и регистр не считаются ошибкой',()=>{
  expect(checkAnswer('Ο ΦΊΛΟΣ','ο φίλος').status).toBe('correct');
  expect(checkAnswer('ο φίλoς','ο φίλος').status).toBe('wrong'); // латинская o — настоящая ошибка
 });
 it('показывает посимвольно, что совпало, что лишнее и чего не хватает',()=>{
  expect(diffChars('το σπιτι','το σπίτι')).toEqual([
   {type:'same',text:'το σπ'},{type:'wrong',text:'ι'},{type:'same',text:'τι'},
  ]);
  expect(diffChars('σπίτι','το σπίτι')).toEqual([{type:'missing',text:'το '},{type:'same',text:'σπίτι'}]);
 });
});

describe('статистика',()=>{
 it('без истории не выдумывает оценку запоминания',()=>{
  const stats=progress(base({words:words(3)}),now);
  expect(stats.skills.every(skill=>skill.rate===null)).toBe(true);
  expect(stats.days).toHaveLength(7);
  expect(stats.groups.fresh).toBe(3);
 });
 it('сроки считает по календарю выбранной зоны, а не по суткам UTC',()=>{
  const pool=words(2);
  // 22:00 UTC — это уже 01:00 следующего дня в Никосии, значит «сегодня» такое повторение не готово.
  const states=[
   {...learned(pool[0].id,'2026-09-15T22:00:00Z')},
   {...learned(pool[1].id,'2026-09-15T12:00:00Z')},
  ];
  const stats=progress(base({words:pool,states}),now);
  expect(stats.due.today).toBe(1);
  expect(stats.due.tomorrow).toBe(2);
 });
 it('считает дни по локальной полуночи выбранной зоны',()=>{
  const pool=words(2);
  const events:ReviewEvent[]=[{
   id:'e1',sessionId:'s',itemId:'i1',wordId:pool[0].id,snapshot:{greek:'',russian:''},type:'recall',mode:'scheduled',
   rating:3,correct:null,answer:'',createdAt:'2026-09-14T22:30:00Z',localDate:localDay(new Date('2026-09-14T22:30:00Z'),'Asia/Nicosia'),responseTimeMs:900,
  }];
  const stats=progress(base({words:pool,events}),now);
  expect(stats.days.find(day=>day.date==='2026-09-15')!.answers).toBe(1);
 });
});
