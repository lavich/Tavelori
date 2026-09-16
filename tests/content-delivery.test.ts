import 'fake-indexeddb/auto';
import {beforeEach, describe, expect, it} from 'vitest';
import {LexiDatabase} from '../src/storage/db';
import {applyPackage, coursePhase, downloadLessonMedia, ensureAsset, installCourse, installLesson, lessonReadiness, mergeWord, refreshCatalog, setCourseSubscription, syncCourses} from '../src/content/client';
import {ContentError, type ContentPackage} from '../src/content/schema';
import {revisionOf} from '../content/build';
import {deleteWord, removeFromLesson, saveWord} from '../src/storage/ops';
import {lessonLinks} from '../src/storage/queries';
import {content, installLessons, memoryFetcher, packageOf} from './helpers/content';

let db:LexiDatabase;
beforeEach(async()=>{
 await new LexiDatabase('lexi-content').delete();
 db=new LexiDatabase('lexi-content');
 await db.open();
});
const entry=(id:string)=>content.catalog.lessons.find(l=>l.id===id)!;
/** Новая версия пакета: изменённые слова получают новую ревизию, как это сделал бы генератор. */
function bump(pack:ContentPackage,change:(words:ContentPackage['words'])=>void):ContentPackage{
 const words=pack.words.map(word=>({...word}));
 change(words);
 return {...pack,version:`${pack.version}-next`,words:words.map(word=>({...word,revision:revisionOf(word)}))};
}
function withUpdate(id:string,next:ContentPackage){
 const url=`content/packages/${id}@${next.version}.json`;
 const catalog={...content.catalog,lessons:content.catalog.lessons.map(l=>l.id===id?{...l,version:next.version,url}:l)};
 return memoryFetcher(content,{'content/catalog.json':catalog,[url]:next});
}
/** Каталог уже знает о новой версии: так выглядит обновление после фонового refreshCatalog. */
async function upgrade(id:string,next:ContentPackage){const fetcher=withUpdate(id,next);await refreshCatalog(db,fetcher);return fetcher}

describe('курсы',()=>{
 it('установка запоминает курс урока и в уроке, и в пакете',async()=>{
  await installLessons(db,['lesson-2-1']);
  expect((await db.lessons.get('lesson-2-1'))!.courseId).toBe('leeke');
  expect((await db.packages.get('lesson-2-1'))!.courseId).toBe('leeke');
 });
 it('обновление проставляет курс уроку, установленному без него',async()=>{
  await installLessons(db,['lesson-1-2']);
  await db.lessons.update('lesson-1-2',{courseId:undefined}); // база после перехода на курсы
  await applyPackage(packageOf('lesson-1-2'),db);
  expect((await db.lessons.get('lesson-1-2'))!.courseId).toBe('leeke');
 });
 it('обновление каталога заводит курсы и подписывает тот, чьи уроки уже стоят',async()=>{
  await installLessons(db,['lesson-1-1']);
  await db.lessons.update('lesson-1-1',{courseId:undefined});
  await db.courses.clear();
  await refreshCatalog(db,memoryFetcher());
  expect((await db.lessons.get('lesson-1-1'))!.courseId).toBe('leeke');
  expect(await db.courses.get('leeke')).toMatchObject({title:'LEEKE A2',origin:'content',subscribed:true});
 });
 it('курс без установленных уроков остаётся неподписанным, а повторное обновление ничего не ломает',async()=>{
  await refreshCatalog(db,memoryFetcher());
  expect(await db.courses.get('leeke')).toMatchObject({subscribed:false});
  const first=await db.courses.get('leeke');
  await refreshCatalog(db,memoryFetcher());
  expect(await db.courses.count()).toBe(1);
  expect((await db.courses.get('leeke'))!.createdAt).toBe(first!.createdAt);
 });
});

