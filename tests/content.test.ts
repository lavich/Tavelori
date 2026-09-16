import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {seedArt, seedLessons, seedWords, wordsOf} from '../src/content';
import {lesson11} from '../src/content/seed-1-1';
import {lesson12} from '../src/content/seed-1-2';
import {lesson13} from '../src/content/seed-1-3';
import {lesson14} from '../src/content/seed-1-4';
import {wordKey} from '../src/domain/import';
import {stressNote} from '../src/domain/phonetics';
import {tiles} from '../src/domain/syllables';

const md=readFileSync('openspec/changes/archive/2026-09-16-build-greek-vocabulary-mvp/seed-lessons.md','utf8');
const section=(title:string)=>md.split(`## ${title}`)[1].split('\n## ')[0];
const rows=(title:string)=>section(title).split('\n').filter(line=>/^\| [^-]/.test(line)&&!line.includes('Греческий'))
 .map(line=>line.split('|').slice(1,4).map(cell=>cell.trim()));

const prepared=[...wordsOf('lesson-1-1'),...wordsOf('lesson-1-2')];

describe('исходные наборы 1.1 и 1.2 точно соответствуют seed-lessons.md',()=>{
 it.each([['Урок 1.1','lesson-1-1',33,21],['Урок 1.2','lesson-1-2',30,8]] as const)('%s',(title,lessonId,count,mastered)=>{
  const expected=rows(title);
  const words=wordsOf(lessonId);
  expect(expected).toHaveLength(count);
  expect(words.map(w=>[w.greek,w.russian,w.sourceMastered?'да':'нет'])).toEqual(expected);
  expect(words.filter(w=>w.sourceMastered)).toHaveLength(mastered);
 });
});

describe('наборы класса переносятся без потерь и без дублей',()=>{
 it.each([
  ['lesson-1-3',lesson13,35],
  ['lesson-1-4',lesson14,35],
 ] as const)('%s',(lessonId,source,count)=>{
  expect(source).toHaveLength(count);
  const lesson=seedLessons.find(item=>item.id===lessonId)!;
  expect(lesson.wordIds).toHaveLength(count);
  const words=wordsOf(lessonId);
  expect(words.map(word=>[word.greek,word.russian])).toEqual(source.map(entry=>[entry.g,entry.r]));
 });

 it('повторяющееся слово остаётся одной записью с общим состоянием повторения',()=>{
  const all=[...lesson11,...lesson12,...lesson13,...lesson14];
  const unique=new Set(all.map(entry=>wordKey(entry.g,entry.r)));
  expect(seedWords).toHaveLength(unique.size);
  expect(new Set(seedWords.map(word=>word.id)).size).toBe(seedWords.length);
  // «το σπίτι» пришло и в 1.2, и в 1.3 — в наборах стоит один и тот же идентификатор
  const house=seedWords.filter(word=>word.greek==='το σπίτι');
  expect(house).toHaveLength(1);
  expect(seedLessons.find(l=>l.id==='lesson-1-3')!.wordIds).toContain(house[0].id);
 });

 it('каждое слово годится для упражнений: перевод, слоги и стабильный id',()=>{
  for(const word of seedWords){
   expect(word.greek.trim(),word.id).toMatch(/[Ͱ-Ͽἀ-῿]/u);
   expect(word.russian.trim().length,word.greek).toBeGreaterThan(0);
   expect(tiles(word.greek).length,`${word.greek}: нечего собирать`).toBeGreaterThanOrEqual(2);
  }
 });

 it('множественное число живёт в заметке, а не в самом слове',()=>{
  const year=seedWords.find(word=>word.russian==='год')!;
  expect(year.greek).toBe('ο χρόνος');
  expect(year.note).toContain('τα χρόνια');
  expect(tiles(year.greek)).toEqual(['ο','χρό','νος']);
 });
 it('слова без подготовленного контента честно помечены непроверенными',()=>{
  const plain=seedWords.filter(word=>!prepared.some(item=>item.id===word.id));
  expect(plain.length).toBeGreaterThan(0);
  for(const word of plain){
   expect(word.verified,word.greek).toBe(false);
   expect(word.ipa,word.greek).toBe('');
   expect(word.examples,word.greek).toEqual([]);
   expect(word.imageAssetId,word.greek).toBeUndefined();
  }
 });
});

