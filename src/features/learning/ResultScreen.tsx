import {useMemo} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {useLiveQuery} from 'dexie-react-hooks';
import {formatDay, localDay} from '../../domain/learning';
import {useNow} from '../../shared/clock';
import {minutes, plural, withCount, WORDS} from '../../shared/format';
import {useSnapshot} from '../../shared/store';
import {db} from '../../storage/db';
import {startSession} from './session-actions';

export function ResultScreen(){
 const {id}=useParams();
 const navigate=useNavigate();
 const now=useNow();
 const {data}=useSnapshot();
 const session=useLiveQuery(()=>id?db.sessions.get(id):undefined,[id]);
 const events=useMemo(()=>data.events.filter(event=>event.sessionId===id),[data.events,id]);
 const words=new Set(events.map(event=>event.wordId));
 const objective=events.filter(event=>event.correct!==null);
 const mistakes=events.filter(event=>event.correct===false||(event.correct===null&&event.rating===1));
 const mistakeWords=[...new Set(mistakes.map(event=>event.wordId))];
 const readyAgain=mistakeWords.filter(wordId=>{
  const state=data.states.find(item=>item.wordId===wordId);
  return state&&new Date(state.card.due).getTime()<=now.getTime();
 });
 const nextDue=data.states
  .filter(state=>mistakeWords.includes(state.wordId))
  .map(state=>new Date(state.card.due))
  .sort((a,b)=>a.getTime()-b.getTime())[0];

 const repeat=async()=>{
  const created=await startSession(data,now,{wordIds:readyAgain});
  navigate(created?'/session':'/');
 };
 return (
  <main className="screen" style={{paddingTop:24}}>
   <h1>Занятие завершено</h1>
   <div className="tiles">
    <div className="tile"><div className="big">{words.size}</div><div className="label">{plural(words.size,WORDS)} в занятии</div></div>
    <div className="tile"><div className="big">{events.length}</div><div className="label">упражнений выполнено</div></div>
   </div>
   <section className="card">
    <p style={{margin:'0 0 6px'}}>Ошибок: <b>{mistakes.length}</b></p>
    <p className="small muted" style={{margin:'0 0 6px'}}>
     {objective.length
      ?`Объективная точность (выбор, аудирование, написание): ${Math.round(objective.filter(event=>event.correct).length/objective.length*100)}% из ${withCount(objective.length,['ответа','ответов','ответов'])}`
      :'Объективных проверок в этом занятии не было — только самооценка.'}
    </p>
    <p className="small muted" style={{margin:0}}>Активное время: {minutes(session?.activeTimeMs??0)}</p>
   </section>
   {mistakeWords.length>0&&(
    readyAgain.length>0
     ?<button className="btn ghost" onClick={repeat}>Повторить ошибки ({readyAgain.length})</button>
     :<p className="card flat small muted">Слова с ошибками вернутся{nextDue?` ${formatDay(localDay(nextDue,data.settings.timezone))}`:' в ближайшем занятии'} — так интервалы остаются честными.</p>
   )}
   <button className="btn" style={{marginTop:12}} onClick={()=>navigate('/')}>Готово</button>
  </main>
 );
}
