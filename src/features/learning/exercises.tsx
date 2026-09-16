import {useEffect, useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import {Volume2} from 'lucide-react';
import type {SessionItem, Word} from '../../domain/types';
import {checkAnswer} from '../../domain/import';
import {diffChars} from '../../domain/spelling';
import {tiles} from '../../domain/syllables';
import {playWord, useAudioKind} from '../../shared/audio';
import {ExampleBox, ReadingNotes, SpeakButton, WordArt} from '../words/WordCardView';
import ui from '../../shared/ui.module.css';
import wordCss from '../../shared/word.module.css';
import s from './session.module.css';
import {cx} from '../../shared/cx';

export interface Answer {correct:boolean|null;rating:1|2|3|4;text:string;status?:'correct'|'almost'|'wrong'}
/** onAnswer возвращает false, если запись не удалась: тогда упражнение остаётся открытым для повтора. */
interface Props {item:SessionItem;onAnswer:(answer:Answer)=>Promise<boolean>;onNext:()=>void}

/** Раскрытый ответ подводим к верху области прокрутки: иначе он остаётся под закреплённой кнопкой. */
function useRevealed(active:boolean){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(active)requestAnimationFrame(()=>ref.current?.scrollIntoView({block:'start',behavior:'smooth'}));
 },[active]);
 return ref;
}

const GRADES:{rating:1|2|3|4;title:string;hint:string}[]=[
 {rating:1,title:'Не вспомнил',hint:'покажем снова сегодня'},
 {rating:2,title:'С трудом',hint:'короткий интервал'},
 {rating:3,title:'Вспомнил',hint:'обычный интервал'},
 {rating:4,title:'Легко',hint:'длинный интервал'},
];

export function Introduction({word,onReady}:{word:Word;onReady:()=>void}){
 return (
  <>
   <div className={s.center}>
    <p className={s.prompt} data-testid="prompt">Новое слово</p>
    <WordArt word={word}/>
    <div className={cx(ui.row, ui.between)} style={{width:'100%',gap:12}}>
     <div className={ui.grow} style={{minWidth:0,textAlign:'left'}}>
      <p className={wordCss.greek} style={{margin:0}}>{word.greek}</p>
      {word.ipa&&<p className={wordCss.ipa} style={{margin:0}}>{word.ipa}</p>}
      <p style={{fontSize:19,margin:'6px 0 0'}}>{word.russian}</p>
     </div>
     <SpeakButton word={word}/>
    </div>
    <div style={{width:'100%',textAlign:'left'}}>
     <ReadingNotes word={word}/>
     {word.examples[0]&&<ExampleBox example={word.examples[0]}/>}
    </div>
   </div>
   <div className={s.dock}><Button size="xl" onClick={onReady}>Запомнил — проверим</Button></div>
  </>
 );
}

export function Recall({item,onAnswer,onNext}:Props){
 const [open,setOpen]=useState(false);
 const [done,setDone]=useState(false);
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setOpen(false);setDone(false);setSaving(false)},[item.id]);
 const revealed=useRevealed(open);
 const word=item.word;
 return (
  <>
   <div className={s.center}>
    <p className={s.prompt} data-testid="prompt">Вспомни слово</p>
    <p className={wordCss.greek} style={{margin:'6px 0'}}>{word.russian}</p>
    <p className={s.prompt} data-testid="prompt">Как это будет по-гречески?</p>
    <WordArt word={word}/>
    {open&&(
     <div style={{width:'100%'}} ref={revealed}>
      <div className={cx(ui.row, ui.between)} style={{gap:12}}>
       <div className={ui.grow} style={{minWidth:0,textAlign:'left'}}>
        <p className={wordCss.greek} style={{margin:0}}>{word.greek}</p>
        {word.ipa&&<p className={wordCss.ipa} style={{margin:0}}>{word.ipa}</p>}
       </div>
       <SpeakButton word={word}/>
      </div>
      {word.examples[0]&&<div style={{textAlign:'left',marginTop:12}}><ExampleBox example={word.examples[0]}/></div>}
     </div>
    )}
   </div>
   <div className={s.dock}>
    {!open?(
     <>
      <Button size="xl" onClick={()=>setOpen(true)}>Показать ответ</Button>
      <p className={ui.hint}>Сначала попробуй вспомнить самостоятельно</p>
     </>
    ):!done?(
     <>
      <p className={s.prompt} data-testid="prompt">Насколько легко вспомнилось?</p>
      <div className={s.grades}>
       {GRADES.map(grade=>(
        <Button key={grade.rating} variant="outline" data-testid="grade" disabled={saving}
         className="h-14 flex-col gap-0.5 rounded-[14px] font-semibold"
         onClick={async()=>{setSaving(true);const saved=await onAnswer({correct:null,rating:grade.rating,text:''});setSaving(false);setDone(saved)}}>
         <span>{grade.title}</span>
         <span className="text-xs font-normal text-muted-foreground">{grade.hint}</span>
        </Button>
       ))}
      </div>
     </>
    ):<Button size="xl" onClick={onNext}>Далее</Button>}
   </div>
  </>
 );
}

