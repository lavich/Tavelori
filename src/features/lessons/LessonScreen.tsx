import {useEffect, useMemo, useState} from 'react';
import {ChevronRight} from 'lucide-react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {BackBar} from '../../app/TopBar';
import {makePlan} from '../../domain/learning';
import {useNow} from '../../shared/clock';
import {dayMonth, DAYS, withCount, WORDS} from '../../shared/format';
import {useLesson, useSnapshot} from '../../shared/store';
import {removeFromLesson, saveLesson} from '../../storage/ops';
import {startSession} from '../learning/session-actions';
import ui from '../../shared/ui.module.css';
import {cx} from '../../shared/cx';

export function LessonScreen(){
 const {id}=useParams();
 const lesson=useLesson(id);
 const {data}=useSnapshot();
 const now=useNow();
 const navigate=useNavigate();
 const [date,setDate]=useState('');
 const [saved,setSaved]=useState(false);
 useEffect(()=>{if(lesson)setDate(lesson.targetDate??'')},[lesson?.id]);
 const plan=useMemo(()=>makePlan(data,now),[data,now]);
 if(!lesson)return <><BackBar title="Урок"/><main className={ui.screen}><p className={ui.muted}>Урок не найден.</p></main></>;
 const deadline=plan.deadlines.find(item=>item.lessonId===lesson.id);
 const words=lesson.wordIds.map(wordId=>data.words.find(word=>word.id===wordId)).filter(word=>word&&!word.deletedAt);
 const notStarted=words.filter(word=>word&&!data.states.some(state=>state.wordId===word.id)).length;

 const applyDate=async()=>{await saveLesson({...lesson,targetDate:date||null});setSaved(true)};
 const toggle=async()=>{await saveLesson({...lesson,status:lesson.status==='completed'?'upcoming':'completed'})};
 const practice=async()=>{
  const created=await startSession(data,now,{wordIds:lesson.wordIds,mode:'practice'});
  navigate(created?'/session':`/lessons/${lesson.id}`);
 };
 return (
  <>
   <BackBar title={lesson.title}/>
   <main className={ui.screen}>
    <section className={cx(ui.card, ui.soft)}>
     <p className={ui.small} style={{margin:'0 0 4px',color:'#1d4ed8'}}>{lesson.targetDate?`Занятие ${dayMonth(lesson.targetDate)}`:'Дата не назначена'}</p>
     <p style={{margin:'0 0 4px',fontSize:20,fontWeight:600}}>{withCount(words.length,WORDS)}, новых {notStarted}</p>
     <p className={cx(ui.small, ui.muted)} style={{margin:0}}>
      {deadline
       ?deadline.daysLeft===0?'Сегодня день занятия — идёт догоняющая подготовка.':`${withCount(deadline.daysLeft,DAYS)} на подготовку, нужный темп — ${withCount(deadline.requiredPerDay,WORDS)} в день`
       :lesson.status==='completed'?'Набор проведён, слова остаются в обычной очереди повторений.':'Дата в прошлом или не задана — слова идут в общей очереди.'}
     </p>
    </section>
    <label htmlFor="date">Дата занятия</label>
    <input id="date" type="date" value={date} onChange={event=>{setDate(event.target.value);setSaved(false)}}/>
    <div className={ui.split} style={{marginTop:12}}>
     <button className={ui.btn} onClick={applyDate}>Сохранить дату</button>
     <button className={cx(ui.btn, ui.quiet)} onClick={toggle}>{lesson.status==='completed'?'Вернуть в предстоящие':'Отметить проведённым'}</button>
    </div>
    {saved&&<p className={ui.small} role="status" style={{color:'var(--ok)'}}>Дата сохранена, план пересчитан. История ответов не изменилась.</p>}
    <button className={cx(ui.btn, ui.ghost)} style={{marginTop:12}} onClick={practice}>Потренировать набор</button>
    <h2>Слова набора</h2>
    {words.map(word=>word&&(
     <div className={ui.item} key={word.id}>
      <Link className={ui.grow} to={`/words/${word.id}`} style={{textDecoration:'none',color:'inherit'}}>
       <span className={ui.title}>{word.greek}</span>
       <span className={ui.sub}>{word.russian}</span>
      </Link>
      <button className={cx(ui.btn, ui.btnSmall, ui.quiet)} onClick={()=>removeFromLesson(lesson.id,word.id)}>Убрать</button>
      <ChevronRight size={18} className={ui.badge} aria-hidden/>
     </div>
    ))}
    {!words.length&&<p className={ui.muted}>В наборе пока нет слов. <Link to="/more/import">Импортируйте список</Link>.</p>}
   </main>
  </>
 );
}
