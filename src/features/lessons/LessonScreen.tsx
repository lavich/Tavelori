import {useEffect, useMemo, useState} from 'react';
import {ChevronRight, Inbox} from 'lucide-react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import {Card, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle} from '@/components/ui/empty';
import {Field, FieldDescription, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle} from '@/components/ui/item';
import {BackBar} from '../../app/TopBar';
import {makePlan} from '../../domain/learning';
import {useNow} from '../../shared/clock';
import {dayMonth, DAYS, withCount, WORDS} from '../../shared/format';
import {useSnapshot} from '../../shared/store';
import {removeFromLesson, updateLesson} from '../../storage/ops';
import {startSession} from '../learning/session-actions';
import ui from '../../shared/ui.module.css';

export function LessonScreen(){
 const {id}=useParams();
 const {data,ready}=useSnapshot();
 const lesson=data.lessons.find(item=>item.id===id); // из снимка: с датой по расписанию, а не сырая запись
 const now=useNow();
 const navigate=useNavigate();
 const [date,setDate]=useState('');
 const [saved,setSaved]=useState(false);
 useEffect(()=>{if(lesson)setDate(lesson.targetDate??'')},[lesson?.id,lesson?.targetDate]);
 const plan=useMemo(()=>makePlan(data,now),[data,now]);
 if(!lesson)return <><BackBar title="Урок"/><main className={ui.screen}>{ready&&<p className={ui.muted}>Урок не найден.</p>}</main></>;
 const deadline=plan.deadlines.find(item=>item.lessonId===lesson.id);
 const words=lesson.wordIds.map(wordId=>data.words.find(word=>word.id===wordId)).filter(word=>word&&!word.deletedAt);
 const notStarted=words.filter(word=>word&&!data.states.some(state=>state.wordId===word.id)).length;

 const applyDate=async()=>{await updateLesson(lesson.id,{targetDate:date||null});setSaved(true)};
 // Отметка закрепляет текущую дату как свою, чтобы урок остался якорем для следующих.
 const toggle=async()=>{await updateLesson(lesson.id,lesson.status==='completed'?{status:'upcoming'}:{status:'completed',targetDate:lesson.targetDate})};
 const practice=async()=>{
  const created=await startSession(data,now,{wordIds:lesson.wordIds,mode:'practice'});
  navigate(created?'/session':`/lessons/${lesson.id}`);
 };
 return (
  <>
   <BackBar title={lesson.title}/>
   <main className={ui.screen}>
    <Card className="mb-3 bg-soft ring-0">
     <CardHeader>
      <CardDescription className="text-accent-foreground">{lesson.targetDate?`Занятие ${dayMonth(lesson.targetDate)}`:'Дата не назначена'}</CardDescription>
      <CardTitle className="text-xl font-semibold">{withCount(words.length,WORDS)}, новых {notStarted}</CardTitle>
      <CardDescription>
       {deadline
        ?deadline.daysLeft===0?'Сегодня день занятия — идёт догоняющая подготовка.':`${withCount(deadline.daysLeft,DAYS)} на подготовку, нужный темп — ${withCount(deadline.requiredPerDay,WORDS)} в день`
        :lesson.status==='completed'?'Набор проведён, слова остаются в обычной очереди повторений.':'Дата в прошлом или не задана — слова идут в общей очереди.'}
      </CardDescription>
     </CardHeader>
    </Card>
    <Field>
     <FieldLabel htmlFor="date">Дата занятия</FieldLabel>
     <Input id="date" type="date" value={date} onChange={event=>{setDate(event.target.value);setSaved(false)}}/>
     {lesson.dateSource==='schedule'&&<FieldDescription>Дата по расписанию. Своя дата сдвинет следующие уроки.</FieldDescription>}
     {lesson.dateSource==='manual'&&lesson.status!=='completed'&&(
      <Button size="sm" variant="quiet" className="w-auto justify-self-start" onClick={()=>{updateLesson(lesson.id,{targetDate:null});setSaved(false)}}>Вернуть в расписание</Button>
     )}
    </Field>
    <div className="mt-3 grid grid-cols-2 gap-2.5">
     <Button size="md" onClick={applyDate}>Сохранить дату</Button>
     <Button size="md" variant="quiet" className="whitespace-normal leading-tight" onClick={toggle}>{lesson.status==='completed'?'Вернуть в предстоящие':'Отметить проведённым'}</Button>
    </div>
    {saved&&<p className="mt-2 text-sm text-(--ok)" role="status">Дата сохранена, план пересчитан. История ответов не изменилась.</p>}
    <Button size="xl" variant="soft" className="mt-3" onClick={practice}>Потренировать набор</Button>
    <h2>Слова набора</h2>
    <ItemGroup className="gap-2.5">
     {words.map(word=>word&&(
      <Item key={word.id} variant="outline" className="relative min-h-16 rounded-[var(--radius-card)] bg-card">
       <ItemContent>
        <ItemTitle className="text-base">
         <Link to={`/words/${word.id}`} className="text-foreground no-underline after:absolute after:inset-0">{word.greek}</Link>
        </ItemTitle>
        <ItemDescription>{word.russian}</ItemDescription>
       </ItemContent>
       <ItemActions>
        <Button size="sm" variant="quiet" className="relative z-10" onClick={()=>removeFromLesson(lesson.id,word.id)}>Убрать</Button>
        <ChevronRight className="text-muted-foreground"/>
       </ItemActions>
      </Item>
     ))}
    </ItemGroup>
    {!words.length&&(
     <Empty>
      <EmptyHeader>
       <EmptyMedia variant="icon"><Inbox/></EmptyMedia>
       <EmptyTitle>В наборе пока нет слов</EmptyTitle>
       <EmptyDescription>Импортируйте список из Quizlet или добавьте слова вручную.</EmptyDescription>
      </EmptyHeader>
      <Button size="md" variant="soft" className="w-auto" render={<Link to="/more/import"/>}>Импортировать слова</Button>
     </Empty>
    )}
   </main>
  </>
 );
}
