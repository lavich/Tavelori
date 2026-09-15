import {useEffect, useState} from 'react';
/** Часы приложения; доменные функции получают время параметром, а не читают его сами. */
export function useNow(intervalMs=60000):Date{
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{
  const id=setInterval(()=>setNow(new Date()),intervalMs);
  const wake=()=>setNow(new Date());
  document.addEventListener('visibilitychange',wake);
  return()=>{clearInterval(id);document.removeEventListener('visibilitychange',wake)};
 },[intervalMs]);
 return now;
}
