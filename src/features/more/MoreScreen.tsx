import {BarChart3, ChevronRight, Download, Settings, Upload, Wifi, WifiOff} from 'lucide-react';
import {Link} from 'react-router-dom';
import {Card, CardContent} from '@/components/ui/card';
import {Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle} from '@/components/ui/item';
import {BrandBar} from '../../app/TopBar';
import {withCount, WORDS} from '../../shared/format';
import {megabytes, useOfflineStatus} from '../../shared/offline';
import {useCounts} from '../../shared/store';
import ui from '../../shared/ui.module.css';

const LINKS=[
 {to:'/more/stats',label:'Статистика',sub:'Ответы, сроки и слабые навыки',Icon:BarChart3},
 {to:'/more/settings',label:'Настройки',sub:'Дневной лимит, размер занятия, зона',Icon:Settings},
 {to:'/more/import',label:'Импорт слов',sub:'Вставка из Quizlet или TSV',Icon:Upload},
 {to:'/more/backup',label:'Копия данных',sub:'Полный экспорт и восстановление',Icon:Download},
];
export function MoreScreen(){
 const offline=useOfflineStatus();
 const counts=useCounts();
 return (
  <>
   <BrandBar/>
   <main className={ui.screen}>
    <h1>Ещё</h1>
    <Card className="mb-3">
     <CardContent className="flex flex-col gap-1.5">
      <p className="m-0 flex items-center gap-2.5 font-semibold">
       {offline.ready?<Wifi className="size-5 text-muted-foreground"/>:<WifiOff className="size-5 text-muted-foreground"/>}
       {offline.checking?'Проверяем офлайн-режим…':offline.ready?'Готово офлайн':'Офлайн-пакет ещё готовится'}
      </p>
      <p className="m-0 text-sm text-muted-foreground">
       {offline.ready
        ?'Оболочка приложения открывается без сети. Слова и медиа доступны для уроков, скачанных на экране урока.'
        :'Оставьте страницу открытой на несколько секунд — оболочка загружается в кеш.'}
       {offline.quota>0&&` Занято ${megabytes(offline.usage)} из ${megabytes(offline.quota)}.`}
       {offline.persisted?' Хранилище защищено от автоочистки.':' Браузер может очистить данные — делайте полную копию.'}
      </p>
      {offline.problem&&<p className={ui.error}>{offline.problem}</p>}
     </CardContent>
    </Card>
    <ItemGroup className="gap-2.5">
     {LINKS.map(({to,label,sub,Icon})=>(
      <Item key={to} variant="outline" className="min-h-16 rounded-[var(--radius-card)] bg-card text-foreground" render={<Link to={to}/>}>
       <ItemMedia variant="icon"><Icon/></ItemMedia>
       <ItemContent>
        <ItemTitle className="text-base">{label}</ItemTitle>
        <ItemDescription>{sub}</ItemDescription>
       </ItemContent>
       <ItemActions><ChevronRight className="text-muted-foreground"/></ItemActions>
      </Item>
     ))}
    </ItemGroup>
    <p className="mt-5 text-sm text-muted-foreground">
     Lexi хранит {withCount(counts?.words??0,WORDS)} и {withCount(counts?.answers??0,['ответ','ответа','ответов'])} только на этом устройстве. Регистрация и сервер не нужны.
    </p>
   </main>
  </>
 );
}
