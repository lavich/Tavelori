import {cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {checkArt, colorsOf, foreignColors, PALETTE, paletteColors, parseLegacy} from '../content/art';
import {buildContent, revisionOf, wordsOf} from '../content/build';
import {REFERENCE_SETS, writeArtSheets, writeReferenceSheet} from '../content/art-sheet';
import {ContentError, parseCatalog, parsePackage, SCHEMA_VERSION} from '../src/content/schema';
import {wordKey} from '../src/domain/import';
import {stressNote} from '../src/domain/phonetics';
import {tiles} from '../src/domain/syllables';
import {applyPalette} from '../src/shared/store';

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
const house=readFileSync('content/words/το-σπίτι.yaml','utf8');
const legacyText=readFileSync('content/art/legacy.txt','utf8');

/** Копия исходников, в которой можно сломать один файл и проверить отказ публикации. */
function brokenCopy(mutate:(root:string)=>void){
 const root=mkdtempSync(join(tmpdir(),'lexi-content-'));
 for(const dir of ['words','lessons','art','courses'])cpSync(join('content',dir),join(root,dir),{recursive:true});
 mutate(root);
 try{return buildContent(root)}finally{rmSync(root,{recursive:true,force:true})}
}

describe('исходные наборы 1.1 и 1.2 точно соответствуют seed-lessons.md',()=>{
 it.each([['Урок 1.1','lesson-1-1',33],['Урок 1.2','lesson-1-2',30]] as const)('%s',(title,lessonId,count)=>{
  const expected=rows(title);
  const words=wordsOf(content,lessonId);
  expect(expected).toHaveLength(count);
  expect(words.map(w=>[w.greek,w.russian])).toEqual(expected);
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
   expect(word.id).toMatch(/^w\d{2}-\d{2}$/);
  }
 });

 it('множественное число живёт в заметке, а не в самом слове',()=>{
  const year=seedWords.find(word=>word.russian==='год')!;
  expect(year.greek).toBe('ο χρόνος');
  expect(year.note).toContain('τα χρόνια');
  expect(tiles(year.greek)).toEqual(['ο','χρό','νος']);
 });
 /** Полумеры недопустимы: карточка либо готова к занятию целиком, либо честно помечена непроверенной. */
 it('карточка подготовлена целиком или не претендует на подготовленность',()=>{
  for(const word of seedWords){
   if(word.verified){
    expect(word.ipa,word.greek).toMatch(/^\/.+\/$/);
    expect(word.examples.length,word.greek).toBeGreaterThan(0);
    expect(word.imageAssetId,word.greek).toBe(`img-${content.sources.words.get(word.id)!.image!.replace(/\.svg$/,'')}`);
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
  expect(catalog.lessons.map(l=>[l.id,l.wordCount,l.media.count])).toEqual([['lesson-1-1',33,33],['lesson-1-2',30,30],['lesson-1-3',35,35],['lesson-1-4',35,35],['lesson-2-1',36,36],['lesson-2-2',33,33]]);
  const text=fileOf('content/catalog.json').body as string;
  expect(text).not.toContain('σπίτι');
  expect(text).not.toContain('<svg');
  expect(text.length).toBeLessThan(2000);
  for(const entry of catalog.lessons){
   expect(entry.url).toBe(`content/packages/${entry.id}@${entry.version}.json`);
   expect(entry.bytes).toBe(Buffer.byteLength(fileOf(entry.url).body as string));
   expect(entry.language).toBe('el');
  }
  expect(catalog.courses[0].palette).toBeUndefined();
 });
 it('тема курса проверяется и разворачивается в карту цветов каталога',()=>{
  const themed=brokenCopy(root=>{
   mkdirSync(join(root,'art','themes'));
   writeFileSync(join(root,'art','themes','aegean.json'),JSON.stringify({colors:{sky:'#fff1e6',blue:'#c2410c'}}));
   writeFileSync(join(root,'courses','leeke.yaml'),readFileSync('content/courses/leeke.yaml','utf8').replace('source:', 'theme: aegean\nsource:'));
  });
  expect(themed.catalog.courses[0].palette).toEqual({'#e7eefb':'#fff1e6','#2563eb':'#c2410c'});
  expect(parseCatalog(themed.catalog).courses[0].palette).toEqual(themed.catalog.courses[0].palette);
  const fails=(theme:unknown,pattern:RegExp)=>expect(()=>brokenCopy(root=>{
   mkdirSync(join(root,'art','themes'));
   if(theme!==null)writeFileSync(join(root,'art','themes','bad.json'),JSON.stringify(theme));
   writeFileSync(join(root,'courses','leeke.yaml'),readFileSync('content/courses/leeke.yaml','utf8').replace('source:', 'theme: bad\nsource:'));
  })).toThrow(pattern);
  fails(null,/темы «bad» нет/);
  fails({colors:{violet:'#123456'}},/тема «bad».*роли «violet» нет/);
  fails({colors:{red:'#123456'}},/тема «bad».*роль «red» предметная/);
  fails({colors:{sky:'white'}},/тема «bad».*роли «sky».*#rrggbb/);
 });
 it('подмена темы меняет только полные тематические hex и не задевает ссылки и предметные цвета',()=>{
  const svg='<svg><defs><linearGradient id="g"/></defs><path fill="#e7eefb" stroke="#EF4444" style="color:#2563eb"/><use href="#g" fill="url(#g)"/></svg>';
  expect(applyPalette(svg,{'#e7eefb':'#fff1e6','#2563eb':'#c2410c'})).toBe('<svg><defs><linearGradient id="g"/></defs><path fill="#fff1e6" stroke="#EF4444" style="color:#c2410c"/><use href="#g" fill="url(#g)"/></svg>');
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
  expect(()=>brokenCopy(root=>{
   writeFileSync(join(root,'words','дубль.yaml'),house.replace('id: w12-16','id: w99-01'));
   writeFileSync(join(root,'lessons','lesson-1-2.yaml'),readFileSync('content/lessons/lesson-1-2.yaml','utf8').replace('- w12-16','- w99-01'));
  })).toThrow(/повторяет слово «το σπίτι — дом»/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'words','дубль.yaml'),house))).toThrow(/идентификатор «w12-16» уже занят/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'lessons','lesson-1-2.yaml'),readFileSync('content/lessons/lesson-1-2.yaml','utf8').replace('- w12-16','- w12-99'))))
   .toThrow(/слова w12-99 нет/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'words','το-τεστ.yaml'),'greek: το τεστ\nrussian: тест\n'))).toThrow(/не входит ни в один урок/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'art','house.svg'),'<svg xmlns="http://www.w3.org/2000/svg"><text>дом</text></svg>'))).toThrow(/выдаёт ответ/);
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'words','το-σπίτι.yaml'),house.replace('image: house.svg','image: нет.svg')))).toThrow(/файла art\/нет.svg нет/);
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
  expect(()=>parseCatalog({schemaVersion:1,generatedAt:'x',lessons:[{id:'a'}]})).toThrow(/ожидалась строка/);
 });
});

