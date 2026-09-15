import {useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {BackBar} from '../../app/TopBar';
import {parseImport, wordKey} from '../../domain/import';
import {withCount, WORDS} from '../../shared/format';
import {liveWords, useSnapshot} from '../../shared/store';
import {commitImport} from '../../storage/ops';

export function ImportScreen(){
 const {data}=useSnapshot();
 const navigate=useNavigate();
 const [text,setText]=useState('');
 const [target,setTarget]=useState('new');
 const [title,setTitle]=useState('Урок 1.3');
 const [date,setDate]=useState('');
 const [problem,setProblem]=useState('');
 const [busy,setBusy]=useState(false);
 const parsed=useMemo(()=>parseImport(text),[text]);
 const known=useMemo(()=>new Map(liveWords(data).map(word=>[wordKey(word.greek,word.russian),word])),[data.words]);
 const duplicates=parsed.rows.filter(row=>known.has(wordKey(row.greek,row.russian))).length;
 const conflicts=parsed.rows.filter(row=>!known.has(wordKey(row.greek,row.russian))&&
  liveWords(data).some(word=>word.greek.normalize('NFC')===row.greek.normalize('NFC'))).length;

 const save=async()=>{
  setBusy(true);setProblem('');
  try{
   const outcome=await commitImport({
    rows:parsed.rows,
    lessonId:target==='new'?null:target,
    lessonTitle:title.trim()||'Новый набор',
    targetDate:target==='new'?(date||null):null,
   });
   navigate(`/lessons/${outcome.lessonId}`);
  }catch(error){
   setProblem(error instanceof Error?`Ничего не сохранено: ${error.message}`:'Ничего не сохранено: хранилище недоступно.');
  }finally{setBusy(false)}
 };
 return (
  <>
   <BackBar title="Импорт слов"/>
   <main className="screen">
    <p className="muted small">Вставьте список из Quizlet: строки «слово / перевод» подряд или колонки через табуляцию. До нажатия «Сохранить» данные не меняются.</p>
    <label htmlFor="text">Текст списка</label>
    <textarea id="text" value={text} onChange={event=>setText(event.target.value)} placeholder={'το σπίτι\nдом\nτο νερό\nвода'}/>
    {text.trim()&&(
     <section className="card">
      <h3>Предпросмотр</h3>
      <p className="small muted" style={{margin:'0 0 8px'}}>
       Режим: {parsed.mode==='tsv'?'колонки через табуляцию':'чередование строк'} · распознано {withCount(parsed.rows.length,WORDS)} ·
       служебных строк пропущено {parsed.ignored} · ошибок {parsed.errors.length}
      </p>
      {duplicates>0&&<p className="small muted" style={{margin:'0 0 8px'}}>{duplicates} уже есть в словаре — они будут добавлены в набор без дубликата.</p>}
      {conflicts>0&&<p className="small" style={{margin:'0 0 8px',color:'#854d0e'}}>{conflicts} слов совпадают по написанию, но с другим переводом — будут созданы отдельные записи.</p>}
      {parsed.errors.map(error=><p className="error" key={error.line} style={{margin:'2px 0'}}>Строка {error.line}: {error.message}</p>)}
      <div className="stack">
       {parsed.rows.slice(0,8).map((row,index)=>(
        <div key={index} className="row between small"><span>{row.greek}</span><span className="muted">{row.russian}{row.sourceMastered?' · Mastered':''}</span></div>
       ))}
       {parsed.rows.length>8&&<p className="small muted" style={{margin:0}}>…и ещё {parsed.rows.length-8}</p>}
      </div>
     </section>
    )}
    <label htmlFor="target">Куда добавить</label>
    <select id="target" value={target} onChange={event=>setTarget(event.target.value)}>
     <option value="new">Новый набор</option>
     {data.lessons.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
    </select>
    {target==='new'&&(
     <>
      <label htmlFor="title">Название набора</label>
      <input id="title" type="text" value={title} onChange={event=>setTitle(event.target.value)}/>
      <label htmlFor="date">Дата занятия</label>
      <input id="date" type="date" value={date} onChange={event=>setDate(event.target.value)}/>
     </>
    )}
    {problem&&<p className="error" role="alert">{problem}</p>}
    <button className="btn" style={{marginTop:16}} disabled={busy||!parsed.rows.length} onClick={save}>
     Сохранить {parsed.rows.length?withCount(parsed.rows.length,WORDS):''}
    </button>
   </main>
  </>
 );
}
