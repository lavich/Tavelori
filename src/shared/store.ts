import {useLiveQuery} from 'dexie-react-hooks';
import {useEffect, useState} from 'react';
import {db, loadSnapshot} from '../storage/db';
import {defaultSettings, type Snapshot} from '../domain/types';

export const emptySnapshot:Snapshot={words:[],lessons:[],states:[],events:[],sessions:[],settings:defaultSettings};

export function useSnapshot():{data:Snapshot;ready:boolean}{
 const data=useLiveQuery(()=>loadSnapshot(),[]);
 return {data:data??emptySnapshot,ready:!!data};
}
export const useWord=(id:string|undefined)=>useLiveQuery(()=>id?db.words.get(id):undefined,[id]);

/** Картинка читается из Asset, а не из HTTP-кеша, поэтому работает и после восстановления копии. */
export function useAssetUrl(id:string|undefined):string|null{
 const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{
  let revoke:string|null=null, alive=true;
  if(!id){setUrl(null);return}
  db.assets.get(id).then(asset=>{
   if(!alive||!asset)return setUrl(null);
   revoke=URL.createObjectURL(asset.blob);
   setUrl(revoke);
  });
  return()=>{alive=false;if(revoke)URL.revokeObjectURL(revoke)};
 },[id]);
 return url;
}
export const lessonsOf=(data:Snapshot,wordId:string)=>data.lessons.filter(lesson=>lesson.wordIds.includes(wordId));
export const liveWords=(data:Snapshot)=>data.words.filter(word=>!word.deletedAt);
