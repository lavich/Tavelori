import type {Card, Grade} from 'ts-fsrs';
import type {PackageMedia, PackageWord} from '../content/schema';
export type ExerciseType='recall'|'recognition'|'assembly'|'spelling'|'listening';
export interface Example {greek:string;russian:string;target:string;source?:string}
export interface Segment {text:string;ipa:string;explanation:string;start:number}
/**
 * `revision` — ревизия поставленного пакетом содержимого, `edited` — слово менялось локально после установки.
 * У слов пользователя обоих полей нет.
 */
export interface Word {id:string;greek:string;russian:string;ipa:string;note?:string;segments:Segment[];examples:Example[];imageAssetId?:string;audioAssetId?:string;sourceMastered:boolean;verified:boolean;source?:string;createdAt:string;updatedAt:string;deletedAt?:string;revision?:string;edited?:boolean}
/** `dateSource` заполняется только в выборке: в базе дата либо своя (задана вручную), либо пустая (по расписанию). */
export interface Lesson {id:string;title:string;targetDate:string|null;status:'upcoming'|'completed';createdAt:string;updatedAt:string;dateSource?:'manual'|'schedule'}
/** Членство слова в уроке: уникальная пара и порядок внутри урока. Удаление связи не трогает слово и прогресс. */
export interface LessonWord {lessonId:string;wordId:string;position:number}
export interface Asset {id:string;kind:'image'|'audio';blob:Blob;mimeType:string;source:string;alt:string}
/** Описание медиа из пакета без самого файла: по нему ресурс догружается при использовании. */
export type MediaRef=PackageMedia;
/**
 * Установленный пакет: версия, база поставленных слов для слияния при обновлении и связи,
 * которые пользователь убрал сам, чтобы обновление их не восстановило. `version:'legacy'` — контент
 * установлен старой версией приложения, база слов неизвестна.
 */
export interface InstalledPackage {lessonId:string;version:string;schemaVersion:number;installedAt:string;words:PackageWord[];media:PackageMedia[];removed:string[]}
export interface LearningState {wordId:string;card:Card;introducedAt:string;version:number}
export interface ReviewEvent {id:string;sessionId:string;itemId:string;wordId:string;snapshot:{greek:string;russian:string};type:ExerciseType;mode:'scheduled'|'practice';rating:Grade;correct:boolean|null;answer:string;createdAt:string;localDate:string;responseTimeMs:number;before?:Card;after?:Card}
export interface SessionItem {id:string;wordId:string;word:Word;type:ExerciseType;options:string[];isNew:boolean;mode:'scheduled'|'practice';expectedVersion:number;eventId?:string;retryOf?:string}
export interface Session {id:string;createdAt:string;planDate:string;items:SessionItem[];index:number;status:'active'|'done'|'ended';activeTimeMs:number;introducedWordIds?:string[];objectiveVersion?:1}
/** Дни недели по ISO: 1 — понедельник, 7 — воскресенье. */
export interface Schedule {startDate:string|null;weekdays:number[]}
export interface Settings {id:'settings';timezone:string;newWordsPerDay:number;sessionSize:number;schedule:Schedule}
export const defaultSchedule:Schedule={startDate:null,weekdays:[]};
export const defaultSettings:Settings={id:'settings',timezone:'Asia/Nicosia',newWordsPerDay:10,sessionSize:20,schedule:defaultSchedule};
/** Запись настроек старой версии или из старой копии читается без миграции. */
export const fillSettings=(settings:Partial<Settings>|undefined):Settings=>({...defaultSettings,...settings,schedule:settings?.schedule??defaultSchedule});
/**
 * Полный снимок данных: используется только в тестах как источник для планировщика.
 * Экраны приложения читают ограниченные выборки, а не снимок.
 */
export interface Snapshot {words:Word[];lessons:Lesson[];links:LessonWord[];states:LearningState[];events:ReviewEvent[];sessions:Session[];settings:Settings}
