import Dexie from 'dexie';
import {useLiveQuery} from 'dexie-react-hooks';
import {useCallback, useEffect, useState, useSyncExternalStore} from 'react';
import {coursePhase, ensureAsset, installPhase, lessonReadiness, subscribeInstall} from '../content/client';
import {makePlan} from '../domain/learning';
import {progress} from '../domain/stats';
import {defaultSettings, type Session} from '../domain/types';
import {db} from '../storage/db';
import {deletedWordIds, dexieSource, lessonDetail, lessonsOfWord, lessonViews, loadSettings, wordPage, type WordFilter, type WordPage} from '../storage/queries';

/**
 * Каждый экран подписывается только на свою выборку. Общего реактивного снимка базы больше нет:
 * Dexie отслеживает прочитанные диапазоны и перезапускает запрос при изменении именно их.
 */
export function useSettings(){
 const settings=useLiveQuery(()=>loadSettings(),[]);
 return {settings:settings??defaultSettings,ready:!!settings};
}
export const useLessons=(withNew=false)=>useLiveQuery(()=>lessonViews(db,withNew),[withNew]);
/** `undefined` — ещё читается, `null` — урока нет локально. */
export const useLesson=(id:string|undefined)=>useLiveQuery(()=>id?lessonDetail(id):null,[id]);
export const useWord=(id:string|undefined)=>useLiveQuery(()=>id?db.words.get(id):undefined,[id]);
export const useWordLessons=(id:string|undefined)=>useLiveQuery(()=>id?lessonsOfWord(id):[],[id])??[];
export const usePlan=(now:Date)=>useLiveQuery(()=>makePlan(dexieSource(),now),[now.getTime()]);
export const useStats=(now:Date)=>useLiveQuery(()=>progress(dexieSource(),now),[now.getTime()]);
export const useActiveSession=():Session|undefined|null=>useLiveQuery(()=>
 db.sessions.where('[status+createdAt]').between(['active',Dexie.minKey],['active',Dexie.maxKey]).reverse().first().then(session=>session??null),[]);
export const useCounts=()=>useLiveQuery(async()=>({words:await db.words.count()-(await deletedWordIds()).size,answers:await db.events.count()}),[]);

export const useCatalog=()=>useLiveQuery(async()=>({entries:await db.catalog.toArray(),packages:await db.packages.toArray()}),[]);
export const useInstallPhase=(lessonId:string|undefined)=>useSyncExternalStore(subscribeInstall,()=>installPhase(lessonId??''));
export const useCourses=()=>useLiveQuery(()=>db.courses.toArray(),[]);
export const useCoursePhase=(courseId:string|undefined)=>useSyncExternalStore(subscribeInstall,()=>coursePhase(courseId??''));
export const useReadiness=(lessonId:string|undefined)=>useLiveQuery(()=>lessonId?lessonReadiness(lessonId):undefined,[lessonId]);

export function useAssetUrl(id:string|undefined):string|null{
 const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{
  let revoke:string|null=null, alive=true;
  if(!id){setUrl(null);return}
  ensureAsset(id).then(asset=>{
   if(!alive||!asset)return setUrl(null);
   revoke=URL.createObjectURL(asset.blob);
   setUrl(revoke);
  }).catch(()=>{if(alive)setUrl(null)});
  return()=>{alive=false;if(revoke)URL.revokeObjectURL(revoke)};
 },[id]);
 return url;
}

export interface WordListRequest {query:string;filter:WordFilter;lessonId:string|null}
/** Первая страница живая, следующие подгружаются по запросу и сбрасываются при смене условий. */
export function useWordPages(request:WordListRequest){
 const first=useLiveQuery(()=>wordPage({...request,cursor:null}),[request.query,request.filter,request.lessonId]);
 const [more,setMore]=useState<WordPage[]>([]);
 const [loading,setLoading]=useState(false);
 useEffect(()=>{setMore([])},[request.query,request.filter,request.lessonId]);
 const last=more[more.length-1]??first;
 const loadMore=useCallback(async()=>{
  if(!last?.cursor||loading)return;
  setLoading(true);
  try{const page=await wordPage({...request,cursor:last.cursor});setMore(pages=>[...pages,page])}
  finally{setLoading(false)}
 },[last?.cursor,loading,request.query,request.filter,request.lessonId]);
 return {items:first?[...first.items,...more.flatMap(page=>page.items)]:[],ready:!!first,hasMore:!!last?.cursor,loading,loadMore,scope:first?.scope??'all'};
}
