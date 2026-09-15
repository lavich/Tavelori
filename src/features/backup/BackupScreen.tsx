import {useState} from 'react';
import {BackBar} from '../../app/TopBar';
import {megabytes} from '../../shared/offline';
import {useSnapshot} from '../../shared/store';
import {backupName, download, exportFull, exportWordsTsv, inspectBackup, restoreBackup, type BackupReport} from './backup';

export function BackupScreen(){
 const {data}=useSnapshot();
 const [file,setFile]=useState<File|null>(null);
 const [report,setReport]=useState<BackupReport|null>(null);
 const [problem,setProblem]=useState('');
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);

 const pick=async(picked:File|undefined)=>{
  setReport(null);setProblem('');setStatus('');setFile(picked??null);
  if(!picked)return;
  const checked=await inspectBackup(picked);
  if(checked.ok)setReport(checked.report); else setProblem(checked.message);
 };
 const restore=async()=>{
  if(!file||!report)return;
  if(!confirm('Заменить все данные на этом устройстве содержимым копии? Текущие слова, прогресс и настройки будут перезаписаны.'))return;
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
   <main className="screen">
    <section className="card">
     <h3>Полная копия</h3>
     <p className="small muted">Слова, наборы, картинки и аудио, прогресс FSRS, ответы, сессии и настройки. Этот файл переносит всё.</p>
     <button className="btn" onClick={async()=>{setBusy(true);download(await exportFull(),backupName());setBusy(false)}} disabled={busy}>Скачать полную копию</button>
    </section>
    <section className="card">
     <h3>Только слова (TSV)</h3>
     <p className="small muted">Греческий, перевод и IPA для переноса в другие приложения. Прогресс обучения в этот файл не входит.</p>
     <button className="btn ghost" onClick={()=>download(exportWordsTsv(data),'lexi-words.tsv')}>Скачать TSV</button>
    </section>
    <section className="card">
     <h3>Восстановление</h3>
     <label htmlFor="backup">Файл полной копии</label>
     <input id="backup" type="file" accept="application/json,.json" onChange={event=>pick(event.target.files?.[0])}/>
     {report&&(
      <div className="small" style={{marginTop:10}}>
       <p style={{margin:'0 0 4px'}}>Файл проверен: база «{report.databaseName}», {megabytes(report.bytes)}{report.createdAt?`, копия от ${new Date(report.createdAt).toLocaleString('ru-RU')}`:''}.</p>
       <p className="muted" style={{margin:0}}>{report.tables.map(table=>`${table.name}: ${table.rows}`).join(' · ')}</p>
      </div>
     )}
     {problem&&<p className="error" role="alert">{problem}</p>}
     {status&&<p className="small" role="status" style={{color:'var(--ok)'}}>{status}</p>}
     <button className="btn danger" style={{marginTop:12}} disabled={!report||busy} onClick={restore}>Заменить данные копией</button>
     <p className="small muted">Перед заменой Lexi сохранит текущие данные отдельным файлом.</p>
    </section>
   </main>
  </>
 );
}
