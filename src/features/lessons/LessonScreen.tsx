import {useEffect, useState} from 'react';
import {ChevronRight, CloudDownload, CloudOff, Inbox, RefreshCw} from 'lucide-react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle} from '@/components/ui/empty';
import {Field, FieldDescription, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle} from '@/components/ui/item';
import {Skeleton} from '@/components/ui/skeleton';
import {BackBar} from '../../app/TopBar';
import {downloadLessonMedia, installLesson, type InstallResult} from '../../content/client';
import {useNow} from '../../shared/clock';
import {dayMonth, DAYS, withCount, WORDS} from '../../shared/format';
import {useOfflineStatus} from '../../shared/offline';
import {useCatalog, useInstallPhase, useLesson, usePlan, useReadiness} from '../../shared/store';
import {removeFromLesson, updateLesson} from '../../storage/ops';
import {startSession} from '../learning/session-actions';
import ui from '../../shared/ui.module.css';

/** Сообщение об обновлении: локальные правки сохранены, конфликты названы, а не проглочены. */
export function reportInstall(result:InstallResult){
 if(result.status==='current')return;
 const summary=result.status==='installed'?`Урок загружен: ${withCount(result.added,WORDS)}.`:`Урок обновлён: новых ${result.added}, изменено ${result.changed}.`;
 if(!result.conflicts.length)return void toast.success(summary);
 toast.warning(`${summary} Ваши правки сохранены для ${withCount(result.conflicts.length,WORDS)}: ${result.conflicts.slice(0,3).map(c=>c.greek).join(', ')}${result.conflicts.length>3?'…':''}. Новая версия этих полей не применена.`,{duration:12000});
}