describe('подписка на курс',()=>{
 const packs=(fetcher:{requests:string[]})=>fetcher.requests.filter(url=>url.includes('/packages/'));
 const media=(fetcher:{requests:string[]})=>fetcher.requests.filter(url=>url.includes('/media/'));
 it('открытие урока подписывает его курс',async()=>{
  const fetcher=memoryFetcher();
  await refreshCatalog(db,fetcher);
  expect(await db.courses.get('leeke')).toMatchObject({subscribed:false});
  await installLesson('lesson-2-1',db,fetcher);
  expect(await db.courses.get('leeke')).toMatchObject({subscribed:true});
 });
 it('«Учить курс» ставит все уроки курса и не трогает медиа',async()=>{
  const fetcher=memoryFetcher();
  await refreshCatalog(db,fetcher);
  const result=await installCourse('leeke',db,fetcher);
  expect(result.installed).toBe(content.catalog.lessons.length);
  expect(await db.packages.count()).toBe(content.catalog.lessons.length);
  expect(media(fetcher)).toEqual([]);
  expect(await db.courses.get('leeke')).toMatchObject({subscribed:true});
 });
 it('подписанный курс сам доустанавливает недостающее и подтягивает версию',async()=>{
  const first=memoryFetcher();
  await refreshCatalog(db,first);
  await installLesson('lesson-1-1',db,first);
  const next=bump(packageOf('lesson-1-1'),words=>{words[0].russian='новый перевод'});
  const fetcher=await upgrade('lesson-1-1',next);
  fetcher.requests.length=0;
  await syncCourses(db,fetcher);
  expect(await db.packages.count()).toBe(content.catalog.lessons.length);
  expect((await db.packages.get('lesson-1-1'))!.version).toBe(next.version);
  expect(media(fetcher)).toEqual([]);
 });
 it('неподписанный курс сам не качается',async()=>{
  const fetcher=memoryFetcher();
  await refreshCatalog(db,fetcher);
  fetcher.requests.length=0;
  await syncCourses(db,fetcher);
  expect(packs(fetcher)).toEqual([]);
  expect(await db.packages.count()).toBe(0);
 });
 it('отписка прекращает автозагрузку и ничего не удаляет',async()=>{
  const fetcher=memoryFetcher();
  await refreshCatalog(db,fetcher);
  await installLesson('lesson-1-1',db,fetcher);
  await setCourseSubscription('leeke',false,db);
  fetcher.requests.length=0;
  await syncCourses(db,fetcher);
  expect(packs(fetcher)).toEqual([]);
  expect(await db.packages.count()).toBe(1); // установленное осталось
 });
 it('ошибка сети оставляет прежние версии и сообщается на уровне курса',async()=>{
  const ok=memoryFetcher();
  await refreshCatalog(db,ok);
  await installLesson('lesson-1-1',db,ok);
  const broken=memoryFetcher();
  broken.json=async url=>{if(url.includes('/packages/'))throw new ContentError('Нет сети','network');return content.catalog};
  await syncCourses(db,broken);
  expect(await db.packages.count()).toBe(1);
  expect(coursePhase('leeke')).toMatchObject({phase:'error',kind:'network'});
  await syncCourses(db,memoryFetcher());
  expect(coursePhase('leeke')).toEqual({phase:'idle'});
  expect(await db.packages.count()).toBe(content.catalog.lessons.length);
 });
});

describe('каталог',()=>{
 it('запуск читает только каталог: ни одного пакета и медиа',async()=>{
  const fetcher=memoryFetcher();
  await refreshCatalog(db,fetcher);
  expect(fetcher.requests).toEqual(['content/catalog.json']);
  expect(await db.catalog.count()).toBe(content.catalog.lessons.length);
  expect(await db.words.count()).toBe(0);
  expect(await db.packages.count()).toBe(0);
 });
 it('ошибка сети оставляет прежний каталог и установленные уроки',async()=>{
  await installLessons(db,['lesson-1-2']);
  const broken=memoryFetcher(content,{'content/catalog.json':undefined});
  broken.json=async()=>{throw new ContentError('Нет сети','network')};
  await expect(refreshCatalog(db,broken)).rejects.toThrow('Нет сети');
  expect(await db.catalog.count()).toBe(content.catalog.lessons.length);
  expect(await db.words.count()).toBe(30);
 });
 it('каталог неподдерживаемой схемы отклоняется без изменения кеша',async()=>{
  await refreshCatalog(db,memoryFetcher());
  await expect(refreshCatalog(db,memoryFetcher(content,{'content/catalog.json':{...content.catalog,schemaVersion:2}}))).rejects.toMatchObject({kind:'unsupported'});
  expect(await db.catalog.count()).toBe(content.catalog.lessons.length);
 });
});

