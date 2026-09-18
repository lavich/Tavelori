import {useEffect, useState} from 'react';
import {ensureAsset} from '../content/client';
import type {Word} from '../domain/types';

export type AudioKind='file'|'voice'|'none';
/** Итог воспроизведения: `error` — файл или голос есть, но проигрывание отклонено; это не ошибка знания слова. */
export type PlayResult=AudioKind|'error';
let cachedVoice:SpeechSynthesisVoice|null|undefined;
let current:HTMLAudioElement|null=null;
// Список голосов приходит асинхронно, поэтому сбрасываем кеш, когда браузер его обновил.
if(typeof speechSynthesis!=='undefined'){speechSynthesis.getVoices();speechSynthesis.addEventListener('voiceschanged',()=>{cachedVoice=undefined})}
// Скрытие приложения (в том числе сворачивание Telegram) останавливает звук.
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAudio()});

function greekVoice():SpeechSynthesisVoice|null{
 if(typeof speechSynthesis==='undefined')return null;
 if(cachedVoice!==undefined)return cachedVoice;
 let voices:SpeechSynthesisVoice[]=[];
 try{voices=speechSynthesis.getVoices()}catch{return null}
 if(!voices.length)return null;
 cachedVoice=voices.find(voice=>voice.lang?.toLowerCase().startsWith('el'))??null;
 return cachedVoice;
}
export const hasGreekVoice=()=>!!greekVoice();

const speak=(text:string,voice:SpeechSynthesisVoice,rate:number):PlayResult=>{
 try{
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.voice=voice; utterance.lang=voice.lang||'el-GR'; utterance.rate=rate;
  speechSynthesis.speak(utterance);
  return 'voice';
 }catch{return 'error'}
};
/** Предложения читает системный голос: записанных файлов для примеров нет. */
export function speakPhrase(text:string):PlayResult{
 stopAudio();
 const voice=greekVoice();
 if(!voice)return 'none';
 return speak(text,voice,0.85);
}
export function audioKind(word:Word|undefined):AudioKind{
 if(!word)return 'none';
 if(word.audioAssetId)return 'file';
 return greekVoice()?'voice':'none';
}
export function stopAudio(){
 if(current){try{current.pause();current.currentTime=0}catch{/* элемент уже освобождён */}current=null}
 if(typeof speechSynthesis!=='undefined'){try{speechSynthesis.cancel()}catch{/* синтез недоступен */}}
}
/**
 * Отказ воспроизведения не подавляется: экран получает `error` и предлагает повтор или продолжение без аудирования.
 * Файл, который не проигрался, не подменяется голосом молча — иначе пользователь услышит другое произношение.
 */
export async function playWord(word:Word):Promise<PlayResult>{
 stopAudio();
 if(word.audioAssetId){
  const asset=await ensureAsset(word.audioAssetId).catch(()=>null);
  if(asset){
   const url=URL.createObjectURL(asset.blob);
   const audio=new Audio(url);
   current=audio;
   const release=()=>URL.revokeObjectURL(url);
   audio.addEventListener('ended',release,{once:true});
   try{await audio.play();return 'file'}
   catch{release();if(current===audio)current=null;return 'error'}
  }
  if(!greekVoice())return 'error'; // файл обещан, но недоступен, а голоса нет
 }
 const voice=greekVoice();
 if(!voice)return 'none';
 return speak(word.greek,voice,0.9);
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

/** Файл, если он обещан записью, иначе системный голос: общий путь для слова, фразы и полного предложения пропуска. */
export async function playText(text:string,audioAssetId?:string):Promise<PlayResult>{
 stopAudio();
 if(audioAssetId){
  const asset=await ensureAsset(audioAssetId).catch(()=>null);
  if(asset){
   const url=URL.createObjectURL(asset.blob);
   const audio=new Audio(url);
   current=audio;
   const release=()=>URL.revokeObjectURL(url);
   audio.addEventListener('ended',release,{once:true});
   try{await audio.play();return 'file'}
   catch{release();if(current===audio)current=null;return 'error'}
  }
  if(!greekVoice())return 'error';
 }
 const voice=greekVoice();
 if(!voice)return 'none';
 return speak(text,voice,0.85);
}
export const textAudioKind=(audioAssetId:string|undefined):AudioKind=>audioAssetId?'file':greekVoice()?'voice':'none';
/** Доступность озвучки текста; голос появляется асинхронно. */
export function useTextAudioKind(audioAssetId:string|undefined):AudioKind{
 const [kind,setKind]=useState<AudioKind>(()=>textAudioKind(audioAssetId));
 useEffect(()=>{
  setKind(textAudioKind(audioAssetId));
  if(typeof speechSynthesis==='undefined')return;
  const update=()=>{cachedVoice=undefined;setKind(textAudioKind(audioAssetId))};
  speechSynthesis.addEventListener('voiceschanged',update);
  return()=>speechSynthesis.removeEventListener('voiceschanged',update);
 },[audioAssetId]);
 return kind;
}
