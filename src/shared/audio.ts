import {useEffect, useState} from 'react';
import {ensureAsset} from '../content/client';
import type {Word} from '../domain/types';

export type AudioKind='file'|'voice'|'none';
let cachedVoice:SpeechSynthesisVoice|null|undefined;
let current:HTMLAudioElement|null=null;
// Список голосов приходит асинхронно, поэтому сбрасываем кеш, когда браузер его обновил.
if(typeof speechSynthesis!=='undefined'){speechSynthesis.getVoices();speechSynthesis.addEventListener('voiceschanged',()=>{cachedVoice=undefined})}

function greekVoice():SpeechSynthesisVoice|null{
 if(typeof speechSynthesis==='undefined')return null;
 if(cachedVoice!==undefined)return cachedVoice;
 const voices=speechSynthesis.getVoices();
 if(!voices.length)return null;
 cachedVoice=voices.find(voice=>voice.lang?.toLowerCase().startsWith('el'))??null;
 return cachedVoice;
}
export const hasGreekVoice=()=>!!greekVoice();

/** Предложения читает системный голос: записанных файлов для примеров нет. */
export function speakPhrase(text:string):AudioKind{
 stopAudio();
 const voice=greekVoice();
 if(!voice)return 'none';
 const utterance=new SpeechSynthesisUtterance(text);
 utterance.voice=voice; utterance.lang=voice.lang||'el-GR'; utterance.rate=0.85;
 speechSynthesis.speak(utterance);
 return 'voice';
}
export function audioKind(word:Word|undefined):AudioKind{
 if(!word)return 'none';
 if(word.audioAssetId)return 'file';
 return greekVoice()?'voice':'none';
}
export function stopAudio(){
 if(current){current.pause();current.currentTime=0;current=null}
 if(typeof speechSynthesis!=='undefined')speechSynthesis.cancel();
}
export async function playWord(word:Word):Promise<AudioKind>{
 stopAudio();
 if(word.audioAssetId){
  const asset=await ensureAsset(word.audioAssetId).catch(()=>null);
  if(asset){
   const url=URL.createObjectURL(asset.blob);
   const audio=new Audio(url);
   current=audio;
   audio.addEventListener('ended',()=>URL.revokeObjectURL(url),{once:true});
   await audio.play().catch(()=>undefined);
   return 'file';
  }
 }
 const voice=greekVoice();
 if(!voice)return 'none';
 const utterance=new SpeechSynthesisUtterance(word.greek);
 utterance.voice=voice; utterance.lang=voice.lang||'el-GR'; utterance.rate=0.9;
 speechSynthesis.speak(utterance);
 return 'voice';
}
/** Голос появляется асинхронно, поэтому доступность пересчитывается после загрузки списка. */
export function useGreekVoice():boolean{
 const [available,setAvailable]=useState(hasGreekVoice);
 useEffect(()=>{
  setAvailable(hasGreekVoice());
  if(typeof speechSynthesis==='undefined')return;
  const update=()=>{cachedVoice=undefined;setAvailable(hasGreekVoice())};
  speechSynthesis.addEventListener('voiceschanged',update);
  return()=>speechSynthesis.removeEventListener('voiceschanged',update);
 },[]);
 return available;
}

/** Голоса появляются асинхронно, поэтому доступность пересчитывается после загрузки. */
export function useAudioKind(word:Word|undefined):AudioKind{
 const [kind,setKind]=useState<AudioKind>(()=>audioKind(word));
 useEffect(()=>{
  setKind(audioKind(word));
  if(typeof speechSynthesis==='undefined')return;
  const update=()=>{cachedVoice=undefined;setKind(audioKind(word))};
  speechSynthesis.addEventListener('voiceschanged',update);
  return()=>speechSynthesis.removeEventListener('voiceschanged',update);
 },[word?.id,word?.audioAssetId]);
 return kind;
}
