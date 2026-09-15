import {useEffect, useRef, useState} from 'react';
import {Volume2} from 'lucide-react';
import type {SessionItem, Word} from '../../domain/types';
import {checkAnswer} from '../../domain/import';
import {diffChars} from '../../domain/spelling';
import {playWord, useAudioKind} from '../../shared/audio';
import {ExampleBox, ReadingNotes, SpeakButton, WordArt} from '../words/WordCardView';

export interface Answer {correct:boolean|null;rating:1|2|3|4;text:string;status?:'correct'|'almost'|'wrong'}
interface Props {item:SessionItem;onAnswer:(answer:Answer)=>void;onNext:()=>void}

const GRADES:{rating:1|2|3|4;title:string;hint:string}[]=[
 {rating:1,title:'Не вспомнил',hint:'покажем снова сегодня'},
 {rating:2,title:'С трудом',hint:'короткий интервал'},
 {rating:3,title:'Вспомнил',hint:'обычный интервал'},
 {rating:4,title:'Легко',hint:'длинный интервал'},
];

export function Introduction({word,onReady}:{word:Word;onReady:()=>void}){
 return (
  <>
   <p className="prompt">Новое слово</p>
   <WordArt word={word}/>
   <div className="row between" style={{width:'100%',gap:12,marginTop:14}}>
    <div className="grow" style={{minWidth:0,textAlign:'left'}}>
     <p className="greek" style={{margin:0}}>{word.greek}</p>
     {word.ipa&&<p className="ipa" style={{margin:0}}>{word.ipa}</p>}
     <p style={{fontSize:19,margin:'6px 0 0'}}>{word.russian}</p>
    </div>
    <SpeakButton word={word}/>
   </div>
   <div style={{width:'100%',textAlign:'left',marginTop:14}}>
    <ReadingNotes word={word}/>
    {word.examples[0]&&<ExampleBox example={word.examples[0]}/>}
   </div>
   <button className="btn" onClick={onReady} style={{marginTop:8}}>Запомнил — проверим</button>
  </>
 );
}

export function Recall({item,onAnswer,onNext}:Props){
 const [open,setOpen]=useState(false);
 const [done,setDone]=useState(false);
 useEffect(()=>{setOpen(false);setDone(false)},[item.id]);
 const word=item.word;
 return (
  <>
   <p className="prompt">Вспомни слово</p>
   <p className="greek" style={{margin:'6px 0'}}>{word.russian}</p>
   <p className="prompt">Как это будет по-гречески?</p>
   <WordArt word={word}/>
   {!open?(
    <div className="actions" style={{width:'100%'}}>
     <button className="btn" onClick={()=>setOpen(true)}>Показать ответ</button>
     <p className="hint">Сначала попробуй вспомнить самостоятельно</p>
    </div>
   ):(
    <div style={{width:'100%'}}>
     <div className="row between" style={{gap:12}}>
      <div className="grow" style={{minWidth:0,textAlign:'left'}}>
       <p className="greek" style={{margin:0}}>{word.greek}</p>
       {word.ipa&&<p className="ipa" style={{margin:0}}>{word.ipa}</p>}
      </div>
      <SpeakButton word={word}/>
     </div>
     {word.examples[0]&&<div style={{textAlign:'left',marginTop:12}}><ExampleBox example={word.examples[0]}/></div>}
     {!done?(
      <>
       <p className="prompt" style={{marginTop:10}}>Насколько легко вспомнилось?</p>
       <div className="grades">
        {GRADES.map(grade=>(
         <button key={grade.rating} className="grade" onClick={()=>{setDone(true);onAnswer({correct:null,rating:grade.rating,text:''})}}>
          <b>{grade.title}</b><span>{grade.hint}</span>
         </button>
        ))}
       </div>
      </>
     ):<button className="btn" style={{marginTop:14}} onClick={onNext}>Далее</button>}
    </div>
   )}
  </>
 );
}

