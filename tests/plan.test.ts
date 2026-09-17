import {describe, expect, it} from 'vitest';
import {createEmptyCard, Rating, State} from 'ts-fsrs';
import {chooseType, daysBetween, localDay, makePlan, makeSession, nextState, optionsFor, shuffleTiles, spellingUnlocked} from '../src/domain/learning';
import {fromSnapshot} from '../src/domain/snapshot-source';
import {diffChars} from '../src/domain/spelling';
import {checkAnswer} from '../src/domain/import';
import {progress} from '../src/domain/stats';
import {defaultSchedule, defaultSettings, type Course, type ExerciseType, type LearningState, type Lesson, type ReviewEvent, type Snapshot, type Word} from '../src/domain/types';

const now=new Date('2026-09-15T09:00:00Z');
const iso=now.toISOString();
const word=(id:string,index:number):Word=>({id,greek:`λέξη${index}`,russian:`слово${index}`,ipa:'',segments:[],examples:[],verified:false,createdAt:iso,updatedAt:iso});
const words=(count:number,prefix='w')=>Array.from({length:count},(_,index)=>word(`${prefix}${index}`,index));
type LessonSpec=Lesson&{wordIds:string[]};
const lesson=(id:string,wordIds:string[],targetDate:string|null,over:Partial<Lesson>={}):LessonSpec=>({id,title:id,targetDate,status:'upcoming',wordIds,createdAt:iso,updatedAt:iso,...over});
const course=(id:string,newWordsPerDay:number,over:Partial<Course>={}):Course=>({id,title:id,origin:'content',subscribed:true,schedule:defaultSchedule,newWordsPerDay,createdAt:iso,updatedAt:iso,...over});
/** Снимок для тестов: состав уроков задаётся массивами и раскладывается в связи с порядком. */
const base=(over:Partial<Omit<Snapshot,'lessons'>>&{lessons?:LessonSpec[]}={}):Snapshot=>({
 words:[],states:[],events:[],sessions:[],settings:defaultSettings,...over,
 lessons:(over.lessons??[]).map(({wordIds:_,...rest})=>rest),
 links:(over.lessons??[]).flatMap(l=>l.wordIds.map((wordId,position)=>({lessonId:l.id,wordId,position}))),
});
const planOf=(data:Snapshot,at=now)=>makePlan(fromSnapshot(data),at);
const sessionOf=(input:Omit<Parameters<typeof makeSession>[0],'source'>&{data:Snapshot})=>{const {data,...rest}=input;return makeSession({source:fromSnapshot(data),...rest})};
const learned=(id:string,due:string,state=State.Review):LearningState=>({
 wordId:id,introducedAt:'2026-09-01T09:00:00Z',version:1,
 card:{...createEmptyCard(new Date('2026-09-01')),due:new Date(due),state,scheduled_days:3,reps:2},
});

