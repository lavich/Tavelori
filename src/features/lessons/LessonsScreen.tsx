import {useState} from 'react';
import {ChevronRight, FileText, Plus} from 'lucide-react';
import {Link, useSearchParams} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Field, FieldGroup, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle} from '@/components/ui/item';
import {BrandBar} from '../../app/TopBar';
import {dativeWeekday, dayMonth, shortTitle, withCount, WORDS} from '../../shared/format';
import {useSnapshot} from '../../shared/store';
import {createLesson} from '../../storage/ops';
import ui from '../../shared/ui.module.css';

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
   <main className={ui.screen}>
    <h1>Уроки</h1>
    <ItemGroup className="gap-2.5">
     {lessons.map(lesson=>(
      <Item key={lesson.id} variant="outline" className="min-h-16 rounded-[var(--radius-card)] bg-card text-foreground" render={<Link to={`/lessons/${lesson.id}`}/>}>
       <ItemMedia variant="icon"><FileText/></ItemMedia>
       <ItemContent>
        <ItemTitle className="text-base">{shortTitle(lesson.title)} · {lesson.targetDate?`К ${dativeWeekday(lesson.targetDate)}, ${dayMonth(lesson.targetDate)}`:'Без даты'}</ItemTitle>
        <ItemDescription>{withCount(lesson.wordIds.length,WORDS)} · {lesson.status==='completed'?'проведён':'предстоит'}</ItemDescription>
       </ItemContent>
       <ItemActions><ChevronRight className="text-muted-foreground"/></ItemActions>
      </Item>
     ))}
    </ItemGroup>
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
         </Field>
         <Field>
          <FieldLabel htmlFor="date">Дата занятия</FieldLabel>
          <Input id="date" type="date" value={date} onChange={event=>setDate(event.target.value)}/>
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
