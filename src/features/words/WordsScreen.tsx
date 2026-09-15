import {useMemo, useState} from 'react';
import {ChevronRight, Search} from 'lucide-react';
import {Link} from 'react-router-dom';
import {State} from 'ts-fsrs';
import {BrandBar} from '../../app/TopBar';
import {normalize} from '../../domain/import';
import {withCount, WORDS} from '../../shared/format';
import {liveWords, useSnapshot} from '../../shared/store';
import type {LearningState} from '../../domain/types';
import ui from '../../shared/ui.module.css';
import {cx} from '../../shared/cx';

type Filter='all'|'new'|'learning'|'review'|'solid';
const FILTERS:{key:Filter;label:string}[]=[
 {key:'all',label:'Все'},{key:'new',label:'Не начаты'},{key:'learning',label:'В изучении'},{key:'review',label:'На повторении'},{key:'solid',label:'Закреплены'},
];
export const stateGroup=(state:LearningState|undefined):Filter=>{
 if(!state)return 'new';
 if(state.card.state===State.Learning||state.card.state===State.Relearning)return 'learning';
 return state.card.scheduled_days>=21?'solid':'review';
};

export function WordsScreen(){
 const {data}=useSnapshot();
 const [query,setQuery]=useState('');
 const [filter,setFilter]=useState<Filter>('all');
 const [lessonId,setLessonId]=useState('');
 const states=useMemo(()=>new Map(data.states.map(state=>[state.wordId,state])),[data.states]);
 const found=useMemo(()=>{
  const needle=normalize(query);
  return liveWords(data)
   .filter(word=>!needle||normalize(word.greek).includes(needle)||word.russian.toLowerCase().includes(query.trim().toLowerCase()))
   .filter(word=>filter==='all'||stateGroup(states.get(word.id))===filter)
   .filter(word=>!lessonId||data.lessons.find(lesson=>lesson.id===lessonId)?.wordIds.includes(word.id))
   .sort((a,b)=>a.greek.localeCompare(b.greek,'el'));
 },[data,query,filter,lessonId,states]);
 return (
  <>
   <BrandBar/>
   <main className={ui.screen}>
    <h1>Слова</h1>
    <div className={ui.row} style={{gap:10,marginBottom:10}}>
     <Search size={20} className={ui.muted} aria-hidden/>
     <input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Поиск по греческому или русскому" aria-label="Поиск слова"/>
    </div>
    <div className={ui.row} style={{gap:8,overflowX:'auto',paddingBottom:8}}>
     {FILTERS.map(item=>(
      <button key={item.key} className={cx(ui.chip, filter!==item.key&&ui.grey)} style={{border:0,cursor:'pointer',whiteSpace:'nowrap'}}
       aria-pressed={filter===item.key} onClick={()=>setFilter(item.key)}>{item.label}</button>
     ))}
    </div>
    <label htmlFor="lesson-filter">Набор</label>
    <select id="lesson-filter" value={lessonId} onChange={event=>setLessonId(event.target.value)}>
     <option value="">Все наборы</option>
     {data.lessons.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
    </select>
    <p className={cx(ui.small, ui.muted)} style={{marginTop:14}}>{withCount(found.length,WORDS)}</p>
    {found.map(word=>{
     const group=stateGroup(states.get(word.id));
     return (
      <Link className={ui.item} key={word.id} to={`/words/${word.id}`}>
       <span className={ui.grow}>
        <span className={ui.title}>{word.greek}</span>
        <span className={ui.sub}>{word.russian} · {FILTERS.find(f=>f.key===group)!.label.toLowerCase()}</span>
       </span>
       <ChevronRight size={20} className={ui.badge} aria-hidden/>
      </Link>
     );
    })}
    {!found.length&&<p className={ui.muted}>Ничего не найдено. Измените запрос или фильтр.</p>}
   </main>
  </>
 );
}