function Choice({item,onAnswer,onNext,prompt,head,options,correct,art}:Props&{prompt:string;head:React.ReactNode;options:string[];correct:string;art:boolean}){
 const [picked,setPicked]=useState<string|null>(null);
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setPicked(null);setSaving(false)},[item.id]);
 const revealed=useRevealed(!!picked);
 return (
  <>
   <div className={s.center}>
    <p className={s.prompt} data-testid="prompt">{prompt}</p>
    {head}
    {art&&<WordArt word={item.word}/>}
    <div className={s.options} style={{width:'100%'}}>
     {options.map(option=>(
      <Button key={option} data-testid="option" variant="outline" disabled={!!picked||saving}
       className={cx('h-14 justify-start rounded-[14px] text-[17px]', picked&&(option===correct?s.correct:option===picked?s.wrong:''))}
       onClick={async()=>{
        setSaving(true);
        const saved=await onAnswer({correct:option===correct,rating:option===correct?3:1,text:option});
        setSaving(false);
        if(saved)setPicked(option);
       }}>{option}</Button>
     ))}
    </div>
    {picked&&(
     <div style={{width:'100%'}} ref={revealed}>
      <div data-testid="feedback" className={cx(s.feedback, picked===correct?s.ok:s.bad)} style={{marginTop:0}}>
       {picked===correct?'Правильно!':`Правильный ответ: ${correct}`}
      </div>
      {item.word.examples[0]&&<div style={{textAlign:'left'}}><ExampleBox example={item.word.examples[0]}/></div>}
     </div>
    )}
   </div>
   {picked&&<div className={s.dock}><Button size="xl" onClick={onNext}>Далее</Button></div>}
  </>
 );
}

export function Recognition(props:Props){
 const word=props.item.word;
 return <Choice {...props} prompt="Что значит это слово?" art={false} correct={word.russian} options={props.item.options}
  head={<><p className={wordCss.greek} style={{margin:'6px 0'}}>{word.greek}</p>{word.ipa&&<p className={wordCss.ipa} style={{margin:0}}>{word.ipa}</p>}</>}/>;
}

export function Listening(props:Props){
 const word=props.item.word;
 const kind=useAudioKind(word);
 const played=useRef(false);
 useEffect(()=>{if(!played.current){played.current=true;playWord(word)}},[word.id]);
 return <Choice {...props} prompt="Что прозвучало?" art={false} correct={word.greek} options={props.item.options}
  head={<Button size="icon-xl" className="size-[76px] rounded-full [&_svg:not([class*='size-'])]:size-8" disabled={kind==='none'} aria-label="Повторить аудио" onClick={()=>playWord(word)}><Volume2 aria-hidden/></Button>}/>;
}

