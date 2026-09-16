import Dexie, {type Table} from 'dexie';
import {seedAssets, seedLessons, seedWords, SEED_VERSION} from '../content';
import {scheduleLessons} from '../domain/schedule';
import {defaultSettings, fillSettings, type Asset, type LearningState, type Lesson, type ReviewEvent, type Session, type Settings, type Word} from '../domain/types';

export interface MetaRow {key:string;value:string}

export class LexiDatabase extends Dexie {
 words!:Table<Word,string>; lessons!:Table<Lesson,string>; assets!:Table<Asset,string>;
 states!:Table<LearningState,string>; events!:Table<ReviewEvent,string>; sessions!:Table<Session,string>;
 settings!:Table<Settings,string>; meta!:Table<MetaRow,string>;
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
 }
}
export const db=new LexiDatabase();
export const TABLES=['words','lessons','assets','states','events','sessions','settings','meta'] as const;

/** Однократное наполнение: обновление приложения не воскрешает удалённые пользователем слова. */
export async function ensureSeed(database:LexiDatabase=db):Promise<boolean>{
 const marker=await database.meta.get('seed');
 if(marker?.value===SEED_VERSION)return false;
 await database.transaction('rw',database.words,database.lessons,database.assets,database.settings,database.meta,async()=>{
  const known=new Set((await database.words.bulkGet(seedWords.map(w=>w.id))).filter(Boolean).map(w=>w!.id));
  await database.words.bulkAdd(seedWords.filter(word=>!known.has(word.id)));
  for(const lesson of seedLessons) if(!await database.lessons.get(lesson.id)) await database.lessons.add(lesson);
  const assets=seedAssets();
  const havingAssets=new Set((await database.assets.bulkGet(assets.map(a=>a.id))).filter(Boolean).map(a=>a!.id));
  await database.assets.bulkAdd(assets.filter(asset=>!havingAssets.has(asset.id)));
  if(!await database.settings.get('settings')) await database.settings.add(defaultSettings);
  await database.meta.put({key:'seed',value:SEED_VERSION});
 });
 return true;
}

/** Единственное место, где уроки получают даты по расписанию: экраны и планировщик читают готовые даты. */
export async function loadSnapshot(database:LexiDatabase=db){
 const [words,lessons,states,events,sessions,stored]=await Promise.all([
  database.words.toArray(),database.lessons.toArray(),database.states.toArray(),
  database.events.toArray(),database.sessions.toArray(),database.settings.get('settings'),
 ]);
 const settings=fillSettings(stored);
 return {words,lessons:scheduleLessons(lessons,settings.schedule),states,events,sessions,settings} satisfies {
  words:Word[];lessons:Lesson[];states:LearningState[];events:ReviewEvent[];sessions:Session[];settings:Settings;
 };
}
export async function assetUrl(id:string|undefined,database:LexiDatabase=db){
 if(!id)return null;
 const asset=await database.assets.get(id);
 return asset?URL.createObjectURL(asset.blob):null;
}