describe('темп принадлежит курсу',()=>{
 const pool=words(60);
 const ids=(from:number,to:number)=>pool.slice(from,to).map(w=>w.id);
 it('каждый курс берёт свой предел, а слова ближнего срока идут первыми',async()=>{
  const data=base({
   words:pool,
   courses:[course('near',10),course('far',5)],
   lessons:[
    lesson('l-near',ids(0,20),'2026-09-16',{courseId:'near'}),
    lesson('l-far',ids(20,40),'2026-09-22',{courseId:'far'}),
   ],
  });
  const plan=await planOf(data);
  expect(plan.courses.map(item=>[item.courseId,item.budget,item.newWordIds.length])).toEqual([['near',10,10],['far',5,5]]);
  expect(plan.newWordIds.slice(0,10)).toEqual(ids(0,10)); // курс с ближайшим занятием идёт раньше
  expect(plan.newWordIds).toHaveLength(15);
  expect(plan.budget).toBe(15);
 });
 it('слово из двух курсов вводится один раз и тратит бюджет обоих',async()=>{
  const shared=ids(0,3);
  const data=base({
   words:pool,
   courses:[course('a',4),course('b',4)],
   lessons:[lesson('la',[...shared,...ids(10,14)],'2026-09-18',{courseId:'a'}),lesson('lb',[...shared,...ids(20,24)],'2026-09-19',{courseId:'b'})],
   states:shared.map(id=>learned(id,'2026-09-30T09:00:00Z')),
  });
  // Общие слова уже введены: сегодняшний бюджет обоих курсов уменьшен на три.
  const plan=await planOf(data,new Date('2026-09-15T09:00:00Z'));
  expect(plan.courses.map(item=>[item.courseId,item.introducedToday])).toEqual([['a',0],['b',0]]);
  const same=base({words:pool,courses:[course('a',4),course('b',4)],
   lessons:[lesson('la',[...shared,...ids(10,14)],'2026-09-18',{courseId:'a'}),lesson('lb',[...shared,...ids(20,24)],'2026-09-19',{courseId:'b'})],
   states:shared.map(id=>({...learned(id,'2026-09-30T09:00:00Z'),introducedAt:'2026-09-15T08:00:00Z'}))});
  const today=await planOf(same,new Date('2026-09-15T09:00:00Z'));
  expect(today.courses.map(item=>[item.courseId,item.introducedToday,item.budget])).toEqual([['a',3,1],['b',3,1]]);
 });
 it('нехватка предела считается по курсу и называет его',async()=>{
  const data=base({words:pool,courses:[course('slow',5),course('calm',10)],
   lessons:[lesson('l-slow',ids(0,20),'2026-09-17',{courseId:'slow'}),lesson('l-calm',ids(20,25),'2026-09-30',{courseId:'calm'})]});
  const plan=await planOf(data);
  const slow=plan.courses.find(item=>item.courseId==='slow')!;
  expect([slow.requiredPerDay,slow.shortfall]).toEqual([10,true]);
  expect(plan.courses.find(item=>item.courseId==='calm')!.shortfall).toBe(false);
  expect(plan.shortfall).toBe(true); // сводно: хотя бы один курс не успевает
 });
});

