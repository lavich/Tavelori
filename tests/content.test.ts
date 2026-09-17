import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {colorsOf, foreignColors, PALETTE, paletteColors, parseLegacy} from '../content/art';
import {buildContent, revisionOf, wordsOf} from '../content/build';
import {ContentError, parseCatalog, parsePackage, SCHEMA_VERSION} from '../src/content/schema';
import {wordKey} from '../src/domain/import';
import {stressNote} from '../src/domain/phonetics';
import {restoreWriting, tiles} from '../src/domain/syllables';

const md=readFileSync('openspec/changes/archive/2026-09-16-build-greek-vocabulary-mvp/seed-lessons.md','utf8');
const section=(title:string)=>md.split(`## ${title}`)[1].split('\n## ')[0];
const rows=(title:string)=>section(title).split('\n').filter(line=>/^\| [^-]/.test(line)&&!line.includes('Греческий'))
 .map(line=>line.split('|').slice(1,3).map(cell=>cell.trim()));

const content=buildContent();
const seedWords=content.words;
/** Подготовленные карточки: у них проверена фонетика, поэтому к ним предъявляются полные требования. */
const prepared=content.words.filter(word=>word.verified);
const packageOf=(id:string)=>content.packages.find(p=>p.id===id)!;
const fileOf=(path:string)=>content.files.find(file=>file.path===path)!;
const lessonSource=(id:string)=>content.sources.lessons.get(id)!;
const seedArt=(id:string)=>Buffer.from(content.sources.files.get(`art/${content.sources.words.get(id)!.image}`)!).toString('utf8');

/** Копия исходников, в которой можно сломать один файл и проверить отказ публикации. */
function brokenCopy(mutate:(root:string)=>void){
 const root=mkdtempSync(join(tmpdir(),'lexi-content-'));
 for(const dir of ['words','lessons','art','courses'])cpSync(join('content',dir),join(root,dir),{recursive:true});
 mutate(root);
 try{return buildContent(root)}finally{rmSync(root,{recursive:true,force:true})}
}

