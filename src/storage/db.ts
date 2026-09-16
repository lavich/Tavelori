import Dexie, {type Table, type Transaction} from 'dexie';
import type {CatalogEntry} from '../content/schema';
import {normalize, wordKey} from '../domain/import';
import {defaultSettings, type Asset, type Course, type InstalledPackage, type LearningState, type Lesson, type LessonWord, type MediaRef, type ReviewEvent, type Session, type Settings, type Word} from '../domain/types';
import type {BaseSkillRow, BaseSummaryRow, StashRow, SyncVersionRow} from '../sync/types';
import {currentProfile} from './profile';

export interface MetaRow {key:string;value:string}
export interface IndexFields {key:string;greekKey:string;sortKey:string;tokens:string[]}
export type StoredWord=Word&IndexFields;

/** Диакритика снимается и в индексе, и в запросе, поэтому «σπι» находит «σπίτι». */
export const fold=(text:string)=>normalize(text).normalize('NFD').replace(/[̀-ͯ]/g,'').normalize('NFC');
const SEPARATORS=/[\s,;:/()«»"'.!?…—-]+/u;
export const searchTokens=(text:string)=>[...new Set(fold(text).split(SEPARATORS).filter(Boolean))];
export function indexWord(word:Word):StoredWord{
 const greekKey=normalize(word.greek);
 return {...word,key:wordKey(word.greek,word.russian),greekKey,sortKey:fold(word.greek),tokens:[...new Set([...searchTokens(word.greek),...searchTokens(word.russian)])]};
}

export class LexiDatabase extends Dexie {
 words!:Table<StoredWord,string>; lessons!:Table<Lesson,string>; lessonWords!:Table<LessonWord,[string,string]>;
 courses!:Table<Course,string>;
 assets!:Table<Asset,string>; media!:Table<MediaRef,string>; packages!:Table<InstalledPackage,string>; catalog!:Table<CatalogEntry,string>;
 states!:Table<LearningState,string>; events!:Table<ReviewEvent,string>; sessions!:Table<Session,string>;
 settings!:Table<Settings,string>; meta!:Table<MetaRow,string>;
 baseSkills!:Table<BaseSkillRow,string>; baseSummary!:Table<BaseSummaryRow,string>; syncVersions!:Table<SyncVersionRow,string>; syncStash!:Table<StashRow,string>;
 constructor(name='lexi'){
  super(name);
  this.version(1).stores({
   words:'id,greek,russian,deletedAt',
   lessons:'id,targetDate,status',
   assets:'id,kind',
   states:'wordId,introducedAt',
   events:'id,wordId,sessionId,localDate,type',
   sessions:'id,planDate,status',
   settings:'id',
   meta:'key',
  });
  this.version(2).stores({
   words:'id,greek,russian,deletedAt,key,greekKey,[sortKey+id],*tokens',
   lessons:'id,targetDate,status',
   lessonWords:'[lessonId+wordId],wordId,[lessonId+position]',
   assets:'id,kind',
   media:'id',
   packages:'lessonId',
   catalog:'id',
   states:'wordId,introducedAt,card.due',
   events:'id,wordId,sessionId,localDate,type,[wordId+createdAt],[type+createdAt]',
   sessions:'id,planDate,status,[status+createdAt]',
   settings:'id',
   meta:'key',
  }).upgrade(tx=>migrateLegacy(tx));
  // Схема 3: база синхронизации, отложенные состояния и сохранённые альтернативы; индекс времени событий.
  this.version(3).stores({
   events:'id,wordId,sessionId,localDate,type,createdAt,[wordId+createdAt],[type+createdAt]',
   baseSkills:'wordId',
   baseSummary:'id',
   syncVersions:'id,createdAt',
   syncStash:'wordId',
  });
  // Схема 4: уроки собраны в курсы; подписка и время синхронизации курса — данные пользователя.
  this.version(4).stores({
   courses:'id,origin',
   lessons:'id,targetDate,status,courseId',
  }).upgrade(tx=>migrateCourses(tx));
 }
}
/** База текущего профиля: обычный браузер — `lexi`, Telegram — отдельная база на бота и пользователя. */
export const db=new LexiDatabase(currentProfile().databaseName);
export const SCHEMA_VERSION=4;
/** Таблицы пользовательских данных: входят в полную копию. Каталог — кеш, а не данные пользователя; альтернативные версии облака — тоже. */
export const TABLES=['words','lessons','courses','lessonWords','assets','media','packages','states','events','sessions','settings','meta','baseSkills','baseSummary','syncStash'] as const;
export const TABLES_V2=['words','lessons','lessonWords','assets','media','packages','states','events','sessions','settings','meta'] as const;
export const LEGACY_TABLES=['words','lessons','assets','states','events','sessions','settings','meta'] as const;
/** Курс своих наборов: он есть всегда, не обновляется из каталога и не исчезает вместе с ним. */
export const LOCAL_COURSE='my';
export const SEED_LESSON=/^lesson-1-[1-4]$/, SEED_WORD=/^w1[1-4]-\d{2}$/;
/** Стандартное слово поставлено пакетом (есть ревизия) либо исходным набором старой версии. */
export const isStandardWord=(word:Pick<Word,'id'|'revision'>)=>word.revision!==undefined||SEED_WORD.test(word.id);
/** Служебные ключи синхронизации в `meta`: идентификатор устройства и очередь не переносятся копией. */
export const SYNC_META_PREFIX='sync:';
/** Дата создания исходных слов старой версии: слово с ней не редактировалось пользователем. */
export const LEGACY_CREATED='2026-09-15T00:00:00.000Z';

/**
 * Переход на курсы без сети. Сохранённый пакет курса не знает, поэтому поставляемому уроку курс
 * проставит первое обновление каталога; здесь раскладываются только наборы пользователя.
 */
export async function migrateCourses(tx:Pick<Transaction,'table'>):Promise<void>{
 const courses=tx.table('courses') as Table<Course,string>;
 const lessons=tx.table('lessons') as Table<Lesson,string>;
 const packages=tx.table('packages') as Table<InstalledPackage,string>;
 const now=new Date().toISOString();
 await courses.put({id:LOCAL_COURSE,title:'Мои слова',origin:'local',subscribed:true,createdAt:now,updatedAt:now});
 for(const lesson of await lessons.toArray()){
  if(lesson.courseId||await packages.get(lesson.id))continue;
  await lessons.put({...lesson,courseId:LOCAL_COURSE});
 }
}

/**
 * Миграция старой схемы: массивы `wordIds` становятся связями с сохранением порядка, слова получают индексы,
 * а исходные уроки, установленные старой версией, отмечаются как установленные без известной базы.
 * Ничего не скачивает и не трогает прогресс, историю и удаления пользователя.
 */
export async function migrateLegacy(tx:Pick<Transaction,'table'>):Promise<void>{
 const lessons=tx.table('lessons') as Table<Lesson&{wordIds?:string[]},string>;
 const links=tx.table('lessonWords') as Table<LessonWord,[string,string]>;
 const words=tx.table('words') as Table<StoredWord,string>;
 const packages=tx.table('packages') as Table<InstalledPackage,string>;
 const meta=tx.table('meta') as Table<MetaRow,string>;
 const seeded=!!(await meta.get('seed'));
 const now=new Date().toISOString();
 for(const lesson of await lessons.toArray()){
  const wordIds=lesson.wordIds;
  if(wordIds){
   await links.bulkPut(wordIds.map((wordId,position)=>({lessonId:lesson.id,wordId,position})));
   delete lesson.wordIds;
   await lessons.put(lesson);
  }
  if(seeded&&SEED_LESSON.test(lesson.id)&&!(await packages.get(lesson.id)))
   await packages.put({lessonId:lesson.id,version:'legacy',schemaVersion:0,installedAt:now,words:[],media:[],removed:[]});
 }
 await words.toCollection().modify(word=>{
  Object.assign(word,indexWord(word));
  if(seeded&&SEED_WORD.test(word.id)&&word.edited===undefined)word.edited=word.updatedAt!==LEGACY_CREATED;
 });
 await meta.delete('seed');
}

export async function ensureDefaults(database:LexiDatabase=db):Promise<void>{
 if(!await database.settings.get('settings'))await database.settings.add(defaultSettings);
}
