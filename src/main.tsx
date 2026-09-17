import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {registerSW} from 'virtual:pwa-register';
import {App} from './app/App';
import {Recovery} from './app/Recovery';
import {refreshCatalog, syncCourses} from './content/client';
import {initPlatform, telegramBridge} from './platform/platform';
import {db, ensureDefaults} from './storage/db';
import {settleLessons} from './storage/ops';
import {connectSync} from './sync';
import './styles.css';

export const updateReady={value:false,apply:()=>{}};
// WebView без service worker не должен обрушить запуск: регистрация обёрнута, обновления просто недоступны.
try{
 if('serviceWorker' in navigator){
  const update=registerSW({onNeedRefresh(){updateReady.value=true;window.dispatchEvent(new CustomEvent('lexi:update'))},onRegisterError(error){console.warn('Service worker недоступен',error)}});
  updateReady.apply=()=>update(true);
 }
}catch(error){console.warn('Service worker недоступен',error)}

const database=db.open().then(()=>ensureDefaults()).then(()=>settleLessons(new Date())).catch(error=>console.error('Не удалось открыть локальную базу',error));
// Подписанные курсы догружаются следом за каталогом: новый урок появляется сам, медиа остаётся по запросу.
refreshCatalog().then(()=>syncCourses()).catch(()=>undefined);
// Bridge Telegram загружается параллельно и не задерживает рендер; синхронизация подключается после базы и bridge.
const platform=initPlatform();
Promise.all([database,platform]).then(()=>connectSync(telegramBridge())).catch(error=>console.warn('Синхронизация не подключена',error));
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter basename={import.meta.env.BASE_URL}><Recovery><App/></Recovery></BrowserRouter></StrictMode>);
