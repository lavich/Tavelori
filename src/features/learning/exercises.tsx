import {useEffect, useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import {Check, Volume2, X} from 'lucide-react';
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
import {shortTitle} from '../../shared/format';

export interface Answer {correct:boolean;text:string;status?:'correct'|'almost'|'wrong'}
/** onAnswer возвращает false, если запись не удалась: тогда упражнение остаётся открытым для повтора. `onSkip` — пропуск без оценки. */
interface Props {item:SessionItem;onAnswer:(answer:Answer)=>Promise<boolean>;onNext:()=>void;onSkip?:()=>void}

/** Раскрытый ответ подводим к верху области прокрутки: иначе он остаётся под закреплённой кнопкой. */
function useRevealed(active:boolean){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(active)requestAnimationFrame(()=>ref.current?.scrollIntoView({block:'start',behavior:'smooth'}));
 },[active]);
 return ref;
}

/** Подпись урока у нового слова: к какому занятию готовимся или чей хвост добираем. У слова вне уроков её нет. */
export const lessonLabel=(item:Pick<SessionItem,'lessonTitle'|'lessonPast'>)=>item.lessonTitle?`${item.lessonPast?'Хвост урока':'К уроку'} ${shortTitle(item.lessonTitle)}`:null;

export function Introduction({item,onReady,saving=false}:{item:Pick<SessionItem,'word'|'lessonTitle'|'lessonPast'>;onReady:()=>void;saving?:boolean}){
 const {word}=item;
 const label=lessonLabel(item);
 return (
  <>
   <div className={s.center}>
    <p className={cx(s.prompt,'sr-only')} data-testid="prompt">Новое слово</p>
    {label&&<p className={s.prompt} style={{margin:0}} data-testid="lesson-label">{label}</p>}
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
   <div className={s.dock}><Button size="xl" disabled={saving} onClick={onReady}>{saving?'Сохраняем…':'Далее'}</Button></div>
  </>
 );
}

function Choice({item,onAnswer,onNext,prompt,head,options,correct,art}:Props&{prompt:string;head:React.ReactNode;options:string[];correct:string;art:boolean}){
 const [picked,setPicked]=useState<string|null>(null);
 const answered=picked!==null;
 const choose=async(option:string|null)=>{
  if(answered||saving)return;
  setSaving(true);
  const saved=await onAnswer({correct:option===correct,text:option??''});
  setSaving(false);
  if(saved)setPicked(option??'');
 };
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setPicked(null);setSaving(false)},[item.id]);
 const revealed=useRevealed(answered);
 return (
  <>
   <div className={s.center}>
    <p className={s.prompt} data-testid="prompt">{prompt}</p>
    {head}
    {art&&<WordArt word={item.word}/>}
    <div className={s.options} style={{width:'100%'}} ref={revealed}>
     {options.map(option=>(
      <Button key={option} data-testid="option" variant="outline" disabled={answered||saving}
       data-answer={answered?(option===correct?'correct':option===picked?'wrong':undefined):undefined}
       className={cx('h-14 justify-between rounded-[14px] text-[17px]', answered&&(option===correct?s.correct:option===picked?s.wrong:''))}
       onClick={()=>choose(option)}>
       <span>{option}</span>
       {answered&&option===correct&&<><Check aria-hidden className="size-5 shrink-0"/><span className="sr-only">Правильный ответ</span></>}
       {answered&&option===picked&&option!==correct&&<><X aria-hidden className="size-5 shrink-0"/><span className="sr-only">Неправильный ответ</span></>}
      </Button>
     ))}
    </div>
    {answered&&<span className="sr-only" role="status">{picked===correct?'Правильно':`Правильный ответ: ${correct}`}</span>}
    {answered&&item.word.examples[0]&&(
     <div style={{width:'100%',textAlign:'left'}}><ExampleBox example={item.word.examples[0]}/></div>
    )}
   </div>
   <div className={s.dock}>{answered?<Button size="xl" onClick={onNext}>Далее</Button>:<Button variant="outline" size="xl" disabled={saving} onClick={()=>choose(null)}>Не знаю</Button>}</div>
  </>
 );
}

export function Recognition(props:Props){
 const word=props.item.word;
 return <Choice {...props} prompt="Что значит это слово?" art={false} correct={word.russian} options={props.item.options}
  head={<div className="flex w-full flex-wrap items-center justify-center gap-3">
   <div>
    <p className={wordCss.greek} style={{margin:'6px 0'}}>{word.greek}</p>
    {word.ipa&&<p className={wordCss.ipa} style={{margin:0}}>{word.ipa}</p>}
   </div>
   <SpeakButton word={word}/>
  </div>}/>;
}

/**
 * Аудирование. Отказ воспроизведения не засчитывается как ошибка знания: можно повторить или продолжить без аудио —
 * упражнение пропускается без события и без сдвига интервалов.
 */
