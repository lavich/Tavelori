import {useState} from 'react';
import {ChevronRight, FileText, Plus} from 'lucide-react';
import {Link, useSearchParams} from 'react-router-dom';
import {BrandBar} from '../../app/TopBar';
import {dativeWeekday, dayMonth, shortTitle, withCount, WORDS} from '../../shared/format';
import {useSnapshot} from '../../shared/store';
import {createLesson} from '../../storage/ops';

export function LessonsScreen(){
 const {data}=useSnapshot();
 const [params,setParams]=useSearchParams();
 const [title,setTitle]=useState('');
 const [date,setDate]=useState('');
 const [problem,setProblem]=useState('');
 const open=params.get('new')==='1';
 const add=async(event:React.FormEvent)=>{
  event.preventDefault();
  if(!title.trim())return setProblem('Введите название занятия, например «Урок 1.3».');
  await createLesson(title.trim(),date||null);
  setTitle('');setDate('');setProblem('');
  setParams({});
 };
 const lessons=[...data.lessons].sort((a,b)=>
  Number(!!b.targetDate)-Number(!!a.targetDate)||(a.targetDate??'').localeCompare(b.targetDate??'')||a.createdAt.localeCompare(b.createdAt));
 return (
  <>
   <BrandBar/>
   <main className="screen">
    <h1>Уроки</h1>
    {lessons.map(lesson=>(
     <Link className="item" key={lesson.id} to={`/lessons/${lesson.id}`}>
      <FileText size={20} aria-hidden className="muted"/>
      <span className="grow">
       <span className="title">{shortTitle(lesson.title)} · {lesson.targetDate?`К ${dativeWeekday(lesson.targetDate)}, ${dayMonth(lesson.targetDate)}`:'Без даты'}</span>
       <span className="sub">{withCount(lesson.wordIds.length,WORDS)} · {lesson.status==='completed'?'проведён':'предстоит'}</span>
      </span>
      <ChevronRight size={20} className="badge" aria-hidden/>
     </Link>
    ))}
    {open?(
     <form className="card" onSubmit={add}>
      <h2 style={{marginTop:0}}>Новое занятие</h2>
      <label htmlFor="title">Название</label>
      <input id="title" type="text" value={title} onChange={event=>setTitle(event.target.value)} placeholder="Урок 1.3"/>
      <label htmlFor="date">Дата занятия</label>
      <input id="date" type="date" value={date} onChange={event=>setDate(event.target.value)}/>
      {problem&&<p className="error">{problem}</p>}
      <div className="split" style={{marginTop:14}}>
       <button className="btn" type="submit">Создать</button>
       <button className="btn quiet" type="button" onClick={()=>setParams({})}>Отмена</button>
      </div>
     </form>
    ):<button className="btn ghost" onClick={()=>setParams({new:'1'})}><Plus size={20} aria-hidden/>Добавить занятие</button>}
    <Link className="btn quiet" to="/more/import" style={{marginTop:10}}>Импортировать слова из Quizlet</Link>
   </main>
  </>
 );
}
