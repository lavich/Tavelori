import {useEffect, useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import {Check, Volume2, X} from 'lucide-react';
import type {Cloze, Phrase, SessionCard, SessionItem, Word} from '../../domain/types';
import {checkAnswer} from '../../domain/import';
import {checkTextAnswer, fillGap, splitTemplate, type TextAnswerResult} from '../../domain/cloze';
import {diffChars} from '../../domain/spelling';
import {assemblyOptions, formatSyllables, restoreWriting, splitWriting} from '../../domain/syllables';
import {playText, playWord, useAudioKind, useTextAudioKind} from '../../shared/audio';
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

export const lessonLabel=(item:Pick<SessionItem,'lessonTitle'|'lessonPast'>)=>item.lessonTitle?`${item.lessonPast?'Хвост урока':'К уроку'} ${shortTitle(item.lessonTitle)}`:null;
/** Слово карточки; для других видов упражнения слов не создаются. */
const wordOf=(card:SessionCard):Word=>{if(card.kind!=='word')throw new Error('Упражнение для слова получило другую карточку');return card.word};

/**
 * Один автозапуск озвучки при открытии карточки. Карточки перемонтируются по `key`, поэтому
 * ссылка-флаг защищает от повторного запуска при перерисовке той же карточки.
 * Пропуск не озвучивается сам: следом идёт то же предложение с пропуском, и услышанный ответ
 * превратил бы первую проверку в повтор по свежему следу. Кнопка остаётся.
 */
function useAutoSpeak(card:SessionCard,enabled:boolean){
 const played=useRef(false);
 useEffect(()=>{
  if(!enabled||played.current||card.kind==='cloze')return;
  played.current=true;
  if(card.kind==='word')playWord(card.word);
  else playText(card.phrase.text,card.phrase.audioAssetId);
 },[card,enabled]);
}

/** Кнопка озвучки текста фразы или полного предложения; при отсутствии файла и голоса — подпись. */
export function SpeakText({text,audioAssetId,label}:{text:string;audioAssetId?:string;label:string}){
 const kind=useTextAudioKind(audioAssetId);
 const [failed,setFailed]=useState<'none'|'error'|null>(null);
 return (
  <div className={wordCss.speakBox}>
   <Button size="icon-xl" className="size-14 rounded-full [&_svg:not([class*='size-'])]:size-6.5"
    disabled={kind==='none'} aria-label={kind==='none'?'Озвучка недоступна':label}
    onClick={()=>playText(text,audioAssetId).then(result=>setFailed(result==='none'||result==='error'?result:null))}>
    <Volume2 aria-hidden/>
   </Button>
   {(kind==='none'||failed==='none')&&<span className={cx(ui.small, ui.muted)}>Озвучка недоступна: нет файла и греческого голоса</span>}
   {failed==='error'&&<span className={cx(ui.small, ui.muted)} role="status">Не удалось воспроизвести. Нажмите ещё раз.</span>}
  </div>
 );
}

/**
 * Карточка слова: картинка, написание, IPA, перевод, заметки о чтении и пример.
 * `speak` добавляет кнопку озвучки: в раскрытии после аудирования она лишняя — повтор уже есть в задании.
 */
function WordReveal({word,speak}:{word:Word;speak?:boolean}){
 return (
  <>
   <WordArt word={word}/>
   <div className={cx(ui.row, ui.between)} style={{width:'100%',gap:12}}>
    <div className={ui.grow} style={{minWidth:0,textAlign:'left'}}>
     <p className={wordCss.greek} style={{margin:0}}>{word.greek}</p>
     {word.ipa&&<p className={wordCss.ipa} style={{margin:0}}>{word.ipa}</p>}
     <p style={{fontSize:19,margin:'6px 0 0'}}>{word.russian}</p>
    </div>
    {speak&&<SpeakButton word={word}/>}
   </div>
   <div style={{width:'100%',textAlign:'left'}}>
    <ReadingNotes word={word}/>
    {word.examples[0]&&<ExampleBox example={word.examples[0]}/>}
   </div>
  </>
 );
}
/**
 * Карточка фразы: текст целиком, перевод, ситуация употребления и примечание.
 * `speak` добавляет кнопку озвучки — в знакомстве она нужна, в раскрытии после ответа
 * дублировала бы кнопку повтора аудио самого задания.
 */
function PhraseReveal({phrase,speak}:{phrase:Phrase;speak?:boolean}){
 return (
  <>
   <div className={cx(ui.row, ui.between)} style={{width:'100%',gap:12}}>
    <div className={ui.grow} style={{minWidth:0,textAlign:'left'}}>
     <p className={wordCss.greek} style={{margin:0}} data-testid="phrase-text">{phrase.text}</p>
     {phrase.translation?<p style={{fontSize:19,margin:'6px 0 0'}}>{phrase.translation}</p>:<p className={cx(ui.small, ui.muted)} style={{margin:'6px 0 0'}}>Перевода в материале нет</p>}
    </div>
    {speak&&<SpeakText text={phrase.text} audioAssetId={phrase.audioAssetId} label="Послушать фразу"/>}
   </div>
   {(phrase.usage||phrase.note)&&(
    <div style={{width:'100%',textAlign:'left'}}>
     {phrase.usage&&<p className={ui.small} style={{margin:'0 0 6px'}}>{phrase.usage}</p>}
     {phrase.note&&<p className={cx(ui.small, ui.muted)} style={{margin:0}}>{phrase.note}</p>}
    </div>
   )}
  </>
 );
}
/** Знакомство с пропуском: полный пример с выделенной формой, контекст и объяснение из материала. */
function ClozeIntro({cloze}:{cloze:Cloze}){
 const {before,after}=splitTemplate(cloze.template);
 return (
  <>
   <div className={cx(ui.row, ui.between)} style={{width:'100%',gap:12}}>
    <div className={ui.grow} style={{minWidth:0,textAlign:'left'}}>
     <p className={wordCss.greek} style={{margin:0}} data-testid="cloze-example">{before}<span className={wordCss.target}>{cloze.answer}</span>{after}</p>
     {cloze.context&&<p style={{fontSize:19,margin:'6px 0 0'}}>{cloze.context}</p>}
    </div>
    <SpeakText text={fillGap(cloze.template,cloze.answer)} audioAssetId={cloze.audioAssetId} label="Послушать предложение"/>
   </div>
   {cloze.explanation&&<p className={ui.small} style={{width:'100%',textAlign:'left',margin:0}}>{cloze.explanation}</p>}
  </>
 );
}

export function Introduction({item,onReady,saving=false,autoSpeak=false}:{item:Pick<SessionItem,'card'|'lessonTitle'|'lessonPast'>;onReady:()=>void;saving?:boolean;autoSpeak?:boolean}){
 const {card}=item;
 const label=lessonLabel(item);
 // Знакомство показывает материал, а не проверяет знание: отказ озвучки здесь не показывается — кнопка сама объясняет недоступность.
 useAutoSpeak(card,autoSpeak);
 const title=card.kind==='word'?'Новое слово':card.kind==='phrase'?'Новая фраза':'Новое задание с пропуском';
 return (
  <>
   <div className={s.center}>
    <p className={cx(s.prompt,card.kind==='word'&&'sr-only')} data-testid="prompt">{title}</p>
    {label&&<p className={s.prompt} style={{margin:0}} data-testid="lesson-label">{label}</p>}
    {card.kind==='word'&&<WordReveal word={card.word} speak/>}
    {card.kind==='phrase'&&<PhraseReveal phrase={card.phrase} speak/>}
    {card.kind==='cloze'&&<ClozeIntro cloze={card.cloze}/>}
   </div>
   <div className={s.dock}><Button size="xl" disabled={saving} onClick={onReady}>{saving?'Сохраняем…':'Далее'}</Button></div>
  </>
 );
}

function Choice({item,onAnswer,onNext,prompt,head,options,correct,after}:Props&{prompt:string;head:React.ReactNode;options:string[];correct:string;after?:React.ReactNode}){
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
    {answered&&after}
   </div>
   <div className={s.dock}>{answered?<Button size="xl" onClick={onNext}>Далее</Button>:<Button variant="outline" size="xl" disabled={saving} onClick={()=>choose(null)}>Не знаю</Button>}</div>
  </>
 );
}

