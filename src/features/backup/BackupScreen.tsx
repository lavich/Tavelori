import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger} from '@/components/ui/alert-dialog';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Field, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {BackBar} from '../../app/TopBar';
import {megabytes} from '../../shared/offline';
import {backupName, download, exportFull, exportWordsTsv, inspectBackup, restoreBackup, type BackupReport} from './backup';
import ui from '../../shared/ui.module.css';
import {cx} from '../../shared/cx';

export function BackupScreen(){
 const [file,setFile]=useState<File|null>(null);
 const [report,setReport]=useState<BackupReport|null>(null);
 const [problem,setProblem]=useState('');
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 const [confirming,setConfirming]=useState(false);

 const pick=async(picked:File|undefined)=>{
  setReport(null);setProblem('');setStatus('');setFile(picked??null);
  if(!picked)return;
  const checked=await inspectBackup(picked);
  if(checked.ok)setReport(checked.report); else setProblem(checked.message);
 };
 const restore=async()=>{
  if(!file||!report)return;
  setBusy(true);setProblem('');
  try{
   download(await exportFull(),`lexi-before-restore-${Date.now()}.json`);
   await restoreBackup(file);
   setStatus('Данные восстановлены полностью.');
  }catch(error){
   setProblem(error instanceof Error?`${error.message} Текущие данные остались без изменений.`:'Восстановление не удалось, данные не изменены.');
  }finally{setBusy(false)}
 };
 return (
  <>
   <BackBar title="Копия данных"/>
   <main className={ui.screen}>
    <Card className="mb-3"><CardHeader><CardTitle>Полная копия</CardTitle></CardHeader><CardContent>
     <p className={cx(ui.small, ui.muted)}>Слова, наборы и их связи, скачанные картинки и аудио, версии установленных уроков и ваши правки, прогресс FSRS, ответы, сессии и настройки. Этот файл переносит всё.</p>
     <Button size="xl" onClick={async()=>{setBusy(true);download(await exportFull(),backupName());setBusy(false)}} disabled={busy}>Скачать полную копию</Button>
    </CardContent></Card>
    <Card className="mb-3"><CardHeader><CardTitle>Только слова (TSV)</CardTitle></CardHeader><CardContent>
     <p className={cx(ui.small, ui.muted)}>Греческий, перевод и IPA для переноса в другие приложения. Прогресс обучения в этот файл не входит.</p>
     <Button variant="soft" size="xl" onClick={async()=>download(await exportWordsTsv(),'lexi-words.tsv')}>Скачать TSV</Button>
    </CardContent></Card>
    <Card className="mb-3"><CardHeader><CardTitle>Восстановление</CardTitle></CardHeader><CardContent>
     <Field>
      <FieldLabel htmlFor="backup">Файл полной копии</FieldLabel>
      <Input id="backup" type="file" accept="application/json,.json" onChange={event=>pick(event.target.files?.[0])}/>
     </Field>
     {report&&(
      <div className={ui.small} style={{marginTop:10}}>
       <p style={{margin:'0 0 4px'}}>Файл проверен: база «{report.databaseName}», {megabytes(report.bytes)}{report.createdAt?`, копия от ${new Date(report.createdAt).toLocaleString('ru-RU')}`:''}.{report.legacy?' Копия старого формата: наборы будут преобразованы в связи без скачивания пакетов.':''}</p>
       <p className={ui.muted} style={{margin:0}}>{report.tables.map(table=>`${table.name}: ${table.rows}`).join(' · ')}</p>
      </div>
     )}
     {problem&&<p className={ui.error} role="alert">{problem}</p>}
     {status&&<p className={ui.small} role="status" style={{color:'var(--ok)'}}>{status}</p>}
     <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogTrigger render={<Button variant="destructive" size="xl" className="mt-3" disabled={!report||busy}>Заменить данные копией</Button>}/>
      <AlertDialogContent>
       <AlertDialogHeader>
        <AlertDialogTitle>Заменить все данные на этом устройстве?</AlertDialogTitle>
        <AlertDialogDescription>
         Текущие слова, прогресс, ответы и настройки будут перезаписаны содержимым копии.
         Перед заменой Lexi сохранит текущие данные отдельным файлом.
        </AlertDialogDescription>
       </AlertDialogHeader>
       <AlertDialogFooter>
        <AlertDialogCancel>Отмена</AlertDialogCancel>
        <AlertDialogAction onClick={()=>{setConfirming(false);restore()}}>Заменить</AlertDialogAction>
       </AlertDialogFooter>
      </AlertDialogContent>
     </AlertDialog>
     <p className={cx(ui.small, ui.muted)}>Перед заменой Lexi сохранит текущие данные отдельным файлом.</p>
    </CardContent></Card>
   </main>
  </>
 );
}
