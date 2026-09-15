import {ChevronRight, Download, Settings, Upload, BarChart3, WifiOff, Wifi} from 'lucide-react';
import {Link} from 'react-router-dom';
import {BrandBar} from '../../app/TopBar';
import {withCount, WORDS} from '../../shared/format';
import {megabytes, useOfflineStatus} from '../../shared/offline';
import {liveWords, useSnapshot} from '../../shared/store';

const LINKS=[
 {to:'/more/stats',label:'Статистика',sub:'Ответы, сроки и слабые навыки',Icon:BarChart3},
 {to:'/more/settings',label:'Настройки',sub:'Дневной лимит, размер занятия, зона',Icon:Settings},
 {to:'/more/import',label:'Импорт слов',sub:'Вставка из Quizlet или TSV',Icon:Upload},
 {to:'/more/backup',label:'Копия данных',sub:'Полный экспорт и восстановление',Icon:Download},
];
export function MoreScreen(){
 const offline=useOfflineStatus();
 const {data}=useSnapshot();
 return (
  <>
   <BrandBar/>
   <main className="screen">
    <h1>Ещё</h1>
    <section className="card">
     <p className="row" style={{gap:10,margin:'0 0 6px'}}>
      {offline.ready?<Wifi size={20} className="muted" aria-hidden/>:<WifiOff size={20} className="muted" aria-hidden/>}
      <b>{offline.checking?'Проверяем офлайн-режим…':offline.ready?'Готово офлайн':'Офлайн-пакет ещё готовится'}</b>
     </p>
     <p className="small muted" style={{margin:0}}>
      {offline.ready
       ?'Приложение и исходные карточки открываются без сети.'
       :'Оставьте страницу открытой на несколько секунд — файлы загружаются в кеш.'}
      {offline.quota>0&&` Занято ${megabytes(offline.usage)} из ${megabytes(offline.quota)}.`}
      {offline.persisted?' Хранилище защищено от автоочистки.':' Браузер может очистить данные — делайте полную копию.'}
     </p>
     {offline.problem&&<p className="error" style={{marginBottom:0}}>{offline.problem}</p>}
    </section>
    {LINKS.map(({to,label,sub,Icon})=>(
     <Link className="item" key={to} to={to}>
      <Icon size={20} className="muted" aria-hidden/>
      <span className="grow"><span className="title">{label}</span><span className="sub">{sub}</span></span>
      <ChevronRight size={20} className="badge" aria-hidden/>
     </Link>
    ))}
    <p className="small muted" style={{marginTop:18}}>
     Lexi хранит {withCount(liveWords(data).length,WORDS)} и {withCount(data.events.length,['ответ','ответа','ответов'])} только на этом устройстве. Регистрация и сервер не нужны.
    </p>
   </main>
  </>
 );
}