describe('карточка каждого подготовленного слова готова',()=>{
 it('у всех 189 слов есть IPA с ударением и распознанный ударный слог',()=>{
  expect(prepared).toHaveLength(189);
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
   const image=content.sources.words.get(word.id)!.image!;
   expect(image,word.greek).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.svg$/);
   expect(word.imageAssetId).toBe(`img-${image.replace(/\.svg$/,'')}`);
  }
 });
 /** Иллюстрация не принадлежит слову: имя английское, медиа по файлу, подпись пуста. */
 it('имя файла иллюстрации — латиница kebab-case, а медиа образуется по файлу',()=>{
  for(const item of packageOf('lesson-1-2').media)expect(item.alt,item.id).toBe('');
  const badName=(name:string)=>brokenCopy(root=>{
   writeFileSync(join(root,'art',name),readFileSync('content/art/house.svg'));
   writeFileSync(join(root,'words','το-σπίτι.yaml'),house.replace('image: house.svg',`image: ${name}`));
   writeFileSync(join(root,'art','legacy.txt'),legacyText.replace('house.svg\n',`${name}\n`));
  });
  expect(()=>badName('το-σπίτι.svg')).toThrow(/имя иллюстрации «το-σπίτι.svg» — латиница строчными/);
  expect(()=>badName('Home.svg')).toThrow(/имя иллюстрации «Home.svg»/);
  expect(()=>badName('my_house.svg')).toThrow(/имя иллюстрации «my_house.svg»/);
  // Два слова с общим файлом: один идентификатор, одна запись медиа в пакете, файл учтён один раз
  const shared=brokenCopy(root=>{
   writeFileSync(join(root,'words','το-δοκίμιο.yaml'),'greek: το δοκίμιο\nrussian: очерк\nimage: house.svg\n');
   writeFileSync(join(root,'lessons','lesson-1-2.yaml'),readFileSync('content/lessons/lesson-1-2.yaml','utf8')+'  - το-δοκίμιο\n');
  });
  const essay=shared.words.find(word=>word.id==='το-δοκίμιο')!, home=shared.words.find(word=>word.greek==='το σπίτι')!;
  expect(essay.imageAssetId).toBe('img-house');
  expect(essay.imageAssetId).toBe(home.imageAssetId);
  expect(shared.packages.find(p=>p.id==='lesson-1-2')!.media.filter(item=>item.id==='img-house')).toHaveLength(1);
  expect(shared.art).toEqual(content.art);
  // Побайтовая копия — ошибка с обоими именами
  expect(()=>brokenCopy(root=>{
   writeFileSync(join(root,'art','home.svg'),readFileSync('content/art/house.svg'));
   writeFileSync(join(root,'art','legacy.txt'),legacyText+'home.svg\n');
  })).toThrow(/art\/home.svg и art\/house.svg совпадают побайтно — оставьте один файл/);
 });
 /** Лист — рабочий инструмент миграции: легенда палитры сверху, файлы вне палитры выделены рамкой с перечнем чужих цветов. */
 it('собирает лист для визуальной проверки с легендой палитры и подсветкой файлов вне палитры',()=>{
  const sheet=writeArtSheets(process.cwd(),process.env.ART_BASE??'main');
  expect(sheet.full.match(/<figure/g)).toHaveLength(196);
  expect(sheet.full).toContain('<figcaption>house</figcaption>');
  expect(sheet.full).toContain('title="дом"');
  for(const label of sheet.full.matchAll(/<figcaption>([^<]+)/g))expect(label[1]).toMatch(/^[a-z0-9 ]+(?: · было)?$/);
  expect(prepared).toHaveLength(189);
 });
 it('лист изменений показывает добавление, правку и переименование, а без git полный лист всё равно собирается',()=>{
  const root=mkdtempSync(join(tmpdir(),'lexi-art-sheet-'));
  try{
   cpSync('content',join(root,'content'),{recursive:true}); mkdirSync(join(root,'docs'));
   execFileSync('git',['init','-q'],{cwd:root}); execFileSync('git',['config','user.email','test@example.com'],{cwd:root}); execFileSync('git',['config','user.name','Test'],{cwd:root});
   execFileSync('git',['add','content'],{cwd:root}); execFileSync('git',['commit','-qm','base'],{cwd:root});
   execFileSync('git',['mv','content/art/house.svg','content/art/home.svg'],{cwd:root});
   writeFileSync(join(root,'content/art/apple.svg'),readFileSync(join(root,'content/art/apple.svg'),'utf8')+'\n');
   writeFileSync(join(root,'content/art/new.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><rect width="320" height="220" fill="#e7eefb"/></svg>');
   mkdirSync(join(root,'content/art/themes'));
   writeFileSync(join(root,'content/art/themes/aegean.json'),JSON.stringify({colors:{sky:'#fff1e6',blue:'#c2410c'}}));
   const result=writeArtSheets(root,'HEAD');
   expect(result.changes).toContain('new');
   expect(result.changes).toContain('home');
   expect(result.changes!.match(/· было/g)?.length).toBeGreaterThanOrEqual(2);
   expect(result.full).toContain('<select id="theme">');
   expect(result.full).toContain('<template id="theme-aegean">');
   expect(result.full).toContain('#fff1e6');
   expect(result.full).toContain('#ef4444');
   const plain=mkdtempSync(join(tmpdir(),'lexi-art-no-git-'));
   try{
    mkdirSync(join(plain,'docs')); cpSync(join(root,'content'),join(plain,'content'),{recursive:true});
    const fallback=writeArtSheets(plain,'HEAD');
    expect(fallback.full).toContain('<figcaption>home');
    expect(fallback.note).toMatch(/Лист изменений пропущен/);
   }finally{rmSync(plain,{recursive:true,force:true})}
  }finally{rmSync(root,{recursive:true,force:true})}
 });
});

