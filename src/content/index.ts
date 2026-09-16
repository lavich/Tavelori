import {wordKey} from '../domain/import';
import type {Asset, Example, Lesson, Segment, Word} from '../domain/types';
import {lesson11} from './seed-1-1';
import {lesson12} from './seed-1-2';
import {lesson13} from './seed-1-3';
import {lesson14} from './seed-1-4';
import {ART11} from './art-1-1';
import {ART12} from './art-1-2';
import type {SeedWord} from './types';

/** Маркер исходного набора: повторный запуск не восстанавливает удалённые пользователем слова. */
export const SEED_VERSION='2026-09-16.2';
export const SEED_SOURCE='Собственная подготовка Lexi: правила чтения стандартного новогреческого, ручная проверка ударений и примеров.';
export const CLASS_SOURCE='Набор класса LEEKE A2 — 26-27, перенесён из Quizlet как есть.';
const CREATED='2026-09-15T00:00:00.000Z';

export const imageAssetId=(wordId:string)=>`img-${wordId}`;
export const seedArt:Record<string,string>={...ART11,...ART12};

const toSegments=(entry:SeedWord):Segment[]=>(entry.n??[])
 .map(([text,ipa,explanation]):Segment=>({text,ipa,explanation,start:entry.g.indexOf(text)}))
 .filter(segment=>segment.start>=0);

const toExamples=(entry:SeedWord):Example[]=>
 entry.ex?[{greek:entry.ex[0],russian:entry.ex[1],target:entry.ex[2],source:SEED_SOURCE}]:[];

interface SeedLesson {id:string;prefix:string;title:string;targetDate:string|null;status:Lesson['status'];words:SeedWord[]}
const LESSONS:SeedLesson[]=[
 {id:'lesson-1-1',prefix:'w11',title:'Урок 1.1',targetDate:null,status:'completed',words:lesson11},
 {id:'lesson-1-2',prefix:'w12',title:'Урок 1.2',targetDate:'2026-09-18',status:'upcoming',words:lesson12},
 {id:'lesson-1-3',prefix:'w13',title:'Урок 1.3',targetDate:null,status:'upcoming',words:lesson13},
 {id:'lesson-1-4',prefix:'w14',title:'Урок 1.4',targetDate:null,status:'upcoming',words:lesson14},
];
const pad=(index:number)=>String(index+1).padStart(2,'0');

/** Одинаковое слово в разных наборах — одна запись и одно состояние повторения. */
function build(){
 const words:Word[]=[]; const lessons:Lesson[]=[]; const byKey=new Map<string,string>();
 for(const lesson of LESSONS){
  const wordIds:string[]=[];
  lesson.words.forEach((entry,index)=>{
   const key=wordKey(entry.g,entry.r);
   const known=byKey.get(key);
   if(known){if(!wordIds.includes(known))wordIds.push(known);return}
   const id=`${lesson.prefix}-${pad(index)}`;
   const prepared=!!entry.ipa;
   words.push({
    id,greek:entry.g,russian:entry.r,ipa:entry.ipa??'',note:entry.note,segments:toSegments(entry),examples:toExamples(entry),
    imageAssetId:seedArt[entry.g]?imageAssetId(id):undefined,
    sourceMastered:entry.m,verified:prepared,source:prepared?SEED_SOURCE:CLASS_SOURCE,
    createdAt:CREATED,updatedAt:CREATED,
   });
   byKey.set(key,id);
   wordIds.push(id);
  });
  lessons.push({id:lesson.id,title:lesson.title,targetDate:lesson.targetDate,status:lesson.status,wordIds,createdAt:CREATED,updatedAt:CREATED});
 }
 return {words,lessons};
}
const built=build();
export const seedWords:Word[]=built.words;
export const seedLessons:Lesson[]=built.lessons;
export const wordsOf=(lessonId:string)=>{
 const ids=seedLessons.find(lesson=>lesson.id===lessonId)?.wordIds??[];
 return ids.map(id=>seedWords.find(word=>word.id===id)!).filter(Boolean);
};
export const words11=wordsOf('lesson-1-1');
export const words12=wordsOf('lesson-1-2');

/** Картинки хранятся как blob в базе, а не как внешние ссылки. */
export function seedAssets():Asset[]{
 return seedWords.filter(word=>word.imageAssetId).map(word=>({
  id:word.imageAssetId!,kind:'image',mimeType:'image/svg+xml',
  blob:new Blob([seedArt[word.greek]],{type:'image/svg+xml'}),
  source:'Собственная векторная иллюстрация Lexi (CC0)',alt:`Иллюстрация к слову «${word.russian}»`,
 }));
}