describe('исходные наборы 1.1 и 1.2 сохранены в начале уроков',()=>{
 /** Архивный набор не переставляется и не редактируется: дописанные позже слова идут после него. */
 it.each([['Урок 1.1','lesson-1-1',33],['Урок 1.2','lesson-1-2',30]] as const)('%s',(title,lessonId,count)=>{
  const expected=rows(title);
  const words=wordsOf(content,lessonId);
  expect(expected).toHaveLength(count);
  expect(words.slice(0,count).map(w=>[w.greek,w.russian])).toEqual(expected);
 });
 it('урок 1.1 дополнен пятью служебными словами после исходного набора',()=>{
  expect(wordsOf(content,'lesson-1-1').slice(33).map(w=>[w.greek,w.russian]))
   .toEqual([['Σωστό','верно'],['Λάθος','неверно'],['και','и'],['ένα','один'],['στο','в']]);
 });
 /** Пакет описывает урок, а не занятие: статус и дата принадлежат пользователю и в поставку не попадают. */
 it('пакет несёт только название урока',()=>{
  expect(packageOf('lesson-1-1').lesson).toEqual({title:'Урок 1.1'});
  expect(packageOf('lesson-1-2').lesson).toEqual({title:'Урок 1.2'});
  for(const [id,source] of content.sources.lessons) expect(Object.keys(source),id).toEqual(expect.not.arrayContaining(['status','targetDate']));
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

 it('каждое слово годится для упражнений: перевод, восстановимое написание и стабильный id',()=>{
  for(const word of seedWords){
   expect(word.greek.trim(),word.id).toMatch(/[Ͱ-Ͽἀ-῿]/u);
   expect(word.russian.trim().length,word.greek).toBeGreaterThan(0);
   expect(restoreWriting(word.greek,tiles(word.greek)),word.greek).toBe(word.greek.normalize('NFC').trim());
   expect(word.id).toMatch(/^w\d{2}-\d{2}$/);
  }
  expect(seedWords.filter(word=>tiles(word.greek).length<2).map(word=>word.greek)).toEqual(['η γη','και','ο γιος','στο','το φως']);
 });

 it('множественное число живёт в заметке, а не в самом слове',()=>{
  const year=seedWords.find(word=>word.russian==='год')!;
  expect(year.greek).toBe('ο χρόνος');
  expect(year.note).toContain('τα χρόνια');
  expect(tiles(year.greek)).toEqual(['χρό','νος']);
 });
 /** Полумеры недопустимы: карточка либо готова к занятию целиком, либо честно помечена непроверенной. */
 it('карточка подготовлена целиком или не претендует на подготовленность',()=>{
  for(const word of seedWords){
   if(word.verified){
    expect(word.ipa,word.greek).toMatch(/^\/.+\/$/);
    expect(word.examples.length,word.greek).toBeGreaterThan(0);
    expect(word.imageAssetId,word.greek).toBe(`img-${word.id}`);
   }else{
    expect(word.ipa,word.greek).toBe('');
    expect(word.examples,word.greek).toEqual([]);
    expect(word.imageAssetId,word.greek).toBeUndefined();
   }
  }
 });
});

describe('уроки принадлежат курсам',()=>{
 it('каталог отдаёт состав курса, а урок и пакет знают свой курс',()=>{
  const leeke=content.catalog.courses.find(course=>course.id==='leeke')!;
  expect(leeke.title).toBe('LEEKE A2');
  expect(leeke.lessonIds).toEqual(content.packages.map(pack=>pack.id));
  for(const entry of content.catalog.lessons)expect(entry.courseId,entry.id).toBe('leeke');
  for(const pack of content.packages)expect(pack.courseId,pack.id).toBe('leeke');
 });
 it('публикация требует, чтобы урок входил ровно в один курс',()=>{
  const leeke=readFileSync('content/courses/leeke.yaml','utf8');
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'courses','leeke.yaml'),leeke.replace('  - lesson-2-2\n',''))))
   .toThrow(/lessons\/lesson-2-2.yaml: урок не входит ни в один курс/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'courses','другой.yaml'),'title: Другой курс\nlessons:\n  - lesson-2-2\n')))
   .toThrow(/courses\/другой.yaml: урок lesson-2-2 уже входит в курс leeke/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'courses','leeke.yaml'),leeke+'  - lesson-9-9\n')))
   .toThrow(/courses\/leeke.yaml: урока lesson-9-9 нет/);
 });
 it('курс несёт язык и требует один язык на все свои уроки',()=>{
  expect(content.catalog.courses.find(course=>course.id==='leeke')!.language).toBe('el');
  const lesson=readFileSync('content/lessons/lesson-2-2.yaml','utf8');
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'lessons','lesson-2-2.yaml'),lesson.replace('language: el','language: en'))))
   .toThrow(/courses\/leeke.yaml: уроки курса на разных языках/);
 });
 it('каталог и пакет прежней версии без курса читаются как раньше',()=>{
  const catalog=JSON.parse(fileOf('content/catalog.json').body as string);
  const {courses:_,...flat}=catalog;
  expect(parseCatalog({...flat,lessons:catalog.lessons.map(({courseId:_id,...rest}:Record<string,unknown>)=>rest)}).courses).toEqual([]);
  const pack=JSON.parse(fileOf(content.catalog.lessons[0].url).body as string);
  const {courseId:_c,...older}=pack;
  expect(parsePackage(older).courseId).toBe('');
 });
});