describe('карточка каждого подготовленного слова готова',()=>{
 it('у всех 63 слов есть IPA с ударением и распознанный ударный слог',()=>{
  expect(prepared).toHaveLength(63);
  for(const word of prepared){
   expect(word.ipa,word.greek).toMatch(/^\/.+\/$/);
   const core=word.greek.replace(/^(ο|η|το|τα|οι) /,'');
   if(core.split(/\s+/).length===1&&core.length>3) expect(stressNote(word.greek),word.greek).not.toBeNull();
  }
 });
 it('диапазоны разбора чтения указывают на реальные буквы слова',()=>{
  for(const word of prepared) for(const segment of word.segments){
   expect(word.greek.slice(segment.start,segment.start+segment.text.length),`${word.greek}/${segment.text}`).toBe(segment.text);
   expect(segment.explanation.length).toBeGreaterThan(8);
   expect(segment.ipa).not.toMatch(/[а-яА-Я]/);
  }
 });
 it('ни одна пометка чтения не теряется и не указывает на артикль молча',()=>{
  for(const entry of [...lesson11,...lesson12]) for(const [text,,explanation] of entry.n??[]){
   const at=entry.g.indexOf(text);
   expect(at,`${entry.g}: сочетание «${text}» не найдено в слове`).toBeGreaterThanOrEqual(0);
   const article=entry.g.match(/^(ο|η|το|τα|οι)\s/)?.[1];
   if(article&&at<article.length)expect(explanation,`${entry.g}: пометка попала в артикль`).toMatch(/артикл/i);
  }
 });
 it('пример содержит выделяемую форму слова и русский перевод',()=>{
  for(const word of prepared){
   const [example]=word.examples;
   expect(example.greek,word.greek).toMatch(/[Ͱ-Ͽἀ-῿]/u);
   expect(example.greek.includes(example.target),`${word.greek}: ${example.greek}`).toBe(true);
   expect(example.russian,word.greek).toMatch(/[а-яА-ЯёЁ]/);
   expect(example.source).toBeTruthy();
  }
 });
 it('у каждого слова есть своя иллюстрация без текста',()=>{
  const seen=new Set<string>();
  for(const word of prepared){
   const art=seedArt[word.greek];
   expect(art,word.greek).toBeTruthy();
   expect(art).toMatch(/^<svg xmlns/);
   expect(art,`${word.greek}: подпись в картинке выдаёт ответ`).not.toMatch(/<text/);
   expect(seen.has(art),`${word.greek}: картинка повторяет другую`).toBe(false);
   seen.add(art);
   expect(word.imageAssetId).toBe(`img-${word.id}`);
  }
 });
 it('собирает лист для визуальной проверки',()=>{
  const cards=prepared.map(w=>`<figure><div class="a">${seedArt[w.greek]}</div><figcaption>${w.greek} — ${w.russian}</figcaption></figure>`).join('');
  mkdirSync('docs',{recursive:true});
  writeFileSync('docs/art-sheet.html',`<!doctype html><meta charset="utf-8"><title>Иллюстрации Lexi</title><style>body{font:14px system-ui;background:#f7f7f5;margin:0;padding:16px;display:grid;grid-template-columns:repeat(5,1fr);gap:12px}figure{margin:0;background:#fff;border-radius:12px;overflow:hidden}.a svg{display:block;width:100%}figcaption{padding:6px 8px;color:#171717}</style>${cards}`);
  expect(prepared).toHaveLength(63);
 });
});
