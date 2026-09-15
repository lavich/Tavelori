import type {Asset, Example, Lesson, Segment, Word} from '../domain/types';
import {lesson11} from './seed-1-1';
import {lesson12} from './seed-1-2';
import {ART11} from './art-1-1';
import {ART12} from './art-1-2';
import type {SeedWord} from './types';

/** Маркер исходного набора: повторный запуск не восстанавливает удалённые пользователем слова. */
export const SEED_VERSION='2026-09-15.1';
export const SEED_SOURCE='Собственная подготовка Lexi: правила чтения стандартного новогреческого, ручная проверка ударений и примеров.';
const CREATED='2026-09-15T00:00:00.000Z';

export const imageAssetId=(wordId:string)=>`img-${wordId}`;

const toSegments=(entry:SeedWord):Segment[]=>entry.n
 .map(([text,ipa,explanation]):Segment=>({text,ipa,explanation,start:entry.g.indexOf(text)}))
 .filter(segment=>segment.start>=0);

const toExample=(entry:SeedWord):Example=>({greek:entry.ex[0],russian:entry.ex[1],target:entry.ex[2],source:SEED_SOURCE});

const toWord=(entry:SeedWord,id:string,hasImage:boolean):Word=>({
 id,greek:entry.g,russian:entry.r,ipa:entry.ipa,segments:toSegments(entry),examples:[toExample(entry)],
 imageAssetId:hasImage?imageAssetId(id):undefined,sourceMastered:entry.m,verified:true,source:SEED_SOURCE,
 createdAt:CREATED,updatedAt:CREATED,
});

const pad=(index:number)=>String(index+1).padStart(2,'0');
export const words11=lesson11.map((entry,index)=>toWord(entry,`w11-${pad(index)}`,!!ART11[entry.g]));
export const words12=lesson12.map((entry,index)=>toWord(entry,`w12-${pad(index)}`,!!ART12[entry.g]));
export const seedWords:Word[]=[...words11,...words12];
export const seedArt:Record<string,string>={...ART11,...ART12};

export const seedLessons:Lesson[]=[
 {id:'lesson-1-1',title:'Урок 1.1',targetDate:null,status:'completed',wordIds:words11.map(w=>w.id),createdAt:CREATED,updatedAt:CREATED},
 {id:'lesson-1-2',title:'Урок 1.2',targetDate:'2026-09-18',status:'upcoming',wordIds:words12.map(w=>w.id),createdAt:CREATED,updatedAt:CREATED},
];

export function seedAssets():Asset[]{
 return seedWords.filter(word=>word.imageAssetId).map(word=>({
  id:word.imageAssetId!,kind:'image',mimeType:'image/svg+xml',
  blob:new Blob([seedArt[word.greek]],{type:'image/svg+xml'}),
  source:'Собственная векторная иллюстрация Lexi (CC0)',alt:`Иллюстрация к слову «${word.russian}»`,
 }));
}