describe('установка урока',()=>{
 it('открытие урока загружает только его пакет и сохраняет слова со связями по порядку',async()=>{
  const fetcher=memoryFetcher();
  await refreshCatalog(db,fetcher);
  const result=await installLesson('lesson-1-2',db,fetcher);
  expect(result).toMatchObject({status:'installed',added:30,conflicts:[]});
  expect(fetcher.requests).toEqual(['content/catalog.json',entry('lesson-1-2').url]);
  expect(await db.words.count()).toBe(30);
  expect((await lessonLinks('lesson-1-2',db)).map(l=>l.wordId)).toEqual(packageOf('lesson-1-2').links.map(l=>l.wordId));
  expect(await db.lessons.get('lesson-1-2')).toMatchObject({title:'Урок 1.2',targetDate:'2026-09-18',status:'upcoming'});
  expect(await db.assets.count()).toBe(0); // медиа не скачиваются вместе с пакетом
  expect(await db.media.count()).toBe(30);
  const word=(await db.words.get('w12-16'))!;
  expect(word).toMatchObject({greek:'το σπίτι',revision:packageOf('lesson-1-2').words.find(w=>w.id==='w12-16')!.revision});
  expect(word.tokens).toContain('σπιτι');
 });
 it('пакеты 1.1 и 1.2 дают 63 слова и проведённый урок без даты',async()=>{
  await installLessons(db,['lesson-1-1','lesson-1-2']);
  expect(await db.words.count()).toBe(63);
  expect(await db.lessons.get('lesson-1-1')).toMatchObject({status:'completed',targetDate:null});
  expect(await db.events.count()).toBe(0);
  expect(await db.states.count()).toBe(0);
 });
 it('общее слово двух уроков — одна запись и две связи',async()=>{
  await installLessons(db,['lesson-1-2','lesson-1-3']);
  expect((await db.words.where('greek').equals('το σπίτι').toArray())).toHaveLength(1);
  expect(await db.lessonWords.where('wordId').equals('w12-16').count()).toBe(2);
  expect(await db.words.count()).toBe(30+35-1);
 });
 it('одновременные запросы одного пакета объединяются, повторная установка ничего не дублирует',async()=>{
  const fetcher=memoryFetcher();
  await refreshCatalog(db,fetcher);
  const [a,b]=await Promise.all([installLesson('lesson-1-1',db,fetcher),installLesson('lesson-1-1',db,fetcher)]);
  expect(a).toBe(b);
  expect(fetcher.requests.filter(url=>url.includes('lesson-1-1'))).toHaveLength(1);
  expect(await installLesson('lesson-1-1',db,fetcher)).toMatchObject({status:'current'});
  expect(await db.words.count()).toBe(33);
  expect(await db.lessonWords.count()).toBe(33);
  expect(await db.packages.count()).toBe(1);
 });
 it('повреждённый, чужой и несовместимый пакет отклоняются без частичного урока',async()=>{
  const url=entry('lesson-1-1').url;
  const pack=packageOf('lesson-1-1');
  for(const [bad,pattern] of [
   [{...pack,schemaVersion:99},/не поддерживается/],
   [{...pack,words:pack.words.slice(1)},/которого нет в пакете/],
   [{...pack,version:'другая'},/не соответствует записи каталога/],
   [42,/ожидался объект/],
  ] as const){
   const fetcher=memoryFetcher(content,{[url]:bad});
   await refreshCatalog(db,fetcher);
   await expect(installLesson('lesson-1-1',db,fetcher)).rejects.toThrow(pattern);
   expect(await db.words.count()).toBe(0);
   expect(await db.lessonWords.count()).toBe(0);
   expect(await db.packages.count()).toBe(0);
   expect(await db.lessons.count()).toBe(0);
  }
 });
 it('ошибка записи откатывает слова, связи и версию целиком, прежняя установка сохраняется',async()=>{
  await installLessons(db,['lesson-1-2']);
  const before=await db.packages.get('lesson-1-2');
  const next=bump(packageOf('lesson-1-2'),words=>{words[0].russian='иначе'});
  const fail=()=>{throw Object.assign(new Error('QuotaExceededError'),{name:'QuotaExceededError'})};
  db.packages.hook('updating',fail);
  await expect(installLesson('lesson-1-2',db,await upgrade('lesson-1-2',next))).rejects.toMatchObject({kind:'storage'});
  db.packages.hook('updating').unsubscribe(fail);
  expect(await db.packages.get('lesson-1-2')).toEqual(before);
  expect((await db.words.get(next.words[0].id))!.russian).not.toBe('иначе');
 });
 it('без сети неустановленный урок даёт понятную ошибку сети, а установленные продолжают работать',async()=>{
  const fetcher=await installLessons(db,['lesson-1-1']);
  fetcher.json=async url=>{if(url.endsWith('catalog.json'))return content.catalog;throw new ContentError('Нет сети: пакет урока ещё не загружен на это устройство.','network')};
  await expect(installLesson('lesson-1-2',db,fetcher)).rejects.toMatchObject({kind:'network'});
  expect(await db.words.count()).toBe(33);
  expect(await db.lessons.count()).toBe(1);
 });
});

