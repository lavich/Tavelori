import {useEffect, useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import {X} from 'lucide-react';
import {useLiveQuery} from 'dexie-react-hooks';
import {useNavigate} from 'react-router-dom';
import {stopAudio} from '../../shared/audio';
import {useSnapshot} from '../../shared/store';
import {Progress} from '@/components/ui/progress';
import {Skeleton} from '@/components/ui/skeleton';
import {db} from '../../storage/db';
import {ConflictError, endSession, submitAnswer, markIntroduced, prepareObjectiveSession} from '../../storage/ops';
import {Assembly, Introduction, Listening, Recognition, Spelling, type Answer} from './exercises';
import {activeSession} from './session-actions';
import ui from '../../shared/ui.module.css';
import s from './session.module.css';

export function SessionScreen(){
 const navigate=useNavigate();
 const {data}=useSnapshot();
 const [sessionId,setSessionId]=useState<string|null>(null);
 // Сессию держим по id: последний ответ переводит её в done, но экран должен дорисовать обратную связь.
 const session=useLiveQuery(()=>sessionId
  ?db.sessions.get(sessionId)
  :db.sessions.orderBy('id').reverse().filter(entry=>entry.status==='active').first(),[sessionId]);
 useEffect(()=>{
  if(!session||sessionId)return;
  setSessionId(session.id);
  setCursor(session.items.findIndex(entry=>!entry.eventId)); // продолжаем с первого неотвеченного
  active.current={ms:session.activeTimeMs,since:Date.now()}; // время прошлых заходов не теряется
 },[session?.id]);
 const [cursor,setCursor]=useState<number|null>(null);
 const [introducing,setIntroducing]=useState(false);
 const [preparing,setPreparing]=useState(false);
 useEffect(()=>{
  if(!session||session.objectiveVersion===1)return;
  setPreparing(true);
  prepareObjectiveSession(session.id).catch(()=>setProblem('Не удалось подготовить занятие. Обновите страницу.')).finally(()=>setPreparing(false));
 },[session?.id,session?.objectiveVersion]);
 const [problem,setProblem]=useState('');
 const shown=useRef(Date.now());
 const active=useRef({ms:0,since:Date.now()});
 const previous=useRef<string|undefined>(undefined);
 const position=cursor??session?.items.findIndex(entry=>!entry.eventId)??0;
 const item=session&&position>=0?session.items[position]:undefined;
 const introduction=session?.items.find(entry=>entry.isNew&&!entry.eventId&&!entry.retryOf&&!session.introducedWordIds?.includes(entry.wordId));

 useEffect(()=>{
  shown.current=Date.now();
  if(previous.current&&!document.hidden)active.current.ms+=Date.now()-active.current.since;
  previous.current=item?.id;
  active.current.since=Date.now();
  stopAudio();
 },[item?.id,introduction?.wordId]);
 useEffect(()=>{
  // Время скрытой вкладки не считается активным временем занятия.
  const change=()=>{
   if(document.hidden){active.current.ms+=Date.now()-active.current.since;stopAudio()}
   else active.current.since=Date.now();
  };
  document.addEventListener('visibilitychange',change);
  return()=>{document.removeEventListener('visibilitychange',change);stopAudio()};
 },[]);
 useEffect(()=>{
  if(session&&session.items.length&&position<0)navigate(`/session/result/${session.id}`,{replace:true});
 },[session?.id,position]);

 if(session===undefined||preparing)return (
  <main className={s.session}>
   <div className="flex flex-col gap-3 py-6"><Skeleton className="h-8 w-40"/><Skeleton className="h-48 w-full"/><Skeleton className="h-14 w-full"/></div>
  </main>
 );
 if(!session||!item){
  const other=activeSession(data);
  return (
   <main className={s.session}>
    <p className={ui.muted}>Активного занятия нет.</p>
    <Button size="xl" onClick={()=>navigate(other?'/session':'/')}>На главную</Button>
   </main>
  );
 }

 const introductions=session.items.filter(entry=>entry.isNew&&!entry.eventId&&!entry.retryOf);
 const step=introduction?introductions.findIndex(entry=>entry.id===introduction.id):position;
 const total=introduction?introductions.length:session.items.length;
 const activeMs=()=>active.current.ms+(document.hidden?0:Date.now()-active.current.since);
 const answer=async({correct,text}:Answer):Promise<boolean>=>{
  setProblem('');
  try{
   await submitAnswer({
    session,item,correct,answer:text,
    responseTimeMs:Date.now()-shown.current,activeTimeMs:activeMs(),
    timezone:data.settings.timezone,
   });
   return true;
  }catch(error){
   setProblem(error instanceof ConflictError?error.message:'Не удалось сохранить ответ. Проверьте место на устройстве и попробуйте ещё раз.');
   return false;
  }
 };
 const introduce=async()=>{
  if(!introduction||introducing)return;
  setProblem('');setIntroducing(true);
  try{await markIntroduced(session.id,introduction.wordId,activeMs());shown.current=Date.now()}
  catch{setProblem('Не удалось сохранить знакомство. Попробуйте ещё раз.')}
  finally{setIntroducing(false)}
 };
 const next=()=>{
  const following=position+1;
  if(following>=session.items.length)return navigate(`/session/result/${session.id}`,{replace:true});
  setCursor(following);
 };
 const leave=async()=>{
  await endSession({...session,activeTimeMs:activeMs()});
  navigate('/');
 };
 // key по упражнению: иначе следующее слово успевает показаться с ответом предыдущего.
 const view=session.objectiveVersion!==1?null:introduction
  ?<Introduction key={introduction.id} word={introduction.word} onReady={introduce} saving={introducing}/>
  :item.type==='recognition'?<Recognition key={item.id} item={item} onAnswer={answer} onNext={next}/>
  :item.type==='listening'?<Listening key={item.id} item={item} onAnswer={answer} onNext={next}/>
  :item.type==='assembly'?<Assembly key={item.id} item={item} onAnswer={answer} onNext={next}/>
  :<Spelling key={item.id} item={item} onAnswer={answer} onNext={next}/>;

 return (
  <main className={s.session}>
   <div className={s.top}>
    <Button variant="ghost" size="icon-lg" className="size-11" onClick={leave} aria-label="Закрыть занятие"><X/></Button>
    <Progress value={(step/total)*100} className="h-2 flex-1"/>
    <span className={s.counter} aria-label={`${introduction?'Знакомство':'Упражнение'} ${step+1} из ${total}`}>{step+1} / {total}</span>
   </div>
   <div className={s.body}>{view}</div>
   {problem&&<p className={ui.error} role="alert">{problem}</p>}
  </main>
 );
}
