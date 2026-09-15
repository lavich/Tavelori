import {useEffect, useRef, useState} from 'react';
import {X} from 'lucide-react';
import {useLiveQuery} from 'dexie-react-hooks';
import {useNavigate} from 'react-router-dom';
import type {Grade} from 'ts-fsrs';
import {stopAudio} from '../../shared/audio';
import {useSnapshot} from '../../shared/store';
import {db} from '../../storage/db';
import {ConflictError, endSession, submitAnswer} from '../../storage/ops';
import {Introduction, Listening, Recall, Recognition, Spelling, type Answer} from './exercises';
import {activeSession} from './session-actions';

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
 const [introduced,setIntroduced]=useState<string|null>(null);
 const [problem,setProblem]=useState('');
 const shown=useRef(Date.now());
 const active=useRef({ms:0,since:Date.now()});
 const previous=useRef<string|undefined>(undefined);
 const position=cursor??session?.items.findIndex(entry=>!entry.eventId)??0;
 const item=session&&position>=0?session.items[position]:undefined;

 useEffect(()=>{
  shown.current=Date.now();
  if(previous.current&&!document.hidden)active.current.ms+=Date.now()-active.current.since;
  previous.current=item?.id;
  active.current.since=Date.now();
  stopAudio();
 },[item?.id]);
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

 if(session===undefined)return <main className="session"><p className="muted">Загружаем занятие…</p></main>;
 if(!session||!item){
  const other=activeSession(data);
  return (
   <main className="session">
    <p className="muted">Активного занятия нет.</p>
    <button className="btn" onClick={()=>navigate(other?'/session':'/')}>На главную</button>
   </main>
  );
 }

 const activeMs=()=>active.current.ms+(document.hidden?0:Date.now()-active.current.since);
 const answer=async({correct,rating,text}:Answer):Promise<boolean>=>{
  setProblem('');
  try{
   await submitAnswer({
    session,item,rating:rating as Grade,correct,answer:text,
    responseTimeMs:Date.now()-shown.current,activeTimeMs:activeMs(),
    timezone:data.settings.timezone,
   });
   return true;
  }catch(error){
   setProblem(error instanceof ConflictError?error.message:'Не удалось сохранить ответ. Проверьте место на устройстве и попробуйте ещё раз.');
   return false;
  }
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
 const view=item.isNew&&introduced!==item.id
  ?<Introduction key={item.id} word={item.word} onReady={()=>{shown.current=Date.now();setIntroduced(item.id)}}/>
  :item.type==='recognition'?<Recognition key={item.id} item={item} onAnswer={answer} onNext={next}/>
  :item.type==='listening'?<Listening key={item.id} item={item} onAnswer={answer} onNext={next}/>
  :item.type==='spelling'?<Spelling key={item.id} item={item} onAnswer={answer} onNext={next}/>
  :<Recall key={item.id} item={item} onAnswer={answer} onNext={next}/>;

 return (
  <main className="session">
   <div className="row between">
    <button className="icon-btn" onClick={leave} aria-label="Закрыть занятие"><X size={24}/></button>
    <span className="muted" aria-label={`Упражнение ${position+1} из ${session.items.length}`}>{position+1} / {session.items.length}</span>
   </div>
   <div className="progress"><i style={{width:`${(position/session.items.length)*100}%`}}/></div>
   <div className="center">{view}</div>
   {problem&&<p className="error" role="alert">{problem}</p>}
  </main>
 );
}