export function Recognition(props:Props&{autoSpeak?:boolean}){
 const {card}=props.item;
 // Узнавание проверяет значение, а звучит показанное написание: подсказки нет, поэтому карточка озвучивается сама.
 useAutoSpeak(card,!!props.autoSpeak);
 if(card.kind==='phrase'){
  const phrase=card.phrase;
  return <Choice {...props} prompt="Что значит эта фраза?" correct={phrase.translation??''} options={props.item.options}
   head={<div className="flex w-full flex-wrap items-center justify-center gap-3">
    <p className={wordCss.greek} style={{margin:'6px 0'}}>{phrase.text}</p>
    <SpeakText text={phrase.text} audioAssetId={phrase.audioAssetId} label="Послушать фразу"/>
   </div>}
   after={phrase.usage?<p className={ui.small} style={{width:'100%',textAlign:'left'}}>{phrase.usage}</p>:undefined}/>;
 }
 const word=wordOf(card);
 return <Choice {...props} prompt="Что значит это слово?" correct={word.russian} options={props.item.options}
  head={<div className="flex w-full flex-wrap items-center justify-center gap-3">
   <div>
    <p className={wordCss.greek} style={{margin:'6px 0'}}>{word.greek}</p>
    {word.ipa&&<p className={wordCss.ipa} style={{margin:0}}>{word.ipa}</p>}
   </div>
   <SpeakButton word={word}/>
  </div>}
  after={word.examples[0]&&<div style={{width:'100%',textAlign:'left'}}><ExampleBox example={word.examples[0]}/></div>}/>;
}

