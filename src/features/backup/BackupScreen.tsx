import {useEffect, useState} from 'react';
import {Button} from '@/components/ui/button';
import {AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger} from '@/components/ui/alert-dialog';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Field, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {BackBar} from '../../app/TopBar';
import {SYNC_BOUNDARIES} from '../../app/TelegramNotices';
import {megabytes} from '../../shared/offline';
import {currentProfile} from '../../storage/profile';
import {sync} from '../../sync';
import type {SyncVersionRow} from '../../sync/types';
import {backupName, exportFull, exportWordsTsv, inspectBackup, restoreBackup, transferFile, TRANSFER_TEXT, type BackupReport, type TransferOutcome} from './backup';
import ui from '../../shared/ui.module.css';
import {cx} from '../../shared/cx';

const handedOver=(outcome:TransferOutcome)=>outcome==='shared'||outcome==='downloaded';

export function BackupScreen(){
 const profile=currentProfile();
 const [file,setFile]=useState<File|null>(null);
 const [report,setReport]=useState<BackupReport|null>(null);
 const [problem,setProblem]=useState('');
 const [status,setStatus]=useState('');
 const [transfer,setTransfer]=useState('');
 const [busy,setBusy]=useState(false);
 const [confirming,setConfirming]=useState(false);
 const [stored,setStored]=useState<SyncVersionRow[]>([]);
 const refreshStored=()=>sync.listStored().then(setStored).catch(()=>setStored([]));
 useEffect(()=>{refreshStored()},[]);

 const pick=async(picked:File|undefined)=>{
  setReport(null);setProblem('');setStatus('');setFile(picked??null);
  if(!picked)return;
  const checked=await inspectBackup(picked);
  if(checked.ok)setReport(checked.report); else setProblem(checked.message);
 };
 const send=async(blob:Blob,name:string)=>{
  const outcome=await transferFile(blob,name);
  setTransfer(TRANSFER_TEXT[outcome]);
  return outcome;
 };
 const restore=async()=>{
  if(!file||!report)return;
  setBusy(true);setProblem('');setStatus('');
  try{
   // Защитная копия обязана уйти до замены: отмена или ошибка передачи останавливают восстановление.
   const guard=await send(await exportFull(),`lexi-before-restore-${Date.now()}.json`);
   if(!handedOver(guard)){setProblem(`Замена отменена: защитная копия не передана (${TRANSFER_TEXT[guard].toLowerCase()})`);return}
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
     <p className={cx(ui.small, ui.muted)}>Слова, наборы и их связи, скачанные картинки и аудио, версии установленных уроков и ваши правки, прогресс FSRS, ответы, сессии и настройки. Этот файл переносит всё{profile.kind==='telegram'?', в том числе между Telegram и обычным браузером':''}.</p>
     {profile.kind==='telegram'&&<p className={cx(ui.small, ui.muted)} data-testid="sync-boundaries">{SYNC_BOUNDARIES}</p>}
     <Button size="xl" onClick={async()=>{setBusy(true);try{await send(await exportFull(),backupName())}finally{setBusy(false)}}} disabled={busy}>Сохранить полную копию</Button>
     {transfer&&<p className={ui.small} role="status" data-testid="transfer-status">{transfer}</p>}
    </CardContent></Card>
    <Card className="mb-3"><CardHeader><CardTitle>Только слова (TSV)</CardTitle></CardHeader><CardContent>
     <p className={cx(ui.small, ui.muted)}>Греческий, перевод и IPA для переноса в другие приложения. Прогресс обучения в этот файл не входит.</p>
     <Button variant="soft" size="xl" onClick={async()=>send(await exportWordsTsv(),'lexi-words.tsv')}>Сохранить TSV</Button>
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
         Перед заменой Lexi передаст текущие данные отдельным файлом; если передача отменится, замена не начнётся.
         {profile.kind==='telegram'?' Облачный прогресс Telegram не откатится молча: после восстановления Lexi предложит выбрать, с какой версии продолжить.':''}
        </AlertDialogDescription>
       </AlertDialogHeader>
       <AlertDialogFooter>
        <AlertDialogCancel>Отмена</AlertDialogCancel>
        <AlertDialogAction onClick={()=>{setConfirming(false);restore()}}>Заменить</AlertDialogAction>
       </AlertDialogFooter>
      </AlertDialogContent>
     </AlertDialog>
     <p className={cx(ui.small, ui.muted)}>Перед заменой Lexi передаст текущие данные отдельным файлом.</p>
    </CardContent></Card>
    {stored.length>0&&(
     <Card className="mb-3" data-testid="stored-versions"><CardHeader><CardTitle>Отложенные версии облака</CardTitle></CardHeader><CardContent>
      <p className={cx(ui.small, ui.muted)}>Версии, отвергнутые при выборе в конфликте. Хранятся на устройстве до удаления вручную; сначала можно сохранить файл.</p>
      <div className={ui.stack}>
       {stored.map(row=>(
        <div key={row.id} className="rounded-[14px] border border-border p-3">
         <p className="m-0 text-sm">{row.note??row.role} · {new Date(row.createdAt).toLocaleString('ru-RU')} · {row.snapshot.states.length} слов, {row.snapshot.stats.answers} ответов</p>
         <div className="mt-2 flex gap-2">
          <Button size="sm" variant="soft" onClick={async()=>{const blob=await sync.exportStored(row.id);if(blob)await send(blob,`lexi-version-${row.id}.json`)}}>Сохранить файл</Button>
          <Button size="sm" variant="quiet" onClick={async()=>{await sync.discardStored(row.id);await refreshStored()}}>Удалить</Button>
         </div>
        </div>
       ))}
      </div>
     </CardContent></Card>
    )}
   </main>
  </>
 );
}
