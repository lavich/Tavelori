import type {Card, Grade} from 'ts-fsrs';
export type ExerciseType='recall'|'recognition'|'assembly'|'spelling'|'listening';
export interface Example {greek:string;russian:string;target:string;source?:string}
export interface Segment {text:string;ipa:string;explanation:string;start:number}
export interface Word {id:string;greek:string;russian:string;ipa:string;segments:Segment[];examples:Example[];imageAssetId?:string;audioAssetId?:string;sourceMastered:boolean;verified:boolean;source?:string;createdAt:string;updatedAt:string;deletedAt?:string}
export interface Lesson {id:string;title:string;targetDate:string|null;status:'upcoming'|'completed';wordIds:string[];createdAt:string;updatedAt:string}
export interface Asset {id:string;kind:'image'|'audio';blob:Blob;mimeType:string;source:string;alt:string}
export interface LearningState {wordId:string;card:Card;introducedAt:string;version:number}
export interface ReviewEvent {id:string;sessionId:string;itemId:string;wordId:string;snapshot:{greek:string;russian:string};type:ExerciseType;mode:'scheduled'|'practice';rating:Grade;correct:boolean|null;answer:string;createdAt:string;localDate:string;responseTimeMs:number;before?:Card;after?:Card}
export interface SessionItem {id:string;wordId:string;word:Word;type:ExerciseType;options:string[];isNew:boolean;mode:'scheduled'|'practice';expectedVersion:number;eventId?:string}
export interface Session {id:string;createdAt:string;planDate:string;items:SessionItem[];index:number;status:'active'|'done'|'ended';activeTimeMs:number}
export interface Settings {id:'settings';timezone:string;newWordsPerDay:number;sessionSize:number}
export const defaultSettings:Settings={id:'settings',timezone:'Asia/Nicosia',newWordsPerDay:10,sessionSize:20};
export interface Snapshot {words:Word[];lessons:Lesson[];states:LearningState[];events:ReviewEvent[];sessions:Session[];settings:Settings}
