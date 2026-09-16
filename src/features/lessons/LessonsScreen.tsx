import {useState} from 'react';
import {ChevronRight, CloudDownload, FileText, Plus} from 'lucide-react';
import {Link, useSearchParams} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Field, FieldDescription, FieldGroup, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle} from '@/components/ui/item';
import {BrandBar} from '../../app/TopBar';
import {localDay} from '../../domain/learning';
import {lessonOrder, scheduleSet} from '../../domain/schedule';
import {useNow} from '../../shared/clock';
import {capitalize, dativeWeekday, dayMonth, shortTitle, weekday, withCount, WORDS} from '../../shared/format';
import {fileSize} from '../../shared/offline';
import {useCatalog, useLessons, useSettings} from '../../shared/store';
import {createLesson} from '../../storage/ops';
import {ScheduleCard} from './ScheduleCard';
import ui from '../../shared/ui.module.css';

export function LessonsScreen(){
 const {settings}=useSettings();
 const installed=useLessons()??[];
 const catalog=useCatalog();
 const today=localDay(useNow(),settings.timezone);
 const [params,setParams]=useSearchParams();
 const [title,setTitle]=useState('');
 const [problem,setProblem]=useState('');
 const open=params.get('new')==='1';
 const add=async(event:React.FormEvent)=>{
  event.preventDefault();
  if(!title.trim())return setProblem('Введите название занятия, например «Урок 1.3».');
  await createLesson(title.trim());
  setTitle('');setProblem('');
  setParams({});
 };
 const lessons=[...installed].sort((a,b)=>
  Number(!!b.targetDate)-Number(!!a.targetDate)||(a.targetDate??'').localeCompare(b.targetDate??'')||a.createdAt.localeCompare(b.createdAt));
 // Каталог показывает только то, чего ещё нет локально; пакет скачивается при открытии урока, а не при просмотре списка.
 const available=(catalog?.entries??[]).filter(entry=>!installed.some(lesson=>lesson.id===entry.id));
 return (
  <>
   <BrandBar/>
   <main className={ui.screen}>
    <h1>Уроки</h1>
    <ScheduleCard settings={settings} today={today} first={[...installed].sort(lessonOrder)[0]?.title}/>
    <ItemGroup className="gap-2.5">
     {lessons.map(lesson=>(
      <Item key={lesson.id} variant="outline" className="min-h-16 rounded-[var(--radius-card)] bg-card text-foreground" render={<Link to={`/lessons/${lesson.id}`}/>}>
       <ItemMedia variant="icon"><FileText/></ItemMedia>
       <ItemContent>
        <ItemTitle className="text-base">{shortTitle(lesson.title)} · {!lesson.targetDate?'Без даты':lesson.status==='completed'?`${capitalize(weekday(lesson.targetDate))}, ${dayMonth(lesson.targetDate)}`:`К ${dativeWeekday(lesson.targetDate)}, ${dayMonth(lesson.targetDate)}`}</ItemTitle>
        <ItemDescription>{withCount(lesson.wordCount,WORDS)} · {lesson.status==='completed'?'проведён':'предстоит'}{lesson.status!=='completed'&&lesson.dateSource==='manual'?' · дата вручную':''}</ItemDescription>
       </ItemContent>
       <ItemActions><ChevronRight className="text-muted-foreground"/></ItemActions>
      </Item>
     ))}
    </ItemGroup>
    {available.length>0&&(
     <>
      <h2>Доступны для загрузки</h2>
      <p className={`${ui.small} ${ui.muted}`}>Слова урока загрузятся на устройство, когда вы его откроете.</p>
      <ItemGroup className="gap-2.5" aria-label="Каталог уроков">
       {available.map(entry=>(
        <Item key={entry.id} variant="outline" className="min-h-16 rounded-[var(--radius-card)] bg-card text-foreground" render={<Link to={`/lessons/${entry.id}`}/>}>
         <ItemMedia variant="icon"><CloudDownload/></ItemMedia>
         <ItemContent>
          <ItemTitle className="text-base">{shortTitle(entry.title)} · не загружен</ItemTitle>
          <ItemDescription>{withCount(entry.wordCount,WORDS)} · {fileSize(entry.bytes+entry.media.bytes)}{entry.targetDate?` · занятие ${dayMonth(entry.targetDate)}`:entry.status==='completed'?' · проведён':''}</ItemDescription>
         </ItemContent>
         <ItemActions><ChevronRight className="text-muted-foreground"/></ItemActions>
        </Item>
       ))}
      </ItemGroup>
     </>
    )}
    {open?(
     <Card className="mt-3">
      <CardHeader><CardTitle className="text-lg">Новое занятие</CardTitle></CardHeader>
      <CardContent>
       <form onSubmit={add}>
        <FieldGroup>
         <Field data-invalid={!!problem||undefined}>
          <FieldLabel htmlFor="title">Название</FieldLabel>
          <Input id="title" value={title} placeholder="Урок 1.3" aria-invalid={!!problem||undefined}
           onChange={event=>setTitle(event.target.value)}/>
          <FieldDescription>{scheduleSet(settings.schedule)?'Дата назначится по расписанию — следующий свободный день после предыдущего урока.':'Дату можно задать на экране урока или через расписание.'}</FieldDescription>
         </Field>
        </FieldGroup>
        {problem&&<p className={ui.error}>{problem}</p>}
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
         <Button size="md" type="submit">Создать</Button>
         <Button size="md" variant="quiet" type="button" onClick={()=>setParams({})}>Отмена</Button>
        </div>
       </form>
      </CardContent>
     </Card>
    ):<Button size="xl" variant="soft" className="mt-2.5" onClick={()=>setParams({new:'1'})}><Plus data-icon="inline-start"/>Добавить занятие</Button>}
    <Button size="md" variant="quiet" className="mt-2.5" render={<Link to="/more/import"/>}>Импортировать слова из Quizlet</Button>
   </main>
  </>
 );
}
