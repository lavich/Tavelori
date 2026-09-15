import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {seedArt,seedLessons,seedWords,words11,words12} from '../src/content';
import {stressNote} from '../src/domain/phonetics';
import {lesson11} from '../src/content/seed-1-1';
import {lesson12} from '../src/content/seed-1-2';

const md=readFileSync('openspec/changes/build-greek-vocabulary-mvp/seed-lessons.md','utf8');
const section=(title:string)=>md.split(`## ${title}`)[1].split('\n## ')[0];
const rows=(title:string)=>section(title).split('\n').filter(line=>/^\| [^-]/.test(line)&&!line.includes('Греческий'))
 .map(line=>line.split('|').slice(1,4).map(cell=>cell.trim()));

describe('исходные наборы точно соответствуют seed-lessons.md',()=>{
 it.each([['Урок 1.1',words11,33,21],['Урок 1.2',words12,30,8]] as const)('%s',(title,words,count,mastered)=>{
  const expected=rows(title);
  expect(expected).toHaveLength(count);
  expect(words.map(w=>[w.greek,w.russian,w.sourceMastered?'да':'нет'])).toEqual(expected);
  expect(words.filter(w=>w.sourceMastered)).toHaveLength(mastered);
 });
 it('даёт стабильные неповторяющиеся id и не смешивает наборы',()=>{
  expect(new Set(seedWords.map(w=>w.id)).size).toBe(63);
  expect(seedLessons[0].wordIds).toEqual(words11.map(w=>w.id));
  expect(seedLessons[1].targetDate).toBe('2026-09-18');
 });
});

describe('карточка каждого исходного слова готова',()=>{
 it('у всех 63 слов есть IPA с ударением и распознанный ударный слог',()=>{
  for(const word of seedWords){
   expect(word.ipa,word.greek).toMatch(/^\/.+\/$/);
   const core=word.greek.replace(/^(ο|η|το|τα|οι) /,'');
   if(core.split(/\s+/).length===1&&core.length>3) expect(stressNote(word.greek),word.greek).not.toBeNull();
  }
 });
 it('диапазоны разбора чтения указывают на реальные буквы слова',()=>{
  for(const word of seedWords) for(const segment of word.segments){
   expect(word.greek.slice(segment.start,segment.start+segment.text.length),`${word.greek}/${segment.text}`).toBe(segment.text);
   expect(segment.explanation.length).toBeGreaterThan(8);
   expect(segment.ipa).not.toMatch(/[а-яА-Я]/);
  }
 });
 it('ни одна пометка чтения не теряется и не указывает на артикль молча',()=>{
  for(const entry of [...lesson11,...lesson12]) for(const [text,,explanation] of entry.n){
   const at=entry.g.indexOf(text);
   expect(at,`${entry.g}: сочетание «${text}» не найдено в слове`).toBeGreaterThanOrEqual(0);
   const article=entry.g.match(/^(ο|η|το|τα|οι)\s/)?.[1];
   if(article&&at<article.length)expect(explanation,`${entry.g}: пометка попала в артикль`).toMatch(/артикл/i);
  }
 });
 it('пример содержит выделяемую форму слова и русский перевод',()=>{
  for(const word of seedWords){
   const [example]=word.examples;
   expect(example.greek,word.greek).toMatch(/[Ͱ-Ͽἀ-῿]/u);
   expect(example.greek.includes(example.target),`${word.greek}: ${example.greek}`).toBe(true);
   expect(example.russian,word.greek).toMatch(/[а-яА-ЯёЁ]/);
   expect(example.source).toBeTruthy();
  }
 });
 it('у каждого слова есть своя иллюстрация без текста',()=>{
  const seen=new Set<string>();
  for(const word of seedWords){
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
  const cards=seedWords.map(w=>`<figure><div class="a">${seedArt[w.greek]}</div><figcaption>${w.greek} — ${w.russian}</figcaption></figure>`).join('');
  mkdirSync('docs',{recursive:true});
  writeFileSync('docs/art-sheet.html',`<!doctype html><meta charset="utf-8"><title>Иллюстрации Lexi</title><style>body{font:14px system-ui;background:#f7f7f5;margin:0;padding:16px;display:grid;grid-template-columns:repeat(5,1fr);gap:12px}figure{margin:0;background:#fff;border-radius:12px;overflow:hidden}.a svg{display:block;width:100%}figcaption{padding:6px 8px;color:#171717}</style>${cards}`);
  expect(seedWords).toHaveLength(63);
 });
});
