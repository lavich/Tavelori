import {useMemo, useState} from 'react';
import {Button} from '@/components/ui/button';
import {useNavigate} from 'react-router-dom';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Field, FieldDescription, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Textarea} from '@/components/ui/textarea';
import {BackBar} from '../../app/TopBar';
import {parseImport, wordKey} from '../../domain/import';
import {withCount, WORDS} from '../../shared/format';
import {liveWords, useSnapshot} from '../../shared/store';
import {commitImport} from '../../storage/ops';
import ui from '../../shared/ui.module.css';
import {cx} from '../../shared/cx';

export function ImportScreen(){
 const {data}=useSnapshot();
 const navigate=useNavigate();
 const [text,setText]=useState('');
 const [target,setTarget]=useState('new');
 const [title,setTitle]=useState('Урок 1.3');
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
   });
   navigate(`/lessons/${outcome.lessonId}`);
  }catch(error){
   setProblem(error instanceof Error?`Ничего не сохранено: ${error.message}`:'Ничего не сохранено: хранилище недоступно.');
  }finally{setBusy(false)}
 };
 return (
  <>
   <BackBar title="Импорт слов"/>
   <main className={ui.screen}>
    <p className={cx(ui.muted, ui.small)}>Вставьте список из Quizlet: строки «слово / перевод» подряд или колонки через табуляцию. До нажатия «Сохранить» данные не меняются.</p>
    <Field>
     <FieldLabel htmlFor="text">Текст списка</FieldLabel>
     <Textarea id="text" className="min-h-40" value={text} onChange={event=>setText(event.target.value)}
      placeholder={'το σπίτι\nдом\nτο νερό\nвода'}/>
    </Field>
    {text.trim()&&(
     <Card className="mt-3 mb-3"><CardHeader><CardTitle>Предпросмотр</CardTitle></CardHeader><CardContent>
      <p className={cx(ui.small, ui.muted)} style={{margin:'0 0 8px'}}>
       Режим: {parsed.mode==='tsv'?'колонки через табуляцию':'чередование строк'} · распознано {withCount(parsed.rows.length,WORDS)} ·
       служебных строк пропущено {parsed.ignored} · ошибок {parsed.errors.length}
      </p>
      {duplicates>0&&<p className={cx(ui.small, ui.muted)} style={{margin:'0 0 8px'}}>{duplicates} уже есть в словаре — они будут добавлены в набор без дубликата.</p>}
      {conflicts>0&&<p className={ui.small} style={{margin:'0 0 8px',color:'#854d0e'}}>{conflicts} слов совпадают по написанию, но с другим переводом — будут созданы отдельные записи.</p>}
      {parsed.errors.map(error=><p className={ui.error} key={error.line} style={{margin:'2px 0'}}>Строка {error.line}: {error.message}</p>)}
      <div className={ui.stack}>
       {parsed.rows.slice(0,8).map((row,index)=>(
        <div key={index} className={cx(ui.row, ui.between, ui.small)}><span>{row.greek}</span><span className={ui.muted}>{row.russian}{row.sourceMastered?' · Mastered':''}</span></div>
       ))}
       {parsed.rows.length>8&&<p className={cx(ui.small, ui.muted)} style={{margin:0}}>…и ещё {parsed.rows.length-8}</p>}
      </div>
     </CardContent></Card>
    )}
    <Field>
     <FieldLabel htmlFor="target">Куда добавить</FieldLabel>
     <Select value={target} onValueChange={value=>setTarget(value??'new')}>
      <SelectTrigger id="target" className="w-full">
       <SelectValue>{value=>value==='new'?'Новый набор':data.lessons.find(lesson=>lesson.id===value)?.title??'Новый набор'}</SelectValue>
      </SelectTrigger>
      <SelectContent>
       <SelectGroup>
        <SelectItem value="new">Новый набор</SelectItem>
        {data.lessons.map(lesson=><SelectItem key={lesson.id} value={lesson.id}>{lesson.title}</SelectItem>)}
       </SelectGroup>
      </SelectContent>
     </Select>
    </Field>
    {target==='new'&&(
     <Field>
      <FieldLabel htmlFor="title">Название набора</FieldLabel>
      <Input id="title" value={title} onChange={event=>setTitle(event.target.value)}/>
      <FieldDescription>Дата занятия назначится по расписанию; свою дату можно задать на экране урока.</FieldDescription>
     </Field>
    )}
    {problem&&<p className={ui.error} role="alert">{problem}</p>}
    <Button size="xl" style={{marginTop:16}} disabled={busy||!parsed.rows.length} onClick={save}>
     Сохранить {parsed.rows.length?withCount(parsed.rows.length,WORDS):''}
    </Button>
   </main>
  </>
 );
}