/** Библиотека общих частей: эталоны повторяющихся фигур, из которых они копируются в новые картинки. */
const PARTS='content/art/parts';
const partFiles=()=>readdirSync(PARTS).filter(file=>file.endsWith('.svg')).sort();

describe('библиотека общих частей',()=>{
 it('семь эталонов проходят стандарт без поблажек для унаследованных файлов',()=>{
  expect(partFiles()).toEqual(['cloud.svg','face.svg','house.svg','person.svg','sun.svg','table.svg','tree.svg']);
  for(const file of partFiles()){
   const body=readFileSync(join(PARTS,file));
   expect(checkArt(`parts/${file}`,body,new Set()),file).toBe(false);
   expect(Buffer.from(body).toString('utf8'),file).toContain(`<g id="${file.replace('.svg','')}"`);
  }
 });
 it('подпапка не роняет публикацию и не становится медиа',()=>{
  // Одноимённая картинка слова (cloud.svg) — другой файл: в медиа уходят байты из art/, а не из art/parts/
  const published=new Set(content.files.filter(file=>file.path.startsWith('content/media/')).map(file=>Buffer.from(file.body).toString('utf8')));
  for(const file of partFiles())expect(published.has(readFileSync(join(PARTS,file),'utf8')),file).toBe(false);
  expect([...content.sources.files.keys()].some(path=>path.startsWith('art/parts'))).toBe(false);
  // Стандарт для частей строже: файл вне палитры в parts/ — ошибка теста, а не миграция
  expect(()=>checkArt('parts/x.svg',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><rect width="320" height="220" fill="#e7eefb"/><circle r="9" fill="#123456"/></svg>'),new Set())).toThrow(/цвета вне палитры #123456/);
 });
});

describe('визуальный норматив и законченные эталоны',()=>{
 it('STYLE.md закрепляет параметры валидатора и тематические роли палитры',()=>{
  const style=readFileSync('STYLE.md','utf8');
  expect(style).toContain('Canvas:       320 × 220');
  expect(style).toContain('Safe area:    20 units');
  expect(style).toContain('Main stroke:  7–9 units');
  expect(style).toContain(`Max size:     ${PALETTE.maxBytes} bytes`);
  expect(style).toContain('Linecap:      round');
  expect(style).toContain('Linejoin:     round');
  expect(style).toContain('recognizable at 64 px');
  for(const role of PALETTE.themeable)expect(style,role).toContain(`\`${role}\``);
  expect(readFileSync('docs/art-standard.md','utf8')).toContain('[`STYLE.md`](../STYLE.md)');
 });
 it('три набора содержат ровно 15 эталонов, которые проходят стандарт без legacy',()=>{
  expect(Object.keys(REFERENCE_SETS)).toEqual(['objects','characters','actions']);
  expect(Object.values(REFERENCE_SETS).flat()).toHaveLength(15);
  for(const [category,expected] of Object.entries(REFERENCE_SETS)){
   const dir=join('content/art/references',category);
   expect(readdirSync(dir).filter(file=>file.endsWith('.svg')).sort()).toEqual([...expected].sort());
   for(const file of expected){
    const body=readFileSync(join(dir,file));
    expect(checkArt(`references/${category}/${file}`,body,new Set()),`${category}/${file}`).toBe(false);
    expect(body.toString(),file).toContain(`<g id="${file.replace('.svg','')}"`);
   }
  }
  expect([...content.sources.files.keys()].some(path=>path.startsWith('art/references'))).toBe(false);
  const published=new Set(content.files.filter(file=>file.path.startsWith('content/media/')).map(file=>Buffer.from(file.body).toString('utf8')));
  for(const [category,files] of Object.entries(REFERENCE_SETS))for(const file of files)
   expect(published.has(readFileSync(join('content/art/references',category,file),'utf8')),`${category}/${file}`).toBe(false);
  const cat=readFileSync('content/art/references/characters/cat.svg','utf8');
  for(const group of ['background','cat','tail','body','head','ears','face'])expect(cat).toContain(`<g id="${group}"`);
 });
 it('обзорный лист содержит три секции по пять карточек и миниатюры 64 px',()=>{
  const html=writeReferenceSheet();
  expect(html.match(/<section>/g)).toHaveLength(3);
  expect(html.match(/<figure data-category=/g)).toHaveLength(15);
  expect(html.match(/class="small"/g)).toHaveLength(15);
  expect(html).toContain('width:64px');
  for(const name of Object.values(REFERENCE_SETS).flat())expect(html).toContain(`<figcaption>${name.replace('.svg','')}</figcaption>`);
 });
});

/** Стандарт иллюстраций (docs/art-standard.md): палитра — данные, проверки — в публикации, старые файлы — в legacy.txt. */
describe('иллюстрации подчиняются стандарту',()=>{
 const legacy=parseLegacy(legacyText);
 const svg=(inner:string,attrs='viewBox="0 0 320 220"')=>`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect width="320" height="220" fill="#e7eefb"/>${inner}</svg>`;
 /** Копия, в которой house.svg перерисован заново и больше не числится унаследованным. */
 const redrawn=(art:string)=>brokenCopy(root=>{
  writeFileSync(join(root,'art','house.svg'),art);
  writeFileSync(join(root,'art','legacy.txt'),legacyText.replace('house.svg\n',''));
 });
 it('палитра — единственный источник: документ перечисляет те же цвета',()=>{
  const doc=readFileSync('docs/art-standard.md','utf8');
  const section=doc.split('\n## Палитра')[1].split('\n## ')[0];
  expect(new Set(section.match(/#[0-9a-f]{6}/g))).toEqual(paletteColors());
  expect(paletteColors().size).toBeGreaterThanOrEqual(12);
  expect(paletteColors().size).toBeLessThanOrEqual(20);
  for(const hex of paletteColors())expect(hex).toMatch(/^#[0-9a-f]{6}$/);
 });
 it('тематические роли перечислены в палитре и помечены в документе колонкой «Тема»',()=>{
  const names=new Set([...Object.keys(PALETTE.backgrounds),...Object.keys(PALETTE.colors)]);
  for(const role of PALETTE.themeable)expect(names.has(role),role).toBe(true);
  expect(PALETTE.themeable).toContain('blue');
  expect(PALETTE.themeable).not.toContain('blue-soft');
  const doc=readFileSync('docs/art-standard.md','utf8');
  const section=doc.split('\n## Палитра')[1].split('\n## ')[0];
  const marked=[...section.matchAll(/^\| `([a-z-]+)` \| `#[0-9a-f]{6}` \| (да|—) \|/gm)].filter(m=>m[2]==='да').map(m=>m[1]);
  expect(new Set(marked)).toEqual(new Set(PALETTE.themeable));
 });
 it('цвета читаются из атрибутов и style, запись нормализуется',()=>{
  expect(colorsOf('<path fill="#FFF" stroke=\'#2563EB\' style="stop-color: #e7eefb; fill:none"/><stop stop-color="currentColor"/>'))
   .toEqual(new Set(['#ffffff','#2563eb','#e7eefb','none','currentcolor']));
  expect(foreignColors('<path fill="none" stroke="#2563eb" opacity="0.5" style="fill:#abcdef"/>')).toEqual(['#abcdef']);
  expect(foreignColors('<path fill="#2563eb80"/>')).toEqual(['#2563eb80']);
 });
 it('текущий контент: 189 иллюстраций, 187 из них вне палитры и все в legacy.txt',()=>{
  expect(content.art).toEqual({files:189,legacy:187});
  for(const word of prepared){
   const file=content.sources.words.get(word.id)!.image!;
   expect(legacy.has(file),file).toBe(foreignColors(seedArt(word.id)).length>0);
  }
  // Список только сокращается: новую картинку в него не добавить, не подняв этот потолок в ревью.
  expect(legacy.size).toBeLessThanOrEqual(187);
 });
 it('новая картинка в палитре публикуется, служебные значения и прозрачность допустимы',()=>{
  const built=redrawn(svg('<path d="M10 10h20" fill="none" stroke="currentColor"/><circle cx="160" cy="110" r="40" fill="#2563EB" opacity="0.5"/><rect x="1" y="1" width="9" height="9" style="fill:#fbbf24;stroke:#1f2937"/>'));
  expect(built.art).toEqual({files:189,legacy:186});
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
  expect(()=>redrawn(svg('<circle r="9" fill="#fde68a" stroke="#ABCDEF"/>'))).toThrow(/art\/house.svg: цвета вне палитры #abcdef, #fde68a/);
  // Тот же файл в legacy.txt — публикуется и учтён в отчёте
  expect(brokenCopy(root=>writeFileSync(join(root,'art','house.svg'),svg('<circle r="9" fill="#fde68a"/>'))).art).toEqual({files:189,legacy:187});
  // Унаследованный файл, который уже в палитре, просят убрать из списка
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'art','house.svg'),svg('<circle r="9" fill="#2563eb"/>')))).toThrow(/уже в палитре — уберите его из art\/legacy.txt/);
  // Имя без файла — мусор в списке
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'art','legacy.txt'),legacyText+'нет.svg\n'))).toThrow(/файла art\/нет.svg нет — уберите имя из списка/);
  // Остальные проверки действуют и для унаследованных файлов
  expect(()=>brokenCopy(root=>writeFileSync(join(root,'art','house.svg'),svg('<text>дом</text>')))).toThrow(/выдаёт ответ/);
  // Новое слово со своей картинкой вне палитры не спрятать: его нет в списке
  expect(()=>brokenCopy(root=>{
   writeFileSync(join(root,'art','essay.svg'),svg('<circle r="9" fill="#123456"/>'));
   writeFileSync(join(root,'words','το-δοκίμιο.yaml'),'greek: το δοκίμιο\nrussian: очерк\nimage: essay.svg\n');
   writeFileSync(join(root,'lessons','lesson-1-4.yaml'),readFileSync('content/lessons/lesson-1-4.yaml','utf8')+'  - το-δοκίμιο\n');
  })).toThrow(/art\/essay.svg: цвета вне палитры #123456/);
  expect(house).toContain('image: house.svg');
 });
});