/** Ступень перед свободным написанием: слово собирается из перемешанных слогов. */
export function Assembly({item,onAnswer,onNext}:Props){
 const [placed,setPlaced]=useState<number[]>([]);
 const [result,setResult]=useState<'correct'|'wrong'|null>(null);
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setPlaced([]);setResult(null);setSaving(false)},[item.id]);
 const revealed=useRevealed(!!result);
 const word=item.word;
 const correct=tiles(word.greek);
 const pool=item.options;
 const answer=placed.map(index=>pool[index]).join('');
 const complete=placed.length===pool.length;

 const check=async()=>{
  if(!complete||result||saving)return;
  const right=answer===correct.join('');
  setSaving(true);
  const saved=await onAnswer({correct:right,rating:right?3:1,text:answer});
  setSaving(false);
  if(saved)setResult(right?'correct':'wrong');
 };
 return (
  <>
   <div className={s.center}>
    <p className={s.prompt} data-testid="prompt">Собери слово</p>
    <p className={wordCss.greek} style={{margin:'6px 0'}}>{word.russian}</p>
    <WordArt word={word}/>
    {result&&(
     <div style={{width:'100%'}} ref={revealed}>
      <div data-testid="feedback" className={cx(s.feedback, result==='correct'?s.ok:s.bad)} style={{marginTop:0}}>
       <div>{result==='correct'?'Правильно!':'Пока не сходится — посмотри порядок слогов.'}</div>
       <p className="m-0 mt-1.5 text-[19px]">{correct.join(' · ')}</p>
      </div>
      {word.examples[0]&&<div style={{textAlign:'left'}}><ExampleBox example={word.examples[0]}/></div>}
     </div>
    )}
   </div>
   <div className={s.dock}>
    {!result&&<>
    <div className={s.slots} aria-label="Собранное слово" data-testid="assembled">
     {placed.length===0
      ?<span className={s.slotsHint}>Нажимай слоги по порядку</span>
      :placed.map((index,position)=>(
        <Button key={`${index}-${position}`} variant="secondary" data-testid="placed" disabled={!!result||saving}
         className="h-12 rounded-[12px] px-4 text-[19px]"
         onClick={()=>setPlaced(placed.filter((_,i)=>i!==position))}>{pool[index]}</Button>
       ))}
    </div>
    <div className={s.tiles}>
     {pool.map((tile,index)=>(
      <Button key={`${tile}-${index}`} variant="outline" data-testid="tile"
       disabled={placed.includes(index)||!!result||saving}
       className="h-12 rounded-[12px] px-4 text-[19px]"
       onClick={()=>setPlaced([...placed,index])}>{tile}</Button>
     ))}
    </div>
    </>}
    {result
     ?<Button size="xl" onClick={onNext}>Далее</Button>
     :<Button size="xl" disabled={!complete||saving} onClick={check}>{saving?'Сохраняем…':'Проверить'}</Button>}
   </div>
  </>
 );
}

export function Spelling({item,onAnswer,onNext}:Props){
 const [value,setValue]=useState('');
 const [result,setResult]=useState<{status:'correct'|'almost'|'wrong';message:string}|null>(null);
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setValue('');setResult(null);setSaving(false)},[item.id]);
 const revealed=useRevealed(!!result);
 const word=item.word;
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();
  if(!value.trim()||result||saving)return;
  const checked=checkAnswer(value,word.greek);
  setSaving(true);
  const saved=await onAnswer({correct:checked.status==='correct',rating:checked.status==='correct'?3:1,text:value,status:checked.status});
  setSaving(false);
  if(saved)setResult(checked);
 };
 return (
  <>
   <div className={s.center}>
    <p className={s.prompt} data-testid="prompt">Напиши по-гречески</p>
    <p className={wordCss.greek} style={{margin:'6px 0'}}>{word.russian}</p>
    <WordArt word={word}/>
    {result&&(
     <div style={{width:'100%'}} ref={revealed}>
      <div data-testid="feedback" className={cx(s.feedback, result.status==='correct'?s.ok:result.status==='almost'?s.almost:s.bad)} style={{marginTop:0}}>
       <div>{result.message}</div>
       {result.status!=='correct'&&(
        <>
         <p className={s.chars} data-testid="chars" style={{margin:'6px 0 0'}}>
          {diffChars(value,word.greek).map((part,index)=>part.type==='same'?<b key={index}>{part.text}</b>:part.type==='wrong'?<s key={index}>{part.text}</s>:<u key={index}>{part.text}</u>)}
         </p>
         <p className={ui.small} style={{margin:'4px 0 0',opacity:.85}}>Зелёное — совпало, красное — лишнее, подчёркнутое — пропущено.</p>
         <p className={ui.small} style={{margin:'6px 0 0'}}>Правильно: {word.greek}</p>
        </>
       )}
      </div>
      {word.examples[0]&&<div style={{textAlign:'left'}}><ExampleBox example={word.examples[0]}/></div>}
     </div>
    )}
   </div>
   <div className={s.dock}>
    {!result?(
     <form onSubmit={submit}>
      <input className={s.answer} type="text" value={value} onChange={event=>setValue(event.target.value)} disabled={saving}
       autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label="Твой ответ по-гречески" lang="el"/>
      <Button size="xl" type="submit" disabled={!value.trim()||saving}>{saving?'Сохраняем…':'Проверить'}</Button>
     </form>
    ):<Button size="xl" onClick={onNext}>Далее</Button>}
   </div>
  </>
 );
}
