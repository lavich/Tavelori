import {useEffect, useState} from 'react';
import {Trash2} from 'lucide-react';
import {useNavigate, useParams} from 'react-router-dom';
import {BackBar} from '../../app/TopBar';
import type {Example, Word} from '../../domain/types';
import {checkMedia} from '../../shared/media';
import {useWord} from '../../shared/store';
import {deleteWord, putAsset, saveWord} from '../../storage/ops';
import ui from '../../shared/ui.module.css';
import {cx} from '../../shared/cx';

const emptyExample:Example={greek:'',russian:'',target:''};

export function WordEditorScreen(){
 const {id}=useParams();
 const stored=useWord(id);
 const navigate=useNavigate();
 const [draft,setDraft]=useState<Word|null>(null);
 const [problem,setProblem]=useState('');
 const [saved,setSaved]=useState(false);
 useEffect(()=>{if(stored&&!draft)setDraft(stored)},[stored]);
 if(!draft)return <><BackBar title="Редактор"/><main className={ui.screen}><p className={ui.muted}>Слово не найдено.</p></main></>;

 const patch=(next:Partial<Word>)=>{setDraft({...draft,...next});setSaved(false)};
 const patchExample=(index:number,next:Partial<Example>)=>
  patch({examples:draft.examples.map((example,i)=>i===index?{...example,...next}:example)});

 const upload=async(file:File|undefined,kind:'image'|'audio')=>{
  if(!file)return;
  setProblem('');
  const result=await checkMedia(file,kind);
  if(!result.ok)return setProblem(result.message); // старое медиа остаётся на месте
  const assetId=`${kind==='image'?'img':'snd'}-${draft.id}-${Date.now().toString(36)}`;
  await putAsset({id:assetId,kind,blob:result.blob,mimeType:file.type,source:'Загружено пользователем',alt:kind==='image'?`Иллюстрация к слову «${draft.russian}»`:''});
  const next={...draft,...(kind==='image'?{imageAssetId:assetId}:{audioAssetId:assetId})};
  setDraft(next);
  await saveWord(next);
  setSaved(true);
 };
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();
  if(!draft.greek.trim()||!draft.russian.trim())return setProblem('Нужны греческое слово и перевод.');
  await saveWord({...draft,examples:draft.examples.filter(example=>example.greek.trim()&&example.russian.trim())});
  setSaved(true);
 };
 return (
  <>
   <BackBar title="Редактор слова"/>
   <main className={ui.screen}>
    <form onSubmit={submit}>
     <label htmlFor="greek">Греческое слово (с артиклем)</label>
     <input id="greek" type="text" value={draft.greek} onChange={event=>patch({greek:event.target.value})}/>
     <label htmlFor="russian">Перевод</label>
     <input id="russian" type="text" value={draft.russian} onChange={event=>patch({russian:event.target.value})}/>
     <label htmlFor="ipa">Транскрипция IPA</label>
     <input id="ipa" type="text" value={draft.ipa} onChange={event=>patch({ipa:event.target.value,verified:false})} placeholder="/to ˈspiti/"/>
     <p className={cx(ui.small, ui.muted)}>{draft.verified?'Фонетика проверена при подготовке исходного набора.':'Ваша запись хранится как пользовательская и не считается проверенной.'}</p>

     <h2>Примеры употребления</h2>
     {draft.examples.map((example,index)=>(
      <div className={ui.card} key={index}>
       <label htmlFor={`ex-g-${index}`}>Предложение по-гречески</label>
       <input id={`ex-g-${index}`} type="text" value={example.greek} onChange={event=>patchExample(index,{greek:event.target.value})}/>
       <label htmlFor={`ex-r-${index}`}>Перевод</label>
       <input id={`ex-r-${index}`} type="text" value={example.russian} onChange={event=>patchExample(index,{russian:event.target.value})}/>
       <label htmlFor={`ex-t-${index}`}>Форма слова в предложении</label>
       <input id={`ex-t-${index}`} type="text" value={example.target} onChange={event=>patchExample(index,{target:event.target.value})}/>
       <button type="button" className={cx(ui.btn, ui.quiet)} style={{marginTop:10}}
        onClick={()=>patch({examples:draft.examples.filter((_,i)=>i!==index)})}>Удалить пример</button>
      </div>
     ))}
     <button type="button" className={cx(ui.btn, ui.ghost)} onClick={()=>patch({examples:[...draft.examples,{...emptyExample}]})}>Добавить пример</button>

     <h2>Медиа</h2>
     <label htmlFor="image">Изображение (PNG, JPEG, WebP, SVG, до 3 МБ)</label>
     <input id="image" type="file" accept="image/*" onChange={event=>upload(event.target.files?.[0],'image')}/>
     <label htmlFor="audio">Аудиофайл (MP3, OGG, WAV, M4A, до 5 МБ)</label>
     <input id="audio" type="file" accept="audio/*" onChange={event=>upload(event.target.files?.[0],'audio')}/>
     <p className={cx(ui.small, ui.muted)}>{draft.audioAssetId?'Аудиофайл сохранён в базе.':'Файла нет — слово озвучивается системным греческим голосом, если он доступен.'}</p>

     {problem&&<p className={ui.error} role="alert">{problem}</p>}
     <button className={ui.btn} type="submit" style={{marginTop:16}}>Сохранить</button>
     {saved&&<p className={ui.small} style={{color:'var(--ok)'}} role="status">Сохранено.</p>}
    </form>
    <button className={cx(ui.btn, ui.quiet)} style={{marginTop:24}}
     onClick={async()=>{if(confirm('Убрать слово из тренировок? История ответов останется.')){await deleteWord(draft.id);navigate('/words')}}}>
     <Trash2 size={18} aria-hidden/>Удалить слово
    </button>
   </main>
  </>
 );
}
