import {useMemo} from 'react';
import {Info} from 'lucide-react';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {Button} from '@/components/ui/button';
import {Card, CardContent} from '@/components/ui/card';
import {useNavigate, useParams} from 'react-router-dom';
import {useLiveQuery} from 'dexie-react-hooks';
import {formatDay, localDay} from '../../domain/learning';
import {useNow} from '../../shared/clock';
import {minutes, plural, withCount, WORDS} from '../../shared/format';
import {useSnapshot} from '../../shared/store';
import {db} from '../../storage/db';
import {startSession} from './session-actions';
import ui from '../../shared/ui.module.css';

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
  <main className={ui.screen} style={{paddingTop:24}}>
   <h1>Занятие завершено</h1>
   <div className={ui.tiles}>
    <Card size="sm"><CardContent>
     <div className="text-[30px] leading-tight font-bold text-primary">{words.size}</div>
     <div className="text-sm text-muted-foreground">{plural(words.size,WORDS)} в занятии</div>
    </CardContent></Card>
    <Card size="sm"><CardContent>
     <div className="text-[30px] leading-tight font-bold text-primary">{events.length}</div>
     <div className="text-sm text-muted-foreground">упражнений выполнено</div>
    </CardContent></Card>
   </div>
   <Card className="mb-3"><CardContent className="flex flex-col gap-1.5">
    <p className="m-0">Ошибок: <b>{mistakes.length}</b></p>
    <p className="m-0 text-sm text-muted-foreground">
     {objective.length
      ?`Объективная точность (выбор, сборка, аудирование, написание): ${Math.round(objective.filter(event=>event.correct).length/objective.length*100)}% из ${withCount(objective.length,['ответа','ответов','ответов'])}`
      :'Объективных проверок в этом занятии не было — только самооценка.'}
    </p>
    <p className="m-0 text-sm text-muted-foreground">Активное время: {minutes(session?.activeTimeMs??0)}</p>
   </CardContent></Card>
   {mistakeWords.length>0&&(
    readyAgain.length>0
     ?<Button variant="soft" size="xl" onClick={repeat}>Повторить ошибки ({readyAgain.length})</Button>
     :<Alert className="mb-3"><Info/><AlertDescription>Слова с ошибками вернутся{nextDue?` ${formatDay(localDay(nextDue,data.settings.timezone))}`:' в ближайшем занятии'} — так интервалы остаются честными.</AlertDescription></Alert>
   )}
   <Button size="xl" style={{marginTop:12}} onClick={()=>navigate('/')}>Готово</Button>
  </main>
 );
}