describe('обновление пакета',()=>{
 it('нетронутое слово обновляется, ID и прогресс сохраняются',async()=>{
  const fetcher=await installLessons(db,['lesson-1-2']);
  await db.states.add({wordId:'w12-16',card:{due:new Date('2026-09-20')} as never,introducedAt:'2026-09-10T00:00:00Z',version:3});
  const next=bump(packageOf('lesson-1-2'),words=>{words.find(w=>w.id==='w12-16')!.russian='дом, жилище'});
  const result=await installLesson('lesson-1-2',db,await upgrade('lesson-1-2',next));
  expect(result).toMatchObject({status:'updated',added:0,changed:1,conflicts:[]});
  expect(fetcher.requests.filter(url=>url.includes('media'))).toHaveLength(0);
  const updated=(await db.words.get('w12-16'))!;
  expect(updated.russian).toBe('дом, жилище');
  expect(updated.edited).toBeUndefined();
  expect((await db.states.get('w12-16'))!.version).toBe(3);
  expect((await db.packages.get('lesson-1-2'))!.version).toBe(next.version);
 });
 it('локальная правка сохраняется, изменившееся в пакете поле сообщается как конфликт, остальные поля обновляются',async()=>{
  await installLessons(db,['lesson-1-2']);
  const local=(await db.words.get('w12-16'))!;
  await saveWord({...local,russian:'дом (моя правка)'},db);
  const next=bump(packageOf('lesson-1-2'),words=>{const w=words.find(w=>w.id==='w12-16')!;w.russian='жилище';w.note='новая заметка'});
  const result=await installLesson('lesson-1-2',db,await upgrade('lesson-1-2',next));
  expect(result.conflicts).toEqual([{wordId:'w12-16',greek:'το σπίτι',fields:['russian']}]);
  expect(await db.words.get('w12-16')).toMatchObject({russian:'дом (моя правка)',note:'новая заметка',edited:true});
 });
 it('удалённое слово не воскресает и убранная связь не восстанавливается',async()=>{
  await installLessons(db,['lesson-1-2']);
  await deleteWord('w12-16',db);
  await removeFromLesson('lesson-1-2','w12-01',db);
  expect((await db.packages.get('lesson-1-2'))!.removed).toEqual(['w12-01']);
  const next=bump(packageOf('lesson-1-2'),words=>{words.find(w=>w.id==='w12-16')!.russian='жилище'});
  const result=await installLesson('lesson-1-2',db,await upgrade('lesson-1-2',next));
  expect((await db.words.get('w12-16'))!.deletedAt).toBeTruthy();
  expect(result.conflicts).toEqual([{wordId:'w12-16',greek:'το σπίτι',fields:['deleted']}]);
  expect(await db.lessonWords.get(['lesson-1-2','w12-01'])).toBeUndefined();
  expect(await db.lessonWords.count()).toBe(29);
  expect(await db.words.get('w12-01')).toBeTruthy(); // само слово остаётся
 });
 it('исчезновение слова из пакета не удаляет его из словаря, личные название и дата урока не перезаписываются',async()=>{
  await installLessons(db,['lesson-1-2']);
  await db.lessons.update('lesson-1-2',{title:'Мой урок',targetDate:'2026-10-01'});
  const pack=packageOf('lesson-1-2');
  const next:ContentPackage={...pack,version:'trimmed',lesson:{...pack.lesson,title:'Другое название'},words:pack.words.slice(1),links:pack.links.slice(1).map((l,i)=>({...l,position:i})),media:pack.media.slice(1)};
  await installLesson('lesson-1-2',db,await upgrade('lesson-1-2',next));
  expect(await db.words.get(pack.words[0].id)).toBeTruthy();
  expect(await db.lessonWords.get(['lesson-1-2',pack.words[0].id])).toBeTruthy();
  expect(await db.lessons.get('lesson-1-2')).toMatchObject({title:'Мой урок',targetDate:'2026-10-01'});
 });
 it('без базы (legacy) отредактированное слово сохраняется целиком, нетронутое — заменяется',async()=>{
  const pack=packageOf('lesson-1-2');
  const base=pack.words.find(w=>w.id==='w12-16')!;
  const next={...base,russian:'жилище',note:'заметка',revision:'x'};
  const local={...base,createdAt:'',updatedAt:'',edited:true};
  expect(mergeWord(local,undefined,next)).toMatchObject({conflicts:['russian','note'],word:{russian:'дом'}});
  expect(mergeWord({...local,edited:false},undefined,next).word).toMatchObject({russian:'жилище',note:'заметка'});
 });
 it('пакет с ревизией той же версии, установленный из другой вкладки, не применяется второй раз',async()=>{
  await installLessons(db,['lesson-1-1']);
  expect(await applyPackage(packageOf('lesson-1-1'),db)).toMatchObject({status:'current'});
 });
});

