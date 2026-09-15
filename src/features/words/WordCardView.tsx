import {useState} from 'react';
import {Volume2} from 'lucide-react';
import type {Example, Word} from '../../domain/types';
import {coreWord, stressNote, stressPosition} from '../../domain/phonetics';
import {playWord, useAudioKind} from '../../shared/audio';
import {useAssetUrl} from '../../shared/store';

export function WordArt({word,hidden}:{word:Word;hidden?:boolean}){
 const url=useAssetUrl(hidden?undefined:word.imageAssetId);
 if(hidden||!word.imageAssetId)return null;
 if(!url)return <div className="word-art" aria-hidden/>;
 return <img className="word-art" src={url} alt="" role="presentation"/>;
}

export function SpeakButton({word,label='Послушать слово'}:{word:Word;label?:string}){
 const kind=useAudioKind(word);
 const [failed,setFailed]=useState(false);
 return (
  <>
   <button className="speak" disabled={kind==='none'} aria-label={kind==='none'?'Озвучка недоступна':label}
    onClick={()=>playWord(word).then(result=>setFailed(result==='none'))}>
    <Volume2 size={26} aria-hidden/>
   </button>
   {(kind==='none'||failed)&&<span className="small muted">Озвучка недоступна: нет файла и греческого голоса</span>}
  </>
 );
}

export function ReadingNotes({word}:{word:Word}){
 const [open,setOpen]=useState<number|null>(null);
 const segments=[...word.segments].filter(s=>s.start>=0).sort((a,b)=>a.start-b.start);
 const parts:{text:string;index:number|null}[]=[];
 let cursor=0;
 segments.forEach((segment,index)=>{
  if(segment.start<cursor)return;
  if(segment.start>cursor)parts.push({text:word.greek.slice(cursor,segment.start),index:null});
  parts.push({text:segment.text,index});
  cursor=segment.start+segment.text.length;
 });
 if(cursor<word.greek.length)parts.push({text:word.greek.slice(cursor),index:null});
 const note=stressNote(word.greek);
 const core=coreWord(word.greek);
 const accent=stressPosition(word.greek);
 const active=open===null?null:segments[open];
 if(!note&&!segments.length)return null;
 return (
  <section className="card soft" aria-label="Как читается">
   {note&&(
    <p className="small" style={{margin:segments.length?'0 0 10px':0}}>{note}:{' '}
     <b style={{fontSize:19}}>
      {accent
       ?<>{core.slice(0,accent.start)}<span className="target">{core.slice(accent.start,accent.start+accent.length)}</span>{core.slice(accent.start+accent.length)}</>
       :core}
     </b>
    </p>
   )}
   {segments.length>0&&(
    <>
     <p style={{fontSize:22,margin:'0 0 6px'}}>
      {parts.map((part,i)=>part.index===null
       ?<span key={i}>{part.text}</span>
       :<button key={i} className="seg" aria-expanded={open===part.index} onClick={()=>setOpen(open===part.index?null:part.index)}>{part.text}</button>)}
     </p>
     <p className="small muted" style={{margin:0}}>
      {active?<>«{active.text}» → [{active.ipa}]. {active.explanation}</>:'Нажмите на подчёркнутое сочетание букв.'}
     </p>
    </>
   )}
  </section>
 );
}

export function ExampleBox({example,title='В контексте'}:{example:Example;title?:string}){
 const at=example.target?example.greek.indexOf(example.target):-1;
 return (
  <section className="card soft">
   <p className="small muted" style={{margin:'0 0 6px'}}>{title}</p>
   <p style={{fontSize:20,margin:'0 0 4px'}}>
    {at<0?example.greek:<>{example.greek.slice(0,at)}<span className="target">{example.target}</span>{example.greek.slice(at+example.target.length)}</>}
   </p>
   <p className="small muted" style={{margin:0}}>{example.russian}</p>
  </section>
 );
}
