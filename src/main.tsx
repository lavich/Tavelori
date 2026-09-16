import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {registerSW} from 'virtual:pwa-register';
import {App} from './app/App';
import {refreshCatalog} from './content/client';
import {db, ensureDefaults} from './storage/db';
import {settleLessons} from './storage/ops';
import './styles.css';

export const updateReady={value:false,apply:()=>{}};
const update=registerSW({onNeedRefresh(){updateReady.value=true;window.dispatchEvent(new CustomEvent('lexi:update'))}});
updateReady.apply=()=>update(true);

// Запуск не скачивает пакеты: открываются локальные данные, каталог обновляется в фоне и без сети остаётся прежним.
db.open().then(()=>ensureDefaults()).then(()=>settleLessons(new Date())).catch(error=>console.error('Не удалось открыть локальную базу',error));
refreshCatalog().catch(()=>undefined);
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter basename={import.meta.env.BASE_URL}><App/></BrowserRouter></StrictMode>);