/**
 * Аудирование. Отказ воспроизведения не засчитывается как ошибка знания: можно повторить или продолжить без аудио —
 * упражнение пропускается без события и без сдвига интервалов. Варианты для фразы — фразы, для слова — слова.
 * После ответа раскрывается карточка со значением: выбрать написание на слух можно и не зная смысла,
 * поэтому верный ответ показывает её наравне с ошибкой и с «Не знаю». Показ ничего не сохраняет.
 */
export function Listening(props:Props&{autoSpeak?:boolean}){
 const {card}=props.item;
 const text=card.kind==='phrase'?card.phrase.text:wordOf(card).greek;
 const audioAssetId=card.kind==='phrase'?card.phrase.audioAssetId:wordOf(card).audioAssetId;
 const wordKind=useAudioKind(card.kind==='word'?card.word:undefined);
 const textKind=useTextAudioKind(audioAssetId);
 const kind=card.kind==='word'?wordKind:textKind;
 const played=useRef(false);
 const [failed,setFailed]=useState(false);
 const play=()=>(card.kind==='word'?playWord(card.word):playText(text,audioAssetId)).then(result=>setFailed(result==='error'||result==='none'));
 useEffect(()=>{if(props.autoSpeak&&!played.current){played.current=true;play()}},[props.item.id,props.autoSpeak]);
 return <Choice {...props} prompt="Что прозвучало?" correct={text} options={props.item.options}
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
  </div>}
  after={<div data-testid="reveal" style={{width:'100%'}}>
   {card.kind==='phrase'?<PhraseReveal phrase={card.phrase}/>:<WordReveal word={wordOf(card)}/>}
  </div>}/>;
}

/**
 * Понимание на слух: звучит слово или фраза, варианты ответа — переводы. До ответа письменной опоры нет,
 * иначе проверялось бы чтение. После ответа раскрывается та же карточка со значением, что и в аудировании:
 * из ошибки должно быть что извлечь. Отказ воспроизведения тоже ведёт себя как в аудировании.
 */
export function Comprehension(props:Props&{autoSpeak?:boolean}){
 const {card}=props.item;
 const word=card.kind==='word'?card.word:null;
 const text=word?word.greek:card.kind==='phrase'?card.phrase.text:'';
 const audioAssetId=word?word.audioAssetId:card.kind==='phrase'?card.phrase.audioAssetId:undefined;
 const correct=word?word.russian:card.kind==='phrase'?(card.phrase.translation??''):'';
 const wordKind=useAudioKind(word??undefined);
 const textKind=useTextAudioKind(audioAssetId);
 const kind=word?wordKind:textKind;
 const played=useRef(false);
 const [failed,setFailed]=useState(false);
 const play=()=>(word?playWord(word):playText(text,audioAssetId)).then(result=>setFailed(result==='error'||result==='none'));
 useEffect(()=>{if(props.autoSpeak&&!played.current){played.current=true;play()}},[props.item.id,props.autoSpeak]);
 return <Choice {...props} prompt="Что это значит?" correct={correct} options={props.item.options}
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
  </div>}
  after={<div data-testid="reveal" style={{width:'100%'}}>
   {word?<WordReveal word={word}/>:card.kind==='phrase'?<PhraseReveal phrase={card.phrase}/>:null}
  </div>}/>;
}