function Choice({item,onAnswer,onNext,prompt,head,options,correct,art}:Props&{prompt:string;head:React.ReactNode;options:string[];correct:string;art:boolean}){
 const [picked,setPicked]=useState<string|null>(null);
 useEffect(()=>setPicked(null),[item.id]);
 return (
  <>
   <p className="prompt">{prompt}</p>
   {head}
   {art&&<WordArt word={item.word}/>}
   <div className="options" style={{width:'100%',marginTop:10}}>
    {options.map(option=>(
     <button key={option} className={`option ${picked?option===correct?'correct':option===picked?'wrong':'':''}`} disabled={!!picked}
      onClick={()=>{setPicked(option);onAnswer({correct:option===correct,rating:option===correct?3:1,text:option})}}>{option}</button>
    ))}
   </div>
   {picked&&(
    <div style={{width:'100%'}}>
     <div className={`feedback ${picked===correct?'ok':'bad'}`}>
      {picked===correct?'Правильно!':`Правильный ответ: ${correct}`}
     </div>
     {item.word.examples[0]&&<div style={{textAlign:'left'}}><ExampleBox example={item.word.examples[0]}/></div>}
     <button className="btn" onClick={onNext}>Далее</button>
    </div>
   )}
  </>
 );
}

export function Recognition(props:Props){
 const word=props.item.word;
 return <Choice {...props} prompt="Что означает слово?" art={false} correct={word.russian} options={props.item.options}
  head={<><p className="greek" style={{margin:'6px 0'}}>{word.greek}</p>{word.ipa&&<p className="ipa" style={{margin:0}}>{word.ipa}</p>}</>}/>;
}

export function Listening(props:Props){
 const word=props.item.word;
 const kind=useAudioKind(word);
 const played=useRef(false);
 useEffect(()=>{if(!played.current){played.current=true;playWord(word)}},[word.id]);
 return <Choice {...props} prompt="Что вы услышали?" art={false} correct={word.greek} options={props.item.options}
  head={<button className="speak" style={{width:76,height:76}} disabled={kind==='none'} aria-label="Повторить аудио" onClick={()=>playWord(word)}><Volume2 size={32} aria-hidden/></button>}/>;
}

export function Spelling({item,onAnswer,onNext}:Props){
 const [value,setValue]=useState('');
 const [result,setResult]=useState<{status:'correct'|'almost'|'wrong';message:string}|null>(null);
 useEffect(()=>{setValue('');setResult(null)},[item.id]);
 const word=item.word;
 const submit=(event:React.FormEvent)=>{
  event.preventDefault();
  if(!value.trim()||result)return;
  const checked=checkAnswer(value,word.greek);
  setResult(checked);
  onAnswer({correct:checked.status==='correct',rating:checked.status==='correct'?3:1,text:value,status:checked.status});
 };
 return (
  <>
   <p className="prompt">Напишите по-гречески</p>
   <p className="greek" style={{margin:'6px 0'}}>{word.russian}</p>
   <WordArt word={word}/>
   <form style={{width:'100%',marginTop:12}} onSubmit={submit}>
    <input className="answer" type="text" value={value} onChange={event=>setValue(event.target.value)} disabled={!!result}
     autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label="Ваш ответ по-гречески" lang="el"/>
    {!result&&<button className="btn" type="submit" style={{marginTop:12}} disabled={!value.trim()}>Проверить</button>}
   </form>
   {result&&(
    <div style={{width:'100%'}}>
     <div className={`feedback ${result.status==='correct'?'ok':result.status==='almost'?'almost':'bad'}`}>
      <div>{result.message}</div>
      {result.status!=='correct'&&(
       <p className="chars" style={{margin:'6px 0 0'}}>
        {diffChars(value,word.greek).map((part,index)=>part.type==='same'?<b key={index}>{part.text}</b>:part.type==='wrong'?<s key={index}>{part.text}</s>:<u key={index}>{part.text}</u>)}
       </p>
      )}
      {result.status!=='correct'&&<p className="small" style={{margin:'4px 0 0',opacity:.85}}>Зелёное — совпало, красное — лишнее, подчёркнутое — пропущено.</p>}
      {result.status!=='correct'&&<p className="small" style={{margin:'6px 0 0'}}>Правильно: {word.greek}</p>}
     </div>
     {word.examples[0]&&<div style={{textAlign:'left'}}><ExampleBox example={word.examples[0]}/></div>}
     <button className="btn" onClick={onNext}>Далее</button>
    </div>
   )}
  </>
 );
}