export function LessonScreen(){
 const {id}=useParams();
 const detail=useLesson(id); // из выборки: урок с датой по расписанию, связанные живые карточки и их состояния
 const catalog=useCatalog();
 const phase=useInstallPhase(id);
 const readiness=useReadiness(id);
 const shell=useOfflineStatus();
 const now=useNow();
 const navigate=useNavigate();
 const plan=usePlan(now);
 const [date,setDate]=useState('');
 const [saved,setSaved]=useState(false);
 const [downloading,setDownloading]=useState(false);
 const [mediaProblem,setMediaProblem]=useState('');
 const entry=catalog?.entries.find(item=>item.id===id);
 const lesson=detail?.lesson;
 useEffect(()=>{if(lesson)setDate(lesson.targetDate??'')},[lesson?.id,lesson?.targetDate]);

 const install=()=>{if(id)installLesson(id).then(reportInstall).catch(()=>undefined)};
 // Открытие неустановленного урока из каталога загружает его пакет; без сети покажется ошибка с повтором.
 useEffect(()=>{
  if(detail===null&&entry&&phase.phase==='idle')install();
 },[detail===null,entry?.id,phase.phase]);

 if(detail===undefined||(detail===null&&catalog===undefined))return <><BackBar title="Урок"/><main className={ui.screen}><div className="flex flex-col gap-3 py-2"><Skeleton className="h-28 w-full"/><Skeleton className="h-14 w-full"/><Skeleton className="h-14 w-full"/></div></main></>;
 if(detail===null){
  if(!entry)return <><BackBar title="Урок"/><main className={ui.screen}><p className={ui.muted}>Урок не найден.</p></main></>;
  return (
   <>
    <BackBar title={entry.title}/>
    <main className={ui.screen}>
     <Card className="mb-3 bg-soft ring-0">
      <CardHeader>
       <CardDescription className="flex items-center gap-2 text-accent-foreground">{phase.phase==='error'?<CloudOff/>:<CloudDownload/>}{phase.phase==='loading'?'Загружаем слова урока…':phase.phase==='error'?'Пакет не загружен':'Урок не загружен на устройство'}</CardDescription>
       <CardTitle className="text-xl font-semibold">{withCount(entry.wordCount,WORDS)}</CardTitle>
       <CardDescription>{phase.phase==='error'?phase.message:'Слова и связи сохранятся локально после проверки пакета. Картинки подгружаются при просмотре.'}</CardDescription>
      </CardHeader>
      {phase.phase==='error'&&<CardContent><Button size="md" variant="soft" onClick={install}><RefreshCw data-icon="inline-start"/>Повторить загрузку</Button></CardContent>}
     </Card>
     {phase.phase==='loading'&&<div className="flex flex-col gap-3" aria-busy="true" role="status" aria-label="Загрузка урока"><Skeleton className="h-14 w-full"/><Skeleton className="h-14 w-full"/><Skeleton className="h-14 w-full"/></div>}
    </main>
   </>
  );
 }
 const {words,states}=detail;
 const deadline=plan?.deadlines.find(item=>item.lessonId===lesson!.id);
 const notStarted=words.filter(word=>!states.has(word.id)).length;
 const offlineReady=!!readiness?.installed&&readiness.missing.length===0&&shell.ready;

 const applyDate=async()=>{await updateLesson(lesson!.id,{targetDate:date||null});setSaved(true)};
 // Отметка закрепляет текущую дату как свою, чтобы урок остался якорем для следующих.
 const toggle=async()=>{await updateLesson(lesson!.id,lesson!.status==='completed'?{status:'upcoming'}:{status:'completed',targetDate:lesson!.targetDate})};
 const practice=async()=>{
  const created=await startSession(now,{wordIds:words.map(word=>word.id),mode:'practice'});
  navigate(created?'/session':`/lessons/${lesson!.id}`);
 };
 const download=async()=>{
  setDownloading(true);setMediaProblem('');
  try{
   const result=await downloadLessonMedia(lesson!.id);
   if(result.failed.length)setMediaProblem(`Не удалось загрузить ${withCount(result.failed.length,['файл','файла','файлов'])}. Урок не считается готовым офлайн — повторите позже.`);
  }catch(error){setMediaProblem(error instanceof Error?error.message:'Не удалось скачать медиа.')}
  finally{setDownloading(false)}
 };
 return (
  <>
   <BackBar title={lesson!.title}/>
   <main className={ui.screen}>
    <Card className="mb-3 bg-soft ring-0">
     <CardHeader>
      <CardDescription className="text-accent-foreground">{lesson!.targetDate?`Занятие ${dayMonth(lesson!.targetDate)}`:'Дата не назначена'}</CardDescription>
      <CardTitle className="text-xl font-semibold">{withCount(words.length,WORDS)}, новых {notStarted}</CardTitle>
      <CardDescription>
       {deadline
        ?deadline.daysLeft===0?'Сегодня день занятия — идёт догоняющая подготовка.':`${withCount(deadline.daysLeft,DAYS)} на подготовку, нужный темп — ${withCount(deadline.requiredPerDay,WORDS)} в день`
        :lesson!.status==='completed'?'Набор проведён, слова остаются в обычной очереди повторений.':'Дата в прошлом или не задана — слова идут в общей очереди.'}
      </CardDescription>
     </CardHeader>
    </Card>
    {readiness?.installed&&(
     <Card className="mb-3" data-testid="lesson-offline">
      <CardHeader>
       <CardTitle className="text-base">{offlineReady?'Готов офлайн':readiness.missing.length?'Слова доступны локально':'Слова и медиа на устройстве'}</CardTitle>
       <CardDescription>
        {readiness.required
         ?`Медиа: ${readiness.present} из ${readiness.required}${readiness.missing.length?' — остальное подгружается при просмотре карточек.':'.'}`
         :'У этого урока нет обязательных медиа.'}
        {!shell.ready&&!shell.checking?' Оболочка приложения ещё не закеширована для работы без сети.':''}
        {readiness.updateAvailable?' Доступна новая версия урока.':''}
       </CardDescription>
      </CardHeader>
      {(readiness.missing.length>0||readiness.updateAvailable||phase.phase==='error')&&(
       <CardContent className="flex flex-col gap-2">
        {readiness.missing.length>0&&<Button size="md" variant="soft" disabled={downloading} onClick={download}><CloudDownload data-icon="inline-start"/>{downloading?'Скачиваем…':'Скачать для офлайн'}</Button>}
        {readiness.updateAvailable&&<Button size="md" variant="quiet" disabled={phase.phase==='loading'} onClick={install}><RefreshCw data-icon="inline-start"/>{phase.phase==='loading'?'Обновляем…':'Обновить урок'}</Button>}
        {phase.phase==='error'&&<p className={ui.error} role="alert">{phase.message}</p>}
       </CardContent>
      )}
      {mediaProblem&&<CardContent><p className={ui.error} role="alert">{mediaProblem}</p></CardContent>}
     </Card>
    )}
    <Field>
     <FieldLabel htmlFor="date">Дата занятия</FieldLabel>
     <Input id="date" type="date" value={date} onChange={event=>{setDate(event.target.value);setSaved(false)}}/>
     {lesson!.dateSource==='schedule'&&<FieldDescription>Дата по расписанию. Своя дата сдвинет следующие уроки.</FieldDescription>}
     {lesson!.dateSource==='manual'&&lesson!.status!=='completed'&&(
      <Button size="sm" variant="quiet" className="w-auto justify-self-start" onClick={()=>{updateLesson(lesson!.id,{targetDate:null});setSaved(false)}}>Вернуть в расписание</Button>
     )}
    </Field>
    <div className="mt-3 grid grid-cols-2 gap-2.5">
     <Button size="md" onClick={applyDate}>Сохранить дату</Button>
     <Button size="md" variant="quiet" className="whitespace-normal leading-tight" onClick={toggle}>{lesson!.status==='completed'?'Вернуть в предстоящие':'Отметить проведённым'}</Button>
    </div>
    {saved&&<p className="mt-2 text-sm text-(--ok)" role="status">Дата сохранена, план пересчитан. История ответов не изменилась.</p>}
    <Button size="xl" variant="soft" className="mt-3" onClick={practice}>Потренировать набор</Button>
    <h2>Слова набора</h2>
    <ItemGroup className="gap-2.5">
     {words.map(word=>(
      <Item key={word.id} variant="outline" className="relative min-h-16 rounded-[var(--radius-card)] bg-card">
       <ItemContent>
        <ItemTitle className="text-base">
         <Link to={`/words/${word.id}`} className="text-foreground no-underline after:absolute after:inset-0">{word.greek}</Link>
        </ItemTitle>
        <ItemDescription>{word.russian}</ItemDescription>
       </ItemContent>
       <ItemActions>
        <Button size="sm" variant="quiet" className="relative z-10" onClick={()=>removeFromLesson(lesson!.id,word.id)}>Убрать</Button>
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
