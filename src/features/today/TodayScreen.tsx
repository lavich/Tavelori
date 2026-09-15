import {useMemo, useState} from 'react';
import {ArrowRight, CalendarDays, ChevronRight, FileText, Plus, RefreshCw} from 'lucide-react';
import {Link, useNavigate} from 'react-router-dom';
import {BrandBar} from '../../app/TopBar';
import {makePlan, localDay} from '../../domain/learning';
import {useNow} from '../../shared/clock';
import {capitalize, dativeWeekday, dayMonth, DAYS, shortTitle, withCount, WORDS} from '../../shared/format';
import {useSnapshot} from '../../shared/store';
import {activeSession, startSession} from '../learning/session-actions';

export function TodayScreen(){
 const {data,ready}=useSnapshot();
 const now=useNow();
 const navigate=useNavigate();
 const [busy,setBusy]=useState(false);
 const [problem,setProblem]=useState('');
 const plan=useMemo(()=>makePlan(data,now),[data,now]);
 const unfinished=activeSession(data);
 const next=plan.deadlines[0];
 const lesson=next&&data.lessons.find(item=>item.id===next.lessonId);
 const today=localDay(now,data.settings.timezone);
 const lessons=[...data.lessons].sort((a,b)=>
  Number(!!b.targetDate)-Number(!!a.targetDate)||(a.targetDate??'').localeCompare(b.targetDate??'')||a.createdAt.localeCompare(b.createdAt));

 const begin=async()=>{
  setBusy(true); setProblem('');
  try{
   if(unfinished)return navigate('/session');
   const session=await startSession(data,now);
   if(!session)return setProblem('На сегодня очередь пуста. Можно потренировать слова вручную в разделе «Слова».');
   navigate('/session');
  }catch(error){setProblem(error instanceof Error?error.message:'Не удалось начать занятие');}
  finally{setBusy(false)}
 };

 return (
  <>
   <BrandBar/>
   <main className="screen">
    <p className="eyebrow">{capitalize(new Date(`${today}T12:00:00Z`).toLocaleDateString('ru-RU',{weekday:'long',timeZone:'UTC'}))}, {dayMonth(today)}</p>
    <h1>Немного каждый день</h1>

    {next&&lesson?(
     <section className="card soft">
      <p className="row small" style={{gap:8,margin:'0 0 6px',color:'#1d4ed8'}}><CalendarDays size={18} aria-hidden/>
       {next.daysLeft===0?'Занятие сегодня':`К ${dativeWeekday(next.targetDate)}, ${dayMonth(next.targetDate)}`}</p>
      <h2 style={{margin:'0 0 4px',fontSize:24}}>{lesson.title}</h2>
      <p className="small muted" style={{margin:0}}>
       {withCount(next.newLeft,WORDS)} · {next.daysLeft===0?'сегодня день занятия':`${withCount(next.daysLeft,DAYS)} на подготовку`}
      </p>
     </section>
    ):(
     <section className="card soft">
      <h2 style={{margin:'0 0 4px',fontSize:22}}>Занятие не назначено</h2>
      <p className="small muted" style={{margin:0}}>Добавьте набор с датой, чтобы Lexi распределила слова по дням.</p>
     </section>
    )}

    <div className="tiles">
     <div className="tile">
      <div className="big">{plan.newWords.length}</div>
      <div className="label">{plan.budget?'новых сегодня':'новых на сегодня нет'}</div>
     </div>
     <div className="tile">
      <div className="row small muted" style={{gap:8}}><RefreshCw size={18} aria-hidden/>Повторение</div>
      <div className="big" style={{fontSize:26}}>{plan.reviews.length}</div>
     </div>
    </div>

    {plan.shortfall&&(
     <p className="card flat small" style={{color:'#854d0e',background:'#fffbeb',borderColor:'transparent'}}>
      Чтобы успеть к сроку, нужно {withCount(plan.requiredPerDay,WORDS)} в день, а дневной лимит — {plan.requiredPerDay>data.settings.newWordsPerDay?data.settings.newWordsPerDay:plan.requiredPerDay}. Увеличьте лимит в настройках или перенесите дату.
     </p>
    )}

    <button className="btn" onClick={begin} disabled={busy||!ready}>
     {unfinished?'Продолжить занятие':'Начать занятие'}<ArrowRight size={20} aria-hidden/>
    </button>
    {problem&&<p className="error">{problem}</p>}

    <h2>Мои занятия</h2>
    {lessons.map(item=>{
     const left=item.wordIds.filter(id=>!data.states.some(state=>state.wordId===id)).length;
     return (
      <Link className="item" key={item.id} to={`/lessons/${item.id}`}>
       <FileText size={20} aria-hidden className="muted"/>
       <span className="grow">
        <span className="title">{shortTitle(item.title)} · {item.targetDate?`К ${dativeWeekday(item.targetDate)}`:'Повторение'}</span>
        <span className="sub">{withCount(item.wordIds.length,WORDS)}{left?` · ${left} новых`:''}</span>
       </span>
       <ChevronRight size={20} className="badge" aria-hidden/>
      </Link>
     );
    })}
    <Link className="btn ghost" to="/lessons?new=1"><Plus size={20} aria-hidden/>Добавить занятие</Link>
   </main>
  </>
 );
}