describe('медиа и готовность офлайн',()=>{
 it('картинка скачивается при первом обращении и потом читается из базы',async()=>{
  const fetcher=await installLessons(db,['lesson-1-2']);
  const before=fetcher.requests.length;
  const asset=await ensureAsset('img-w12-16',db,fetcher);
  expect(asset).toMatchObject({kind:'image',mimeType:'image/svg+xml'});
  expect(await asset!.blob.text()).toContain('<svg');
  await ensureAsset('img-w12-16',db,fetcher);
  expect(fetcher.requests.length).toBe(before+1);
  expect(await ensureAsset('img-нет',db,fetcher)).toBeNull();
 });
 it('слова доступны локально, но урок не готов офлайн, пока обязательное медиа не скачано; повтор докачивает',async()=>{
  const fetcher=await installLessons(db,['lesson-1-2']);
  expect(await lessonReadiness('lesson-1-2',db)).toMatchObject({installed:true,required:30,present:0,updateAvailable:false});
  const media=packageOf('lesson-1-2').media[0];
  const flaky=memoryFetcher(content,{[media.url]:new Blob(['<svg'],{type:'image/svg+xml'})}); // повреждённый файл
  const first=await downloadLessonMedia('lesson-1-2',db,flaky);
  expect(first).toMatchObject({fetched:29,failed:[media.id]});
  expect((await lessonReadiness('lesson-1-2',db)).missing).toEqual([media.id]);
  const second=await downloadLessonMedia('lesson-1-2',db,fetcher);
  expect(second).toEqual({fetched:1,failed:[]});
  expect((await lessonReadiness('lesson-1-2',db)).missing).toEqual([]);
  expect(await db.assets.count()).toBe(30);
 });
 it('нехватка места при сохранении медиа поднимает ошибку хранилища, а не ложный успех',async()=>{
  const fetcher=await installLessons(db,['lesson-1-2']);
  const fail=()=>{throw Object.assign(new Error('quota'),{name:'QuotaExceededError'})};
  db.assets.hook('creating',fail);
  await expect(downloadLessonMedia('lesson-1-2',db,fetcher)).rejects.toMatchObject({kind:'storage'});
  db.assets.hook('creating').unsubscribe(fail);
  expect(await db.assets.count()).toBe(0);
 });
 it('новая версия в каталоге показывается как доступное обновление, а не применяется сама',async()=>{
  await installLessons(db,['lesson-1-2']);
  const next=bump(packageOf('lesson-1-2'),words=>{words[0].russian='иначе'});
  await refreshCatalog(db,withUpdate('lesson-1-2',next));
  expect((await lessonReadiness('lesson-1-2',db)).updateAvailable).toBe(true);
  expect((await db.packages.get('lesson-1-2'))!.version).toBe(packageOf('lesson-1-2').version);
 });
});
