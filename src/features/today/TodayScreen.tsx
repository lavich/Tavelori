import {useState} from 'react';
import {ArrowRight, BookOpen, CalendarDays, ChevronRight, FileText, Plus, RefreshCw, TriangleAlert} from 'lucide-react';
import {Link, useNavigate} from 'react-router-dom';
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle} from '@/components/ui/item';
import {BrandBar} from '../../app/TopBar';
import {localDay} from '../../domain/learning';
import {useNow} from '../../shared/clock';
import {capitalize, dativeWeekday, dayMonth, DAYS, shortTitle, withCount, WORDS} from '../../shared/format';
import {useActiveSession, useCatalog, useLessons, usePlan, useSettings} from '../../shared/store';
import {startSession} from '../learning/session-actions';
import ui from '../../shared/ui.module.css';

export function TodayScreen(){
 const {settings}=useSettings();
 const now=useNow();
 const navigate=useNavigate();
 const [busy,setBusy]=useState(false);
 const [problem,setProblem]=useState('');
 // Экран читает план, метаданные уроков и активную сессию — не весь словарь и не историю.
 const plan=usePlan(now);
 const installed=useLessons(true);
 const unfinished=useActiveSession();
 const catalog=useCatalog();
 const ready=!!plan&&!!installed&&unfinished!==undefined;
 const next=plan?.deadlines[0];
 const lesson=next&&installed?.find(item=>item.id===next.lessonId);
 const today=localDay(now,settings.timezone);
 const lessons=[...(installed??[])].sort((a,b)=>
  Number(!!b.targetDate)-Number(!!a.targetDate)||(a.targetDate??'').localeCompare(b.targetDate??'')||a.createdAt.localeCompare(b.createdAt));
 const available=(catalog?.entries??[]).filter(entry=>!catalog?.packages.some(pack=>pack.lessonId===entry.id)).length;

 const begin=async()=>{
  setBusy(true); setProblem('');
  try{
   if(unfinished)return navigate('/session');
   const session=await startSession(now);
   if(!session)return setProblem('На сегодня очередь пуста. Можно потренировать слова вручную в разделе «Слова».');
   navigate('/session');
  }catch(error){setProblem(error instanceof Error?error.message:'Не удалось начать занятие');}
  finally{setBusy(false)}
 };

 return (
  <>
   <BrandBar/>
   <main className={ui.screen}>
    <p className={ui.eyebrow}>{capitalize(new Date(`${today}T12:00:00Z`).toLocaleDateString('ru-RU',{weekday:'long',timeZone:'UTC'}))}, {dayMonth(today)}</p>
    <h1>Немного каждый день</h1>

    <Card className="mb-3 bg-soft ring-0">
     <CardHeader>
      {next&&lesson?(
       <>
        <CardDescription className="flex items-center gap-2 text-[15px] text-accent-foreground">
         <CalendarDays/>
         {next.daysLeft===0?'Занятие сегодня':`К ${dativeWeekday(next.targetDate)}, ${dayMonth(next.targetDate)}`}
        </CardDescription>
        <CardTitle className="text-2xl font-bold">{lesson.title}</CardTitle>
        <CardDescription>
         {withCount(next.newLeft,WORDS)} · {next.daysLeft===0?'сегодня день занятия':`${withCount(next.daysLeft,DAYS)} на подготовку`}
        </CardDescription>
       </>
      ):(
       <>
        <CardTitle className="text-xl font-bold">Занятие не назначено</CardTitle>
        <CardDescription>Задайте расписание или дату набора на экране «Уроки», чтобы Lexi распределила слова по дням.</CardDescription>
       </>
      )}
     </CardHeader>
    </Card>

    <div className={ui.tiles}>
     <Card size="sm">
      <CardContent>
       <div className="text-[30px] leading-tight font-bold text-primary">{plan?.newWordIds.length??0}</div>
       <div className="text-sm text-muted-foreground">{plan?.budget?'новых сегодня':'новых на сегодня нет'}</div>
      </CardContent>
     </Card>
     <Card size="sm">
      <CardContent>
       <div className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="size-[18px]"/>Повторение</div>
       <div className="text-[26px] leading-tight font-bold text-primary">{plan?.reviews.length??0}</div>
      </CardContent>
     </Card>
    </div>

    {plan?.shortfall&&(
     <Alert variant="warning" className="mb-3">
      <TriangleAlert/>
      <AlertTitle>Дневного лимита не хватает</AlertTitle>
      <AlertDescription>
       Чтобы успеть к сроку, нужно {withCount(plan.requiredPerDay,WORDS)} в день, а лимит — {settings.newWordsPerDay}.
       Увеличьте лимит в настройках или перенесите дату.
      </AlertDescription>
     </Alert>
    )}

    <Button size="xl" onClick={begin} disabled={busy||!ready}>
     {unfinished?'Продолжить занятие':'Начать занятие'}<ArrowRight data-icon="inline-end"/>
    </Button>
    {problem&&<p className={ui.error}>{problem}</p>}

    <h2>Мои занятия</h2>
    {installed&&!installed.length&&(
     <Card className="mb-3">
      <CardHeader>
       <CardTitle className="text-lg">Уроков на устройстве пока нет</CardTitle>
       <CardDescription>{available?`В каталоге ${withCount(available,['урок','урока','уроков'])}: откройте урок, и его слова загрузятся на устройство.`:'Каталог ещё не загружен. Проверьте сеть или импортируйте свои слова.'}</CardDescription>
      </CardHeader>
      <CardContent><Button size="md" variant="soft" render={<Link to="/lessons"/>}><BookOpen data-icon="inline-start"/>Открыть каталог</Button></CardContent>
     </Card>
    )}
    <ItemGroup className="gap-2.5">
     {lessons.map(item=>(
      <Item key={item.id} variant="outline" className="min-h-16 rounded-[var(--radius-card)] bg-card" render={<Link to={`/lessons/${item.id}`}/>}>
       <ItemMedia variant="icon"><FileText/></ItemMedia>
       <ItemContent>
        <ItemTitle className="text-base">{shortTitle(item.title)} · {item.targetDate?`К ${dativeWeekday(item.targetDate)}`:item.status==='completed'?'Повторение':'Без даты'}</ItemTitle>
        <ItemDescription>{withCount(item.wordCount,WORDS)}{item.newCount?` · ${item.newCount} новых`:''}</ItemDescription>
       </ItemContent>
       <ItemActions><ChevronRight className="text-muted-foreground"/></ItemActions>
      </Item>
     ))}
    </ItemGroup>
    <Button size="xl" variant="soft" className="mt-2.5" render={<Link to="/lessons?new=1"/>}><Plus data-icon="inline-start"/>Добавить занятие</Button>
   </main>
  </>
 );
}
