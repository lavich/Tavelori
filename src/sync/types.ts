import type {SkillSummary, StatsSummary} from '../domain/skills';
import type {Card} from 'ts-fsrs';
import type {Schedule} from '../domain/types';

/** Версия облачного формата: другая версия не применяется и не перезаписывается старым клиентом. */
export const SNAPSHOT_FORMAT=1;
/** Вектор счётчиков устройств: причинная база версии. */
export type Clock=Record<string,number>;

/** Карточка FSRS в JSON: даты — строки ISO, при применении оживляются в Date для индексов. */
export type SerializedCard=Omit<Card,'due'|'last_review'>&{due:string;last_review?:string};
export interface CompactState {wordId:string;card:SerializedCard;introducedAt:string;version:number}
export interface CompactLesson {id:string;targetDate:string|null;status:'upcoming'|'completed';updatedAt:string}
export interface CompactSettings {timezone:string;sessionSize:number}
/** Темп курса переносится между устройствами: без него второе устройство считало бы дни иначе. */
export interface CompactCourse {id:string;subscribed:boolean;newWordsPerDay:number;schedule:Schedule}
/**
 * Компактный снимок стандартного прогресса: состояния FSRS и навыков стандартных слов, настройки,
 * даты/статусы стандартных уроков, требуемые пакеты и сводки статистики. Полная история, сессии,
 * пользовательские слова и медиа в снимок не входят.
 */
export interface CompactSnapshot {
 format:typeof SNAPSHOT_FORMAT;
 createdAt:string;
 settings:CompactSettings;
 courses:CompactCourse[];
 lessons:CompactLesson[];
 packages:string[];
 states:CompactState[];
 skills:{wordId:string;skills:SkillSummary}[];
 stats:StatsSummary;
}

/** Опубликованная версия: идентификатор, устройство, причинная база и разрешённые ветви. */
export interface VersionMeta {id:string;device:string;clock:Clock;createdAt:string;format:number;parts:number;checksum:string;resolves:string[];/** Платформа устройства для отображения в конфликте. */label?:string}
export interface StoredVersion {meta:VersionMeta;snapshot:CompactSnapshot}

/** Локально сохранённые альтернативы: конфликтные и отвергнутые версии до явного удаления. */
export interface SyncVersionRow {id:string;role:'conflict'|'rejected'|'restored';createdAt:string;meta:VersionMeta;snapshot:CompactSnapshot;note?:string}
/** База навыков слова из последнего применённого или опубликованного снимка. */
export interface BaseSkillRow {wordId:string;skills:SkillSummary}
/** Сводка статистики базы и момент отсечки: локальные события после него складываются поверх. */
export interface BaseSummaryRow {id:'base';asOf:string;versionId:string;stats:StatsSummary}
/** Состояния слов, пакет которых ещё не загружен: не теряются и не попадают в план до установки. */
export interface StashRow {wordId:string;state:CompactState}
