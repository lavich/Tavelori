import {Suspense, useEffect, useState} from 'react';
import {Navigate, Route, Routes, useLocation} from 'react-router-dom';
import {Nav} from './Nav';
import {updateReady} from '../main';
import {TodayScreen} from '../features/today/TodayScreen';
import {LessonsScreen} from '../features/lessons/LessonsScreen';
import {LessonScreen} from '../features/lessons/LessonScreen';
import {WordsScreen} from '../features/words/WordsScreen';
import {WordScreen} from '../features/words/WordScreen';
import {WordEditorScreen} from '../features/words/WordEditorScreen';
import {SessionScreen} from '../features/learning/SessionScreen';
import {ResultScreen} from '../features/learning/ResultScreen';
import {MoreScreen} from '../features/more/MoreScreen';
import {StatsScreen} from '../features/progress/StatsScreen';
import {SettingsScreen} from '../features/more/SettingsScreen';
import {ImportScreen} from '../features/more/ImportScreen';
import {BackupScreen} from '../features/backup/BackupScreen';

export function App(){
 const {pathname}=useLocation();
 const immersive=pathname.startsWith('/session');
 const [update,setUpdate]=useState(updateReady.value);
 useEffect(()=>{
  const notice=()=>setUpdate(true);
  window.addEventListener('lexi:update',notice);
  return()=>window.removeEventListener('lexi:update',notice);
 },[]);
 return (
  <div className="app">
   <Suspense fallback={null}>
    <Routes>
     <Route path="/" element={<TodayScreen/>}/>
     <Route path="/lessons" element={<LessonsScreen/>}/>
     <Route path="/lessons/:id" element={<LessonScreen/>}/>
     <Route path="/words" element={<WordsScreen/>}/>
     <Route path="/words/:id" element={<WordScreen/>}/>
     <Route path="/words/:id/edit" element={<WordEditorScreen/>}/>
     <Route path="/session" element={<SessionScreen/>}/>
     <Route path="/session/result/:id" element={<ResultScreen/>}/>
     <Route path="/more" element={<MoreScreen/>}/>
     <Route path="/more/stats" element={<StatsScreen/>}/>
     <Route path="/more/settings" element={<SettingsScreen/>}/>
     <Route path="/more/import" element={<ImportScreen/>}/>
     <Route path="/more/backup" element={<BackupScreen/>}/>
     <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
   </Suspense>
   {/* Обновление применяем только между занятиями, чтобы не прервать ответ. */}
   {update&&!immersive&&(
    <div className="toast" role="status">
     Есть обновление приложения
     <button className="btn small ghost" style={{marginLeft:12,display:'inline-flex'}} onClick={()=>updateReady.apply()}>Обновить</button>
    </div>
   )}
   {!immersive&&<Nav/>}
  </div>
 );
}
