import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {registerSW} from 'virtual:pwa-register';
import {App} from './app/App';
import {ensureSeed} from './storage/db';
import './styles.css';

export const updateReady={value:false,apply:()=>{}};
const update=registerSW({onNeedRefresh(){updateReady.value=true;window.dispatchEvent(new CustomEvent('lexi:update'))}});
updateReady.apply=()=>update(true);

ensureSeed().catch(error=>console.error('Не удалось подготовить исходные уроки',error));
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter basename={import.meta.env.BASE_URL}><App/></BrowserRouter></StrictMode>);