describe('каталог и пакеты',()=>{
 it('каталог содержит только метаданные, без слов и медиа',()=>{
  const catalog=parseCatalog(JSON.parse(fileOf('content/catalog.json').body as string));
  expect(catalog.lessons.map(l=>[l.id,l.wordCount,l.media.count])).toEqual([['lesson-1-1',38,38],['lesson-1-2',30,30],['lesson-1-3',35,35],['lesson-1-4',35,35],['lesson-2-1',36,36],['lesson-2-2',33,33]]);
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
  const house=readFileSync('content/words/το-σπίτι.yaml','utf8');
  expect(()=>brokenCopy(root=>{
   writeFileSync(join(root,'words','дубль.yaml'),house.replace('id: w12-16','id: w99-01'));
   writeFileSync(join(root,'lessons','lesson-1-2.yaml'),readFileSync('content/lessons/lesson-1-2.yaml','utf8').replace('- w12-16','- w99-01'));
  })).toThrow(/повторяет слово «το σπίτι — дом»/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'words','дубль.yaml'),house))).toThrow(/идентификатор «w12-16» уже занят/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'lessons','lesson-1-2.yaml'),readFileSync('content/lessons/lesson-1-2.yaml','utf8').replace('- w12-16','- w12-99'))))
   .toThrow(/слова w12-99 нет/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'words','το-τεστ.yaml'),'greek: το τεστ\nrussian: тест\n'))).toThrow(/не входит ни в один урок/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'art','το-σπίτι.svg'),'<svg xmlns="http://www.w3.org/2000/svg"><text>дом</text></svg>'))).toThrow(/выдаёт ответ/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'words','το-σπίτι.yaml'),house.replace('image: το-σπίτι.svg','image: нет.svg')))).toThrow(/файла art\/нет.svg нет/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'words','το-σπίτι.yaml'),house.replace('target: σπίτι','target: σπιτάκι')))).toThrow(/не встречается в предложении/);
 });
 it('новое слово без поля id получает идентификатор из имени файла',()=>{
  const built=brokenCopy(root=>{
   writeFileSync(join(root,'words','το-δοκίμιο.yaml'),'greek: το δοκίμιο\nrussian: очерк\n');
   writeFileSync(join(root,'lessons','lesson-1-4.yaml'),readFileSync('content/lessons/lesson-1-4.yaml','utf8')+'  - το-δοκίμιο\n');
  });
  expect(built.words.find(word=>word.id==='το-δοκίμιο')).toMatchObject({greek:'το δοκίμιο',russian:'очерк'});
  expect(built.packages.find(p=>p.id==='lesson-1-4')!.links.at(-1)!.wordId).toBe('το-δοκίμιο');
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
  expect(()=>parseCatalog({schemaVersion:SCHEMA_VERSION,generatedAt:'x',lessons:[{id:'a'}]})).toThrow(/ожидалась строка/);
  expect(()=>parseCatalog({schemaVersion:1,generatedAt:'x',lessons:[]})).toThrow(/версии схемы 1 не поддерживается/);
 });
});

