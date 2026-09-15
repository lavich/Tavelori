import {useMemo} from 'react';
import {BackBar} from '../../app/TopBar';
import {progress, SKILL_NAMES} from '../../domain/stats';
import {useNow} from '../../shared/clock';
import {dayMonth, withCount, WORDS} from '../../shared/format';
import {useSnapshot} from '../../shared/store';

export function StatsScreen(){
 const {data}=useSnapshot();
 const now=useNow();
 const stats=useMemo(()=>progress(data,now),[data,now]);
 const peak=Math.max(1,...stats.days.map(day=>day.answers));
 return (
  <>
   <BackBar title="Статистика"/>
   <main className="screen">
    <h2 style={{marginTop:0}}>Последние 7 дней</h2>
    {data.events.length===0&&<p className="muted">Ответов пока нет — статистика появится после первого занятия.</p>}
    <section className="card">
     {stats.days.map(day=>(
      <div key={day.date} style={{marginBottom:10}}>
       <div className="row between small"><span>{dayMonth(day.date)}</span><span className="muted">{day.answers} отв. · {day.words} сл.</span></div>
       <div className="bar"><i style={{width:`${(day.answers/peak)*100}%`}}/></div>
      </div>
     ))}
    </section>
    <h2>Сроки повторений</h2>
    <div className="tiles">
     <div className="tile"><div className="big">{stats.due.today}</div><div className="label">готовы сегодня</div></div>
     <div className="tile"><div className="big">{stats.due.week}</div><div className="label">в ближайшую неделю</div></div>
    </div>
    <h2>Состояние словаря</h2>
    <section className="card">
     <p className="row between" style={{margin:'0 0 6px'}}><span>Не начаты</span><b>{stats.groups.fresh}</b></p>
     <p className="row between" style={{margin:'0 0 6px'}}><span>В изучении</span><b>{stats.groups.learning}</b></p>
     <p className="row between" style={{margin:'0 0 6px'}}><span>На повторении</span><b>{stats.groups.review}</b></p>
     <p className="row between" style={{margin:0}}><span>Закреплены (интервал от 21 дня)</span><b>{stats.groups.solid}</b></p>
    </section>
    <h2>Навыки</h2>
    <section className="card">
     {stats.skills.map(skill=>(
      <div key={skill.type} style={{marginBottom:10}}>
       <div className="row between small">
        <span>{SKILL_NAMES[skill.type]}</span>
        <span className="muted">{skill.rate===null?'нет ответов':`${Math.round(skill.rate*100)}% из ${withCount(skill.attempts,['попытки','попыток','попыток'])}`}</span>
       </div>
       <div className="bar"><i style={{width:`${(skill.rate??0)*100}%`}}/></div>
      </div>
     ))}
     <p className="small muted" style={{margin:0}}>Это доля успешных последних ответов, а не оценка вероятности запоминания.</p>
    </section>
    <p className="small muted">Всего записано {withCount(data.events.length,['ответ','ответа','ответов'])} по {withCount(new Set(data.events.map(event=>event.wordId)).size,WORDS)}.</p>
   </main>
  </>
 );
}
