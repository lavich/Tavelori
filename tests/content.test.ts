import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {buildContent, revisionOf, wordsOf} from '../content/build';
import {ContentError, parseCatalog, parsePackage, SCHEMA_VERSION} from '../src/content/schema';
import {wordKey} from '../src/domain/import';
import {stressNote} from '../src/domain/phonetics';
import {tiles} from '../src/domain/syllables';

const md=readFileSync('openspec/changes/archive/2026-09-16-build-greek-vocabulary-mvp/seed-lessons.md','utf8');
const section=(title:string)=>md.split(`## ${title}`)[1].split('\n## ')[0];
const rows=(title:string)=>section(title).split('\n').filter(line=>/^\| [^-]/.test(line)&&!line.includes('Греческий'))
 .map(line=>line.split('|').slice(1,4).map(cell=>cell.trim()));

const content=buildContent();
const seedWords=content.words;
const prepared=[...wordsOf(content,'lesson-1-1'),...wordsOf(content,'lesson-1-2')];
const packageOf=(id:string)=>content.packages.find(p=>p.id===id)!;
const fileOf=(path:string)=>content.files.find(file=>file.path===path)!;
const lessonSource=(id:string)=>content.sources.lessons.get(id)!;
const seedArt=(id:string)=>Buffer.from(content.sources.files.get(`art/${id}.svg`)!).toString('utf8');

/** Копия исходников, в которой можно сломать один файл и проверить отказ публикации. */
function brokenCopy(mutate:(root:string)=>void){
 const root=mkdtempSync(join(tmpdir(),'lexi-content-'));
 for(const dir of ['words','lessons','art'])cpSync(join('content',dir),join(root,dir),{recursive:true});
 mutate(root);
 try{return buildContent(root)}finally{rmSync(root,{recursive:true,force:true})}
}

describe('исходные наборы 1.1 и 1.2 точно соответствуют seed-lessons.md',()=>{
 it.each([['Урок 1.1','lesson-1-1',33,21],['Урок 1.2','lesson-1-2',30,8]] as const)('%s',(title,lessonId,count,mastered)=>{
  const expected=rows(title);
  const words=wordsOf(content,lessonId);
  expect(expected).toHaveLength(count);
  expect(words.map(w=>[w.greek,w.russian,w.sourceMastered?'да':'нет'])).toEqual(expected);
  expect(words.filter(w=>w.sourceMastered)).toHaveLength(mastered);
 });
 it('пакет 1.1 проведён без выдуманной даты, 1.2 назначен на 18 сентября',()=>{
  expect(packageOf('lesson-1-1').lesson).toEqual({title:'Урок 1.1',status:'completed',targetDate:null});
  expect(packageOf('lesson-1-2').lesson).toEqual({title:'Урок 1.2',status:'upcoming',targetDate:'2026-09-18'});
 });
});