describe('подготовка к нескольким занятиям',()=>{
 const pool=words(40);
 it('распределяет 30 слов на три дня и предупреждает, когда лимита не хватает',async()=>{
  const data=base({words:pool,lessons:[lesson('l1',pool.slice(0,30).map(w=>w.id),'2026-09-18')]});
  expect((await planOf(data)).requiredPerDay).toBe(10);
  expect((await planOf(data)).shortfall).toBe(false);
  const urgent=base({words:pool,lessons:[lesson('l1',pool.slice(0,30).map(w=>w.id),'2026-09-16')]});
  const plan=await planOf(urgent);
  expect(plan.requiredPerDay).toBe(30);
  expect(plan.shortfall).toBe(true);
  expect(plan.newWordIds).toHaveLength(10); // дневной лимит не превышается автоматически
 });
 it('считает общее слово двух наборов один раз по самой ранней дате',async()=>{
  const shared=pool.slice(0,10).map(w=>w.id);
  const data=base({words:pool,lessons:[lesson('l3',shared,'2026-09-17'),lesson('l4',[...shared,...pool.slice(10,20).map(w=>w.id)],'2026-09-19')]});
  const plan=await planOf(data);
  expect(plan.deadlines.map(d=>[d.newLeft,d.requiredPerDay])).toEqual([[10,5],[20,5]]);
  expect(plan.requiredPerDay).toBe(5);
 });
 it('перенос даты меняет темп, но не трогает уже введённые слова',async()=>{
  const ids=pool.slice(0,30).map(w=>w.id);
  const states=ids.slice(0,6).map(id=>learned(id,'2026-09-20T09:00:00Z'));
  const moved=base({words:pool,lessons:[lesson('l1',ids,'2026-09-20')],states});
  const plan=await planOf(moved);
  expect(plan.deadlines[0].newLeft).toBe(24);
  expect(plan.requiredPerDay).toBe(5);
  expect(plan.newWordIds.every(id=>!states.some(state=>state.wordId===id))).toBe(true);
 });
 it('прошедший урок не исчезает: слова идут в общей очереди',async()=>{
  const data=base({words:pool.slice(0,3),lessons:[lesson('old',pool.slice(0,3).map(w=>w.id),'2026-09-10')]});
  const plan=await planOf(data);
  expect(plan.deadlines).toHaveLength(0);
  expect(plan.newWordIds).toHaveLength(3);
 });
 it('слова ближайшего занятия идут раньше хвоста прошедших',async()=>{
  const late=pool.slice(0,4).map(w=>w.id), soon=pool.slice(10,30).map(w=>w.id);
  const data=base({words:pool,lessons:[
   lesson('done',late.slice(0,2),'2026-09-08',{status:'completed'}), // помечен пройденным
   lesson('missed',late.slice(2),'2026-09-12'), // дата прошла, статус остался прежним
   lesson('next',soon,'2026-09-18'),
  ]});
  const plan=await planOf(data);
  expect(plan.backlog).toEqual({wordIds:late,lessons:2}); // хвост по-прежнему виден отдельно
  expect(plan.newWordIds).toEqual(soon.slice(0,10)); // квота целиком уходит на подготовку к будущему
  expect(plan.deadlines[0].newLeft).toBe(20); // хвост в счёт срока не входит
  expect(plan.deadlines[0].requiredPerDay).toBe(7);
  expect(plan.origins.get(soon[0])).toEqual({lessonId:'next',title:'next',past:false});
  expect(plan.origins.get(late[0])).toEqual({lessonId:'done',title:'done',past:true});
 });
 it('хвост добирает остаток бюджета после слов ближайшего занятия',async()=>{
  const late=pool.slice(0,4).map(w=>w.id), soon=pool.slice(10,16).map(w=>w.id), later=pool.slice(20,30).map(w=>w.id);
  const data=base({words:pool,lessons:[
   lesson('done',late,'2026-09-08',{status:'completed'}),
   lesson('next',soon,'2026-09-18'),
   lesson('later',later,null), // урок без даты идёт после хвоста
  ]});
  const plan=await planOf(data);
  expect(plan.newWordIds).toEqual([...soon,...late]);
  expect(plan.deadlines[0].newLeft).toBe(6);
  const session=await sessionOf({data,now,random:()=>0.5});
  const fresh=session.items.filter(item=>item.isNew);
  expect(fresh.filter(item=>soon.includes(item.wordId)).every(item=>item.lessonTitle==='next'&&item.lessonPast===false)).toBe(true);
  expect(fresh.filter(item=>late.includes(item.wordId)).every(item=>item.lessonTitle==='done'&&item.lessonPast===true)).toBe(true);
  expect(fresh.length).toBe(10);
 });
 it('скан словаря локального курса не берёт слова уроков другого курса',async()=>{
  const foreign=pool.slice(0,5).map(w=>w.id), loose=pool.slice(40,43).map(w=>w.id);
  const data=base({words:[...pool.slice(0,5),...pool.slice(40,43)],
   courses:[course('leeke',10),course('my',10,{origin:'local'})],
   lessons:[lesson('done',foreign,null,{status:'completed',courseId:'leeke'})]});
  const plan=await planOf(data);
  const local=plan.courses.find(item=>item.courseId==='my')!;
  expect(local.newWordIds).toEqual(loose); // только слова вне уроков
  expect(plan.newWordIds).toEqual([...foreign,...loose]);
 });
 it('введённое слово прошедшего занятия в хвост не попадает: его ведёт повторение',async()=>{
  const ids=pool.slice(0,3).map(w=>w.id);
  // Урок 1.1 в поставке именно такой: пройден, даты нет.
  const data=base({words:pool,states:[learned(ids[0],'2026-09-20T09:00:00Z')],
   lessons:[lesson('done',ids,null,{status:'completed'})]});
  const plan=await planOf(data);
  expect(plan.backlog).toEqual({wordIds:ids.slice(1),lessons:1});
  expect(plan.reviews).toHaveLength(0); // срок ещё не подошёл, слово просто ждёт
 });
 it('без прошедших занятий хвоста нет',async()=>{
  const plan=await planOf(base({words:pool,lessons:[lesson('next',pool.slice(0,5).map(w=>w.id),'2026-09-18')]}));
  expect(plan.backlog).toEqual({wordIds:[],lessons:0});
 });
 it('день занятия считается догоняющей подготовкой с делителем один',async()=>{
  const ids=pool.slice(0,8).map(w=>w.id);
  const plan=await planOf(base({words:pool,lessons:[lesson('today',ids,'2026-09-15')]}));
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
 it('смешивает новые и повторения и не превышает размер занятия',async()=>{
  const states=ids.slice(20).map(id=>learned(id,'2026-09-15T06:00:00Z'));
  const data=base({words:pool,lessons:[lesson('l1',ids.slice(0,20),'2026-09-18')],states});
  const session=await sessionOf({data,now,random:()=>0.5});
  expect(session.items).toHaveLength(20);
  expect(session.items.filter(item=>item.isNew)).toHaveLength(10);
  expect(session.items.filter(item=>!item.isNew)).toHaveLength(10);
 });
 it('вторая сессия в тот же день не выдаёт новых слов сверх лимита',async()=>{
  const introduced=ids.slice(0,10).map(id=>({...learned(id,'2026-09-16T09:00:00Z'),introducedAt:iso}));
  const data=base({words:pool,lessons:[lesson('l1',ids,'2026-09-18')],states:introduced});
  const plan=await planOf(data);
  expect(plan.introducedToday).toBe(10);
  expect(plan.budget).toBe(0);
  expect((await sessionOf({data,now,random:()=>0.5})).items.every(item=>!item.isNew)).toBe(true);
 });
 it('сначала relearning, затем просроченные, затем сегодняшние',async()=>{
  const states=[
   learned(ids[0],'2026-09-15T08:00:00Z'),
   learned(ids[1],'2026-09-12T08:00:00Z'),
   {...learned(ids[2],'2026-09-14T08:00:00Z',State.Relearning)},
  ];
  const plan=await planOf(base({words:pool,states}));
  expect(plan.reviews.map(review=>review.wordId)).toEqual([ids[2],ids[1],ids[0]]);
 });
 it('аудирование доступно и без своего файла, если есть системный греческий голос',async()=>{
  const history=(['recall','recognition','assembly','spelling'] as ExerciseType[]).map((type,index)=>({
   id:`${type}`,sessionId:'s',itemId:`${type}`,wordId:ids[0],snapshot:{greek:'',russian:''},
   type,mode:'scheduled' as const,rating:3 as const,correct:true,answer:'',
   createdAt:`2026-09-1${index}T09:00:00Z`,localDate:`2026-09-1${index}`,responseTimeMs:900,
  }));
  const data=base({words:pool,states:[learned(ids[0],'2026-09-14T08:00:00Z')],events:history});
  const silent=(await sessionOf({data,now,random:()=>0.5,hasVoice:false})).items.find(item=>item.wordId===ids[0])!;
  expect(silent.type).not.toBe('listening');
  const spoken=(await sessionOf({data,now,random:()=>0.5,hasVoice:true})).items.find(item=>item.wordId===ids[0])!;
  expect(spoken.type).toBe('listening');
  expect(new Set(spoken.options).size).toBe(4);
 });
 it('плитки перемешиваются и не выпадают сразу в правильном порядке',()=>{
  const parts=['το','σπί','τι'];
  const mixed=shuffleTiles(parts,()=>0.5);
  expect([...mixed].sort()).toEqual([...parts].sort());
  expect(mixed.join('')).not.toBe(parts.join(''));
 });
 it('ручная тренировка набора берёт указанные слова в режиме practice',async()=>{
  const data=base({words:pool,lessons:[lesson('l1',ids,'2026-09-18')]});
  const session=await sessionOf({data,now,random:()=>0.5,mode:'practice',wordIds:ids.slice(0,3)});
  expect(session.items.map(item=>item.wordId)).toEqual(ids.slice(0,3));
  expect(session.items.every(item=>item.mode==='practice')).toBe(true);
 });
 it('варианты ответа уникальны, а при нехватке слов упражнение заменяется на сборку',async()=>{
  const options=optionsFor(pool[0],pool,'recognition',()=>0.5);
  expect(new Set(options).size).toBe(4);
  expect(options).toContain(pool[0].russian);
  expect(optionsFor(pool[0],pool.slice(0,3),'recognition',()=>0.5)).toEqual([]);
  const small=base({words:pool.slice(0,2),states:[learned(ids[0],'2026-09-14T08:00:00Z')]});
  expect((await sessionOf({data:small,now,random:()=>0.5})).items[0].type).not.toBe('recognition');
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
  expect(chooseType('w0',[],{})).toBe('recognition');
  expect(chooseType('w0',[event('recall',true,'2026-09-10T09:00:00Z')],{})).toBe('recognition');
  expect(chooseType('w0',[event('recall',true,'2026-09-10T09:00:00Z'),event('recognition',true,'2026-09-11T09:00:00Z')],{})).toBe('spelling');
 });
 it('аудирование не предлагается без аудио, а варианты — без набора слов',()=>{
  const history=(['recall','recognition','spelling'] as ExerciseType[]).map((type,index)=>event(type,true,`2026-09-1${index}T09:00:00Z`));
  expect(chooseType('w0',history,{})).not.toBe('listening');
  expect(chooseType('w0',history,{hasAudio:true})).toBe('listening');
  expect(chooseType('w0',history,{hasOptions:false})).not.toBe('recognition');
 });
 it('сборка предлагается раньше написания, а написание ждёт двух чистых сборок',()=>{
  const tested=[event('recall',true,'2026-09-10T09:00:00Z'),event('recognition',true,'2026-09-11T09:00:00Z')];
  expect(chooseType('w0',tested,{canAssemble:true})).toBe('assembly');
  const one=[...tested,event('assembly',true,'2026-09-12T09:00:00Z')];
  expect(chooseType('w0',one,{canAssemble:true})).not.toBe('spelling');
  const two=[...one,event('assembly',true,'2026-09-13T09:00:00Z')];
  expect(spellingUnlocked('w0',two)).toBe(true);
  expect(chooseType('w0',two,{canAssemble:true})).toBe('spelling');
 });
 it('ошибка в написании возвращает слово к сборке',()=>{
  const history=[
   event('recall',true,'2026-09-10T09:00:00Z'),event('recognition',true,'2026-09-11T09:00:00Z'),
   event('assembly',true,'2026-09-12T09:00:00Z'),event('assembly',true,'2026-09-13T09:00:00Z'),
   event('spelling',false,'2026-09-14T09:00:00Z'),
  ];
  expect(spellingUnlocked('w0',history)).toBe(false);
  expect(chooseType('w0',history,{canAssemble:true})).not.toBe('spelling');
  const recovered=[...history,event('assembly',true,'2026-09-15T09:00:00Z'),event('assembly',true,'2026-09-15T10:00:00Z')];
  expect(spellingUnlocked('w0',recovered)).toBe(true);
 });
 it('без слогов написание не блокируется',()=>{
  const tested=[event('recall',true,'2026-09-10T09:00:00Z'),event('recognition',true,'2026-09-11T09:00:00Z')];
  expect(chooseType('w0',tested,{canAssemble:false})).toBe('spelling');
 });
 it('выбирает самый слабый навык по последним ответам',()=>{
  const history=[
   event('recall',true,'2026-09-10T09:00:00Z'),event('recognition',true,'2026-09-11T09:00:00Z'),
   event('spelling',false,'2026-09-12T09:00:00Z'),event('listening',true,'2026-09-13T09:00:00Z'),
  ];
  expect(chooseType('w0',history,{hasAudio:true})).toBe('spelling');
 });
 it('не повторяет один тип три раза подряд',()=>{
  const history=[
   event('recognition',true,'2026-09-10T09:00:00Z'),event('listening',true,'2026-09-11T09:00:00Z'),
   event('recall',false,'2026-09-12T09:00:00Z'),event('spelling',true,'2026-09-13T09:00:00Z'),
   event('spelling',true,'2026-09-14T09:00:00Z'),
  ];
  expect(chooseType('w0',history,{hasAudio:true})).not.toBe('spelling');
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
 it('без истории не выдумывает оценку запоминания',async()=>{
  const stats=await progress(fromSnapshot(base({words:words(3)})),now);
  expect(stats.skills.every(skill=>skill.rate===null)).toBe(true);
  expect(stats.days).toHaveLength(7);
  expect(stats.groups.fresh).toBe(3);
 });
 it('сроки считает по календарю выбранной зоны, а не по суткам UTC',async()=>{
  const pool=words(2);
  // 22:00 UTC — это уже 01:00 следующего дня в Никосии, значит «сегодня» такое повторение не готово.
  const states=[
   {...learned(pool[0].id,'2026-09-15T22:00:00Z')},
   {...learned(pool[1].id,'2026-09-15T12:00:00Z')},
  ];
  const stats=await progress(fromSnapshot(base({words:pool,states})),now);
  expect(stats.due.today).toBe(1);
  expect(stats.due.tomorrow).toBe(2);
 });
 it('считает дни по локальной полуночи выбранной зоны',async()=>{
  const pool=words(2);
  const events:ReviewEvent[]=[{
   id:'e1',sessionId:'s',itemId:'i1',wordId:pool[0].id,snapshot:{greek:'',russian:''},type:'recall',mode:'scheduled',
   rating:3,correct:null,answer:'',createdAt:'2026-09-14T22:30:00Z',localDate:localDay(new Date('2026-09-14T22:30:00Z'),'Asia/Nicosia'),responseTimeMs:900,
  }];
  const stats=await progress(fromSnapshot(base({words:pool,events})),now);
  expect(stats.days.find(day=>day.date==='2026-09-15')!.answers).toBe(1);
 });
});
