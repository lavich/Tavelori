import {Suspense, useEffect, useRef} from 'react';
import {toast} from 'sonner';
import {Toaster} from '@/components/ui/sonner';
import {Navigate, Route, Routes, useLocation} from 'react-router-dom';
import {Nav} from './Nav';
import {useGoBack} from './navigation';
import {SyncConflictDialog, TelegramWelcome} from './TelegramNotices';
import {updateReady} from '../main';
import {useBackHandler, useEnvironment} from '../platform/platform';
import {localDay} from '../domain/learning';
import {useNow} from '../shared/clock';
import {useSettings} from '../shared/store';
import {settleLessons} from '../storage/ops';
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
import ui from '../shared/ui.module.css';

export function App(){
 const {pathname}=useLocation();
 const immersive=pathname.startsWith('/session');
 const {settings}=useSettings();
 useEnvironment();
 // Резервный возврат Telegram: на «Сегодня» кнопка скрыта, на остальных экранах без своего обработчика ведёт назад или на главный.
 const goBack=useGoBack();
 useBackHandler(pathname==='/'?null:goBack,0);
 const today=localDay(useNow(),settings.timezone);
 const seenDay=useRef(today);
 useEffect(()=>{
  // При запуске закрепление уже сделал main.tsx; здесь ловим смену дня в открытом приложении.
  if(seenDay.current===today)return;
  seenDay.current=today;
  settleLessons(new Date()).catch(error=>console.error('Не удалось закрепить прошедшие уроки',error));
 },[today]);
 useEffect(()=>{
  // Обновление предлагаем между занятиями, чтобы не прервать ответ.
  const notice=()=>{
   if(immersive)return;
   toast('Есть обновление приложения',{duration:Infinity,action:{label:'Обновить',onClick:()=>updateReady.apply()}});
  };
  if(updateReady.value)notice();
  window.addEventListener('lexi:update',notice);
  return()=>window.removeEventListener('lexi:update',notice);
 },[immersive]);
 return (
  <div className={ui.app}>
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
   <Toaster position="bottom-center" offset={immersive?16:88}/>
   {!immersive&&<Nav/>}
   <TelegramWelcome/>
   {!immersive&&<SyncConflictDialog/>}
  </div>
 );
}
