import {useState} from 'react';
import {Volume2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card, CardContent} from '@/components/ui/card';
import type {Example, Word} from '../../domain/types';
import {coreWord, stressNote, stressPosition} from '../../domain/phonetics';
import {playWord, speakPhrase, useAudioKind, useGreekVoice} from '../../shared/audio';
import {useAssetUrl} from '../../shared/store';
import ui from '../../shared/ui.module.css';
import wordCss from '../../shared/word.module.css';
import {cx} from '../../shared/cx';

export function WordArt({word,hidden}:{word:Word;hidden?:boolean}){
 const url=useAssetUrl(hidden?undefined:word.imageAssetId);
 if(hidden||!word.imageAssetId)return null;
 if(!url)return <div className={wordCss.art} aria-hidden/>;
 return <img className={wordCss.art} src={url} alt="" role="presentation" data-testid="word-art"/>;
}

export function SpeakButton({word,label='Послушать слово'}:{word:Word;label?:string}){
 const kind=useAudioKind(word);
 const [failed,setFailed]=useState(false);
 return (
  <>
   <Button size="icon-xl" className="size-14 rounded-full [&_svg:not([class*='size-'])]:size-6.5"
    disabled={kind==='none'} aria-label={kind==='none'?'Озвучка недоступна':label}
    onClick={()=>playWord(word).then(result=>setFailed(result==='none'))}>
    <Volume2 aria-hidden/>
   </Button>
   {(kind==='none'||failed)&&<span className={cx(ui.small, ui.muted)}>Озвучка недоступна: нет файла и греческого голоса</span>}
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
  <Card className="mb-3 bg-soft ring-0" aria-label="Как читается"><CardContent>
   {note&&(
    <p className={ui.small} style={{margin:segments.length?'0 0 10px':0}}>{note}:{' '}
     <b style={{fontSize:19}}>
      {accent
       ?<>{core.slice(0,accent.start)}<span className={wordCss.target}>{core.slice(accent.start,accent.start+accent.length)}</span>{core.slice(accent.start+accent.length)}</>
       :core}
     </b>
    </p>
   )}
   {segments.length>0&&(
    <>
     <p style={{fontSize:22,margin:'0 0 6px'}}>
      {parts.map((part,i)=>part.index===null
       ?<span key={i}>{part.text}</span>
       :<button key={i} className={wordCss.seg} aria-expanded={open===part.index} onClick={()=>setOpen(open===part.index?null:part.index)}>{part.text}</button>)}
     </p>
     <p className={cx(ui.small, ui.muted)} style={{margin:0}}>
      {active?<>«{active.text}» → [{active.ipa}]. {active.explanation}</>:'Нажмите на подчёркнутое сочетание букв.'}
     </p>
    </>
   )}
  </CardContent></Card>
 );
}

export function ExampleBox({example,title='В контексте'}:{example:Example;title?:string}){
 const at=example.target?example.greek.indexOf(example.target):-1;
 const voice=useGreekVoice();
 return (
  <Card className="mb-3 bg-soft ring-0"><CardContent>
   <div className="flex items-start justify-between gap-2">
    <div className="min-w-0 flex-1">
     <p className={cx(ui.small, ui.muted)} style={{margin:'0 0 6px'}}>{title}</p>
     <p style={{fontSize:20,margin:'0 0 4px'}}>
      {at<0?example.greek:<>{example.greek.slice(0,at)}<span className={wordCss.target}>{example.target}</span>{example.greek.slice(at+example.target.length)}</>}
     </p>
     <p className={cx(ui.small, ui.muted)} style={{margin:0}}>{example.russian}</p>
    </div>
    <Button variant="ghost" size="icon-lg" className="-mt-1 shrink-0 text-primary hover:bg-primary/10"
     disabled={!voice} aria-label={voice?'Послушать предложение':'Озвучка предложения недоступна: нет греческого голоса'}
     onClick={()=>speakPhrase(example.greek)}>
     <Volume2/>
    </Button>
   </div>
  </CardContent></Card>
 );
}