/** Ступень перед свободным написанием: слово собирается из перемешанных слогов. Только для слов. */
export function Assembly({item,onAnswer,onNext}:Props){
 const [placed,setPlaced]=useState<number[]>([]);
 const [result,setResult]=useState<'correct'|'wrong'|'skipped'|null>(null);
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setPlaced([]);setResult(null);setSaving(false)},[item.id]);
 const revealed=useRevealed(!!result);
 const word=wordOf(item.card);
 const writing=splitWriting(word.greek);
 const pool=assemblyOptions(word.greek,item.options);
 const ordered=placed.map(index=>pool[index]);
 const answer=restoreWriting(word.greek,ordered);
 const complete=placed.length===pool.length;

 const check=async(skip=false)=>{
  if((!complete&&!skip)||result||saving)return;
  const right=!skip&&answer.normalize('NFC').trim()===word.greek.normalize('NFC').trim();
  setSaving(true);
  const saved=await onAnswer({correct:right,text:skip?'':answer});
  setSaving(false);
  if(saved)setResult(skip?'skipped':right?'correct':'wrong');
 };
 return (
  <>
   <div className={s.center}>
    <p className={s.prompt} data-testid="prompt">Собери слово</p>
    {writing.article&&<p className={s.prompt} data-testid="article-hint">Слово дано с артиклем</p>}
    <p className={wordCss.greek} style={{margin:'6px 0'}}>{word.russian}</p>
    <WordArt word={word}/>
    {result&&(
     <div style={{width:'100%'}} ref={revealed}>
      <div data-testid="feedback" className={cx(s.feedback, result==='correct'?s.ok:s.bad)} style={{marginTop:0}}>
       <div>{result==='correct'?'Правильно!':result==='skipped'?(writing.article?'Правильное написание:':'Правильный порядок слогов:'):(writing.article?'Пока не сходится — посмотри написание.':'Пока не сходится — посмотри порядок слогов.')}</div>
       <p className="m-0 mt-1.5 text-[19px]">{formatSyllables(word.greek)}</p>
      </div>
      {word.examples[0]&&<div style={{textAlign:'left',marginTop:12}}><ExampleBox example={word.examples[0]}/></div>}
     </div>
    )}
   </div>
   <div className={s.dock}>
    {!result&&<>
    <div className={s.slots} aria-label="Собранное слово" data-testid="assembled">
     {writing.article&&<span className={s.article} data-testid="fixed-article"><span>Артикль</span>{writing.article}</span>}
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

/** Написание слова по переводу или фразы целиком по её переводу. У фразы проверка без послаблений артиклю. */
export function Spelling({item,onAnswer,onNext}:Props){
 const [value,setValue]=useState('');
 const [result,setResult]=useState<{status:'correct'|'almost'|'wrong';message:string;skipped?:boolean}|null>(null);
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setValue('');setResult(null);setSaving(false)},[item.id]);
 const revealed=useRevealed(!!result);
 const {card}=item;
 const expected=card.kind==='phrase'?card.phrase.text:wordOf(card).greek;
 const prompt=card.kind==='phrase'?card.phrase.translation??'':wordOf(card).russian;
 const skip=async()=>{
  if(result||saving)return;
  setSaving(true);
  const saved=await onAnswer({correct:false,text:''});
  setSaving(false);
  if(saved)setResult({status:'wrong',message:`Правильный ответ: ${expected}`,skipped:true});
 };
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();
  if(!value.trim()||result||saving)return;
  const checked=card.kind==='phrase'?checkTextAnswer(value,[card.phrase.text]):checkAnswer(value,expected);
  setSaving(true);
  const saved=await onAnswer({correct:checked.status==='correct',text:value,status:checked.status});
  setSaving(false);
  if(saved)setResult(checked);
 };
 return (
  <>
   <div className={s.center}>
    <p className={s.prompt} data-testid="prompt">Напиши по-гречески</p>
    <p className={wordCss.greek} style={{margin:'6px 0'}}>{prompt}</p>
    {card.kind==='word'&&<WordArt word={card.word}/>}
    {result&&(
     <div style={{width:'100%'}} ref={revealed}>
      <div data-testid="feedback" className={cx(s.feedback, result.status==='correct'?s.ok:result.status==='almost'?s.almost:s.bad)} style={{marginTop:0}}>
       <div>{result.message}</div>
       {result.status!=='correct'&&!result.skipped&&(
        <>
         <p className={s.chars} data-testid="chars" style={{margin:'6px 0 0'}}>
          {diffChars(value,expected).map((part,index)=>part.type==='same'?<b key={index}>{part.text}</b>:part.type==='wrong'?<s key={index}>{part.text}</s>:<u key={index}>{part.text}</u>)}
         </p>
         <p className={ui.small} style={{margin:'4px 0 0',opacity:.85}}>Зелёное — совпало, красное — лишнее, подчёркнутое — пропущено.</p>
         <p className={ui.small} style={{margin:'6px 0 0'}}>Правильно: {expected}</p>
        </>
       )}
      </div>
      {card.kind==='word'&&card.word.examples[0]&&<div style={{textAlign:'left',marginTop:12}}><ExampleBox example={card.word.examples[0]}/></div>}
      {card.kind==='phrase'&&<div className="mt-3 flex justify-center"><SpeakText text={card.phrase.text} audioAssetId={card.phrase.audioAssetId} label="Послушать фразу"/></div>}
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

/**
 * Заполнение пропуска. До ответа видны только шаблон, поле ввода и контекст на языке перевода: правильная форма,
 * полное предложение, объяснение, озвучка и подсказки для экранного диктора не выводятся в DOM.
 * После успешно сохранённого ответа — результат, полное предложение, объяснение при наличии и озвучка.
 */
export function ClozeExercise({item,onAnswer,onNext}:Props){
 const [value,setValue]=useState('');
 const [result,setResult]=useState<(TextAnswerResult&{skipped?:boolean})|null>(null);
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setValue('');setResult(null);setSaving(false)},[item.id]);
 const revealed=useRevealed(!!result);
 const {card}=item;
 if(card.kind!=='cloze')throw new Error('Упражнение с пропуском получило другую карточку');
 const cloze=card.cloze;
 const {before,after}=splitTemplate(cloze.template);
 const skip=async()=>{
  if(result||saving)return;
  setSaving(true);
  const saved=await onAnswer({correct:false,text:''});
  setSaving(false);
  if(saved)setResult({status:'wrong',message:'Правильная форма:',expected:cloze.answer,skipped:true});
 };
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();
  if(!value.trim()||result||saving)return;
  const checked=checkTextAnswer(value,cloze.acceptedAnswers,{template:cloze.template});
  setSaving(true);
  const saved=await onAnswer({correct:checked.status==='correct',text:value,status:checked.status});
  setSaving(false);
  if(saved)setResult(checked);
 };
 const sentence=fillGap(cloze.template,result?.expected??cloze.answer);
 return (
  <>
   <div className={s.center}>
    <p className={s.prompt} data-testid="prompt">Заполни пропуск</p>
    {!result&&(
     <p className={wordCss.greek} style={{margin:'6px 0'}} data-testid="cloze-template">
      {before}<span aria-label="пропуск" className={s.gap}>…</span>{after}
     </p>
    )}
    {cloze.context&&!result&&<p style={{fontSize:19,margin:0}} data-testid="cloze-context">{cloze.context}</p>}
    {result&&(
     <div style={{width:'100%'}} ref={revealed}>
      <div data-testid="feedback" className={cx(s.feedback, result.status==='correct'?s.ok:result.status==='almost'?s.almost:s.bad)} style={{marginTop:0}}>
       <div>{result.message}</div>
       <p className="m-0 mt-1.5 text-[19px]" data-testid="cloze-sentence">{before}<span className={wordCss.target}>{result.expected}</span>{after}</p>
       {result.status!=='correct'&&!result.skipped&&(
        <p className={s.chars} data-testid="chars" style={{margin:'6px 0 0'}}>
         {diffChars(value,result.expected).map((part,index)=>part.type==='same'?<b key={index}>{part.text}</b>:part.type==='wrong'?<s key={index}>{part.text}</s>:<u key={index}>{part.text}</u>)}
        </p>
       )}
       {cloze.context&&<p className={ui.small} style={{margin:'6px 0 0'}}>{cloze.context}</p>}
       {cloze.explanation&&<p className={ui.small} style={{margin:'6px 0 0'}} data-testid="cloze-explanation">{cloze.explanation}</p>}
      </div>
      <div className="mt-3 flex justify-center"><SpeakText text={sentence} audioAssetId={cloze.audioAssetId} label="Послушать предложение"/></div>
     </div>
    )}
   </div>
   <div className={s.dock}>
    {!result?(
     <form onSubmit={submit}>
      <input className={s.answer} type="text" value={value} onChange={event=>setValue(event.target.value)} disabled={saving}
       autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label="Пропущенная часть предложения" lang="el" data-testid="cloze-input"/>
      <Button size="xl" type="submit" disabled={!value.trim()||saving}>{saving?'Сохраняем…':'Проверить'}</Button>
      <Button variant="outline" size="xl" type="button" disabled={saving} onClick={skip}>Не знаю</Button>
     </form>
    ):<Button size="xl" onClick={onNext}>Далее</Button>}
   </div>
  </>
 );
}