describe('наборы класса переносятся без потерь и без дублей',()=>{
 it.each([['lesson-1-3',35],['lesson-1-4',35]] as const)('%s',(lessonId,count)=>{
  const source=lessonSource(lessonId);
  expect(source.words).toHaveLength(count);
  expect(packageOf(lessonId).links).toHaveLength(count);
  expect(wordsOf(content,lessonId).map(word=>word.id)).toEqual(source.words);
 });

 it('повторяющееся слово остаётся одной записью с общим идентификатором во всех пакетах',()=>{
  const linked=new Set([...content.sources.lessons.values()].flatMap(lesson=>lesson.words));
  expect(seedWords).toHaveLength(linked.size);
  expect(new Set(seedWords.map(word=>wordKey(word.greek,word.russian))).size).toBe(seedWords.length);
  expect(new Set(seedWords.map(word=>word.id)).size).toBe(seedWords.length);
  // «το σπίτι» пришло и в 1.2, и в 1.3 — в обоих пакетах одна и та же запись
  const house=seedWords.filter(word=>word.greek==='το σπίτι');
  expect(house).toHaveLength(1);
  const inThird=packageOf('lesson-1-3').words.find(word=>word.id===house[0].id);
  expect(inThird).toEqual(house[0]);
  expect(packageOf('lesson-1-3').media.some(item=>item.id===house[0].imageAssetId)).toBe(true);
 });

 it('каждое слово годится для упражнений: перевод, слоги и стабильный id',()=>{
  for(const word of seedWords){
   expect(word.greek.trim(),word.id).toMatch(/[Ͱ-Ͽἀ-῿]/u);
   expect(word.russian.trim().length,word.greek).toBeGreaterThan(0);
   expect(tiles(word.greek).length,`${word.greek}: нечего собирать`).toBeGreaterThanOrEqual(2);
   expect(word.id).toMatch(/^w1[1-4]-\d{2}$/);
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

describe('каталог и пакеты',()=>{
 it('каталог содержит только метаданные, без слов и медиа',()=>{
  const catalog=parseCatalog(JSON.parse(fileOf('content/catalog.json').body as string));
  expect(catalog.lessons.map(l=>[l.id,l.wordCount,l.media.count])).toEqual([['lesson-1-1',33,33],['lesson-1-2',30,30],['lesson-1-3',35,6],['lesson-1-4',35,0]]);
  const text=fileOf('content/catalog.json').body as string;
  expect(text).not.toContain('σπίτι');
  expect(text).not.toContain('<svg');
  expect(text.length).toBeLessThan(2000);
  for(const entry of catalog.lessons){
   expect(entry.url).toBe(`content/packages/${entry.id}@${entry.version}.json`);
   expect(entry.bytes).toBe(Buffer.byteLength(fileOf(entry.url).body as string));
   expect(entry.language).toBe('el');
  }
 });
 it('каждый пакет проходит собственную проверку и ссылается на существующие медиа',()=>{
  for(const entry of content.catalog.lessons){
   const pack=parsePackage(JSON.parse(fileOf(entry.url).body as string));
   expect(pack.id).toBe(entry.id);
   expect(pack.version).toBe(entry.version);
   expect(pack.links.map(l=>l.position)).toEqual(pack.links.map((_,i)=>i));
   for(const item of pack.media){
    expect(item.url).toBe(`content/media/${item.id}@${item.version}.svg`);
    expect(Buffer.from(fileOf(item.url).body).toString("utf8")).toMatch(/^<svg xmlns/);
    expect(item.required).toBe(true);
   }
  }
 });
 it('версия пакета и ревизия слова меняются вместе с содержимым',()=>{
  const word=seedWords[0];
  expect(word.revision).toBe(revisionOf(word));
  expect(revisionOf({...word,russian:'другой перевод'})).not.toBe(word.revision);
  expect(revisionOf({...word,segments:[...word.segments]})).toBe(word.revision);
  expect([...content.sources.lessons.keys()]).toEqual(content.packages.map(p=>p.id));
 });
 it('публикация отклоняет дубликаты слов, битые ссылки уроков, сирот и подписи в картинках',()=>{
  const copy=(root:string,from:string,to:string)=>writeFileSync(join(root,'words',`${to}.yaml`),readFileSync(join('content','words',`${from}.yaml`)));
  expect(()=>brokenCopy(root=>{
   copy(root,'w12-16','w99-01');
   writeFileSync(join(root,'lessons','lesson-1-2.yaml'),readFileSync('content/lessons/lesson-1-2.yaml','utf8').replace('- w12-16','- w99-01'));
  })).toThrow(/повторяет слово «το σπίτι — дом»/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'lessons','lesson-1-2.yaml'),readFileSync('content/lessons/lesson-1-2.yaml','utf8').replace('- w12-16','- w12-99'))))
   .toThrow(/слова w12-99 нет/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'words','w99-01.yaml'),'greek: το τεστ\nrussian: тест\n'))).toThrow(/не входит ни в один урок/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'art','w12-16.svg'),'<svg xmlns="http://www.w3.org/2000/svg"><text>дом</text></svg>'))).toThrow(/выдаёт ответ/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'words','w12-16.yaml'),readFileSync('content/words/w12-16.yaml','utf8').replace('image: w12-16.svg','image: нет.svg')))).toThrow(/файла art\/нет.svg нет/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'words','w12-16.yaml'),readFileSync('content/words/w12-16.yaml','utf8').replace('target: σπίτι','target: σπιτάκι')))).toThrow(/не встречается в предложении/);
 });
 it('повреждённый, неполный и несовместимый пакет отклоняются понятной ошибкой',()=>{
  const pack=JSON.parse(fileOf(content.catalog.lessons[0].url).body as string);
  expect(()=>parsePackage({...pack,schemaVersion:SCHEMA_VERSION+1})).toThrow(/не поддерживается/);
  try{parsePackage({...pack,schemaVersion:99})}catch(error){expect((error as ContentError).kind).toBe('unsupported')}
  expect(()=>parsePackage({...pack,links:[...pack.links,{wordId:'нет',position:99}]})).toThrow(/которого нет в пакете/);
  expect(()=>parsePackage({...pack,words:[...pack.words,pack.words[0]]})).toThrow(/повторяются/);
  expect(()=>parsePackage({...pack,media:[{...pack.media[0],url:'https://evil.example/x.svg'}]})).toThrow(/относительной/);
  expect(()=>parsePackage({...pack,words:pack.words.map((w:{greek:string})=>({...w,greek:''}))})).toThrow(/нет написания/);
  expect(()=>parsePackage('строка')).toThrow(/ожидался объект/);
  expect(()=>parseCatalog({schemaVersion:1,generatedAt:'x',lessons:[{id:'a'}]})).toThrow(/ожидалась строка/);
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
 it('ни одна пометка чтения не указывает на артикль молча',()=>{
  for(const word of prepared) for(const segment of word.segments){
   const article=word.greek.match(/^(ο|η|το|τα|οι)\s/)?.[1];
   if(article&&segment.start<article.length)expect(segment.explanation,`${word.greek}: пометка попала в артикль`).toMatch(/артикл/i);
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
   const art=seedArt(word.id);
   expect(art,word.greek).toBeTruthy();
   expect(art).toMatch(/^<svg xmlns/);
   expect(art,`${word.greek}: подпись в картинке выдаёт ответ`).not.toMatch(/<text/);
   expect(seen.has(art),`${word.greek}: картинка повторяет другую`).toBe(false);
   seen.add(art);
   expect(word.imageAssetId).toBe(`img-${word.id}`);
  }
 });
 it('собирает лист для визуальной проверки',()=>{
  const cards=prepared.map(w=>`<figure><div class="a">${seedArt(w.id)}</div><figcaption>${w.greek} — ${w.russian}</figcaption></figure>`).join('');
  mkdirSync('docs',{recursive:true});
  writeFileSync('docs/art-sheet.html',`<!doctype html><meta charset="utf-8"><title>Иллюстрации Lexi</title><style>body{font:14px system-ui;background:#f7f7f5;margin:0;padding:16px;display:grid;grid-template-columns:repeat(5,1fr);gap:12px}figure{margin:0;background:#fff;border-radius:12px;overflow:hidden}.a svg{display:block;width:100%}figcaption{padding:6px 8px;color:#171717}</style>${cards}`);
  expect(prepared).toHaveLength(63);
 });
});