describe('карточка каждого подготовленного слова готова',()=>{
 it('у всех 194 слов есть IPA с ударением и распознанный ударный слог',()=>{
  expect(prepared).toHaveLength(194);
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
 /** Лист — рабочий инструмент миграции: легенда палитры сверху, файлы вне палитры выделены рамкой с перечнем чужих цветов. */
 it('собирает лист для визуальной проверки с легендой палитры и подсветкой файлов вне палитры',()=>{
  const legend=[...Object.entries(PALETTE.backgrounds),...Object.entries(PALETTE.colors)].map(([name,hex])=>`<span class="c"><i style="background:${hex}"></i>${name} ${hex}</span>`).join('');
  const cards=prepared.map(w=>{
   const art=seedArt(w.id), foreign=foreignColors(art);
   return `<figure${foreign.length?' class="legacy"':''}><div class="a">${art}</div><figcaption>${w.greek} — ${w.russian}${foreign.length?`<small>${foreign.join(' ')}</small>`:''}</figcaption></figure>`;
  }).join('');
  mkdirSync('docs',{recursive:true});
  writeFileSync('docs/art-sheet.html',`<!doctype html><meta charset="utf-8"><title>Иллюстрации Lexi</title><style>body{font:14px system-ui;background:#f7f7f5;margin:0;padding:16px;display:grid;grid-template-columns:repeat(5,1fr);gap:12px}header{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px 14px;font-size:12px}.c i{display:inline-block;width:14px;height:14px;border-radius:4px;vertical-align:-2px;margin-right:4px;border:1px solid #0002}figure{margin:0;background:#fff;border-radius:12px;overflow:hidden}figure.legacy{outline:2px solid #ef4444}.a svg{display:block;width:100%}figcaption{padding:6px 8px;color:#171717}figcaption small{display:block;color:#ef4444;font-family:monospace}</style><header>${legend}</header>${cards}`);
  expect(prepared).toHaveLength(194);
 });
});

/** Стандарт иллюстраций (docs/art-standard.md): палитра — данные, проверки — в публикации, старые файлы — в legacy.txt. */
describe('иллюстрации подчиняются стандарту',()=>{
 const legacyText=readFileSync('content/art/legacy.txt','utf8');
 const legacy=parseLegacy(legacyText);
 const house=readFileSync('content/words/το-σπίτι.yaml','utf8');
 const svg=(inner:string,attrs='viewBox="0 0 320 220"')=>`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect width="320" height="220" fill="#e7eefb"/>${inner}</svg>`;
 /** Копия, в которой το-σπίτι.svg перерисован заново и больше не числится унаследованным. */
 const redrawn=(art:string)=>brokenCopy(root=>{
  writeFileSync(join(root,'art','το-σπίτι.svg'),art);
  writeFileSync(join(root,'art','legacy.txt'),legacyText.replace('το-σπίτι.svg\n',''));
 });
 it('палитра — единственный источник: документ перечисляет те же цвета',()=>{
  const doc=readFileSync('docs/art-standard.md','utf8');
  const section=doc.split('\n## Палитра')[1].split('\n## ')[0];
  expect(new Set(section.match(/#[0-9a-f]{6}/g))).toEqual(paletteColors());
  expect(paletteColors().size).toBeGreaterThanOrEqual(12);
  expect(paletteColors().size).toBeLessThanOrEqual(20);
  for(const hex of paletteColors())expect(hex).toMatch(/^#[0-9a-f]{6}$/);
 });
 it('цвета читаются из атрибутов и style, запись нормализуется',()=>{
  expect(colorsOf('<path fill="#FFF" stroke=\'#2563EB\' style="stop-color: #e7eefb; fill:none"/><stop stop-color="currentColor"/>'))
   .toEqual(new Set(['#ffffff','#2563eb','#e7eefb','none','currentcolor']));
  expect(foreignColors('<path fill="none" stroke="#2563eb" opacity="0.5" style="fill:#abcdef"/>')).toEqual(['#abcdef']);
  expect(foreignColors('<path fill="#2563eb80"/>')).toEqual(['#2563eb80']);
 });
 it('текущий контент: 194 иллюстрации, 187 из них вне палитры и все в legacy.txt',()=>{
  expect(content.art).toEqual({files:194,legacy:187});
  for(const word of prepared){
   const file=content.sources.words.get(word.id)!.image!;
   expect(legacy.has(file),file).toBe(foreignColors(seedArt(word.id)).length>0);
  }
  // Список только сокращается: новую картинку в него не добавить, не подняв этот потолок в ревью.
  expect(legacy.size).toBeLessThanOrEqual(187);
 });
 it('новая картинка в палитре публикуется, служебные значения и прозрачность допустимы',()=>{
  const built=redrawn(svg('<path d="M10 10h20" fill="none" stroke="currentColor"/><circle cx="160" cy="110" r="40" fill="#2563EB" opacity="0.5"/><rect x="1" y="1" width="9" height="9" style="fill:#fbbf24;stroke:#1f2937"/>'));
  expect(built.art).toEqual({files:194,legacy:186});
 });
 it('отклоняет размер, холст, текст, заголовок, скрипт, стиль, анимацию, растр и внешние ссылки',()=>{
  expect(()=>redrawn(svg(`<path d="M${'0 '.repeat(1500)}"/>`))).toThrow(/потолок иллюстрации — 3072 байта/);
  expect(()=>redrawn(svg('<circle r="9"/>','viewBox="0 0 320 240"'))).toThrow(/холст viewBox="0 0 320 240", стандарт — viewBox="0 0 320 220"/);
  expect(()=>redrawn(svg('<circle r="9"/>','width="320"'))).toThrow(/холст viewBox=""/);
  expect(()=>redrawn(svg('<text>дом</text>'))).toThrow(/выдаёт ответ/);
  expect(()=>redrawn(svg('<title>дом</title>'))).toThrow(/заголовок или описание/);
  expect(()=>redrawn(svg('<script>alert(1)</script>'))).toThrow(/скрипт/);
  expect(()=>redrawn(svg('<circle r="9" onclick="x()"/>'))).toThrow(/обработчик события/);
  expect(()=>redrawn(svg('<style>@keyframes a{}</style>'))).toThrow(/стили/);
  expect(()=>redrawn(svg('<circle r="9"><animate attributeName="r" to="20"/></circle>'))).toThrow(/анимация/);
  expect(()=>redrawn(svg('<image href="#x"/>'))).toThrow(/растровое/);
  expect(()=>redrawn(svg('<use href="https://evil.example/x.svg#a"/>'))).toThrow(/ссылка не на элемент этого файла/);
  expect(()=>redrawn(svg('<rect fill="url(https://evil.example/p.png)"/>'))).toThrow(/url\(\) не на элемент/);
  expect(()=>redrawn(svg('<rect fill="url(data:image/png;base64,AAAA)"/>'))).toThrow(/встроенные данные/);
  // Ссылки внутри файла разрешены
  expect(redrawn(svg('<defs><linearGradient id="g"><stop stop-color="#fbbf24"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><rect width="9" height="9" fill="url(#g)"/><use href="#g"/>')).art.legacy).toBe(186);
 });
 it('цвет вне палитры: новая картинка отклоняется, унаследованная публикуется, список только сокращается',()=>{
  expect(()=>redrawn(svg('<circle r="9" fill="#fde68a" stroke="#ABCDEF"/>'))).toThrow(/art\/το-σπίτι.svg: цвета вне палитры #abcdef, #fde68a/);
  // Тот же файл в legacy.txt — публикуется и учтён в отчёте
  expect(brokenCopy(root=>writeFileSync(join(root,'art','το-σπίτι.svg'),svg('<circle r="9" fill="#fde68a"/>'))).art).toEqual({files:194,legacy:187});
  // Унаследованный файл, который уже в палитре, просят убрать из списка
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'art','το-σπίτι.svg'),svg('<circle r="9" fill="#2563eb"/>')))).toThrow(/уже в палитре — уберите его из art\/legacy.txt/);
  // Имя без файла — мусор в списке
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'art','legacy.txt'),legacyText+'нет.svg\n'))).toThrow(/файла art\/нет.svg нет — уберите имя из списка/);
  // Остальные проверки действуют и для унаследованных файлов
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'art','το-σπίτι.svg'),svg('<text>дом</text>')))).toThrow(/выдаёт ответ/);
  // Новое слово со своей картинкой вне палитры не спрятать: его нет в списке
  expect(()=>brokenCopy(root=>{
   writeFileSync(join(root,'art','το-δοκίμιο.svg'),svg('<circle r="9" fill="#123456"/>'));
   writeFileSync(join(root,'words','το-δοκίμιο.yaml'),'greek: το δοκίμιο\nrussian: очерк\nimage: το-δοκίμιο.svg\n');
   writeFileSync(join(root,'lessons','lesson-1-4.yaml'),readFileSync('content/lessons/lesson-1-4.yaml','utf8')+'  - το-δοκίμιο\n');
  })).toThrow(/art\/το-δοκίμιο.svg: цвета вне палитры #123456/);
  expect(house).toContain('image: το-σπίτι.svg');
 });
});