export function Listening(props:Props){
 const word=props.item.word;
 const kind=useAudioKind(word);
 const played=useRef(false);
 const [failed,setFailed]=useState(false);
 const play=()=>playWord(word).then(result=>setFailed(result==='error'||result==='none'));
 useEffect(()=>{if(!played.current){played.current=true;play()}},[word.id]);
 return <Choice {...props} prompt="Что прозвучало?" art={false} correct={word.greek} options={props.item.options}
  head={<div className="flex w-full flex-col items-center gap-3">
   <Button size="icon-xl" className="size-[76px] rounded-full [&_svg:not([class*='size-'])]:size-8" disabled={kind==='none'} aria-label="Повторить аудио" onClick={play}><Volume2 aria-hidden/></Button>
   {failed&&(
    <div data-testid="audio-failed" role="alert" className="w-full rounded-[14px] p-3 text-left" style={{background:'var(--almost-bg)',color:'var(--almost-fg)'}}>
     <p className="m-0 text-sm">Аудио не воспроизвелось. Это не влияет на прогресс: попробуйте ещё раз или продолжите без аудирования.</p>
     <div className="mt-2 flex gap-2">
      <Button size="sm" variant="outline" onClick={play}>Повторить</Button>
      {props.onSkip&&<Button size="sm" variant="outline" onClick={props.onSkip}>Продолжить без аудио</Button>}
     </div>
    </div>
   )}
  </div>}/>;
}

/** Ступень перед свободным написанием: слово собирается из перемешанных слогов. */
export function Assembly({item,onAnswer,onNext}:Props){
 const [placed,setPlaced]=useState<number[]>([]);
 const [result,setResult]=useState<'correct'|'wrong'|'skipped'|null>(null);
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setPlaced([]);setResult(null);setSaving(false)},[item.id]);
 const revealed=useRevealed(!!result);
 const word=item.word;
 const correct=tiles(word.greek);
 const pool=item.options;
 const answer=placed.map(index=>pool[index]).join('');
 const complete=placed.length===pool.length;

 const check=async(skip=false)=>{
  if((!complete&&!skip)||result||saving)return;
  const right=!skip&&answer===correct.join('');
  setSaving(true);
  const saved=await onAnswer({correct:right,text:skip?'':answer});
  setSaving(false);
  if(saved)setResult(skip?'skipped':right?'correct':'wrong');
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
       <div>{result==='correct'?'Правильно!':result==='skipped'?'Правильный порядок слогов:':'Пока не сходится — посмотри порядок слогов.'}</div>
       <p className="m-0 mt-1.5 text-[19px]">{correct.join(' · ')}</p>
      </div>
      {word.examples[0]&&<div style={{textAlign:'left',marginTop:12}}><ExampleBox example={word.examples[0]}/></div>}
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
     :<Button size="xl" disabled={!complete||saving} onClick={()=>check()}>{saving?'Сохраняем…':'Проверить'}</Button>}
    {!result&&<Button variant="outline" size="xl" disabled={saving} onClick={()=>check(true)}>Не знаю</Button>}
   </div>
  </>
 );
}

export function Spelling({item,onAnswer,onNext}:Props){
 const [value,setValue]=useState('');
 const [result,setResult]=useState<{status:'correct'|'almost'|'wrong';message:string;skipped?:boolean}|null>(null);
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setValue('');setResult(null);setSaving(false)},[item.id]);
 const revealed=useRevealed(!!result);
 const word=item.word;
 const skip=async()=>{
  if(result||saving)return;
  setSaving(true);
  const saved=await onAnswer({correct:false,text:''});
  setSaving(false);
  if(saved)setResult({status:'wrong',message:`Правильный ответ: ${word.greek}`,skipped:true});
 };
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();
  if(!value.trim()||result||saving)return;
  const checked=checkAnswer(value,word.greek);
  setSaving(true);
  const saved=await onAnswer({correct:checked.status==='correct',text:value,status:checked.status});
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
       {result.status!=='correct'&&!result.skipped&&(
        <>
         <p className={s.chars} data-testid="chars" style={{margin:'6px 0 0'}}>
          {diffChars(value,word.greek).map((part,index)=>part.type==='same'?<b key={index}>{part.text}</b>:part.type==='wrong'?<s key={index}>{part.text}</s>:<u key={index}>{part.text}</u>)}
         </p>
         <p className={ui.small} style={{margin:'4px 0 0',opacity:.85}}>Зелёное — совпало, красное — лишнее, подчёркнутое — пропущено.</p>
         <p className={ui.small} style={{margin:'6px 0 0'}}>Правильно: {word.greek}</p>
        </>
       )}
      </div>
      {word.examples[0]&&<div style={{textAlign:'left',marginTop:12}}><ExampleBox example={word.examples[0]}/></div>}
     </div>
    )}
   </div>
   <div className={s.dock}>
    {!result?(
     <form onSubmit={submit}>
      <input className={s.answer} type="text" value={value} onChange={event=>setValue(event.target.value)} disabled={saving}
       autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label="Твой ответ по-гречески" lang="el"/>
      <Button size="xl" type="submit" disabled={!value.trim()||saving}>{saving?'Сохраняем…':'Проверить'}</Button>
      <Button variant="outline" size="xl" type="button" disabled={saving} onClick={skip}>Не знаю</Button>
     </form>
    ):<Button size="xl" onClick={onNext}>Далее</Button>}
   </div>
  </>
 );
}
