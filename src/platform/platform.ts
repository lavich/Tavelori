import {useCallback, useEffect, useLayoutEffect, useSyncExternalStore} from 'react';
import {telegramAdapter, webAdapter, type HapticKind, type PlatformAdapter, type PrimaryAction} from './adapter';
import {loadTelegramBridge} from './bridge';
import {launchContext} from './launch';
import type {TelegramWebApp} from './telegram-types';

/**
 * Хранилище платформы: приложение стартует с веб-адаптером и переключается на Telegram, когда bridge готов.
 * Экраны читают адаптер через `usePlatform` и не ждут загрузки.
 */
let adapter:PlatformAdapter=webAdapter();
let bridge:TelegramWebApp|null=null;
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(listener=>listener());
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};

export const platform=()=>adapter;
export const telegramBridge=()=>bridge;
export function usePlatform():PlatformAdapter{return useSyncExternalStore(subscribe,platform,platform)}
export const isTelegramLaunch=()=>launchContext().kind==='telegram';

/** Подмена адаптера в тестах и при готовности bridge; предыдущий освобождает подписки. */
export function setPlatform(next:PlatformAdapter,app:TelegramWebApp|null=null){
 if(adapter!==next)adapter.dispose();
 adapter=next; bridge=app;
 applyEnvironment();
 notify();
}

/**
 * Неблокирующая инициализация: bridge загружается только при запуске из Telegram; браузер ничего не ждёт.
 * Ошибка загрузки, тайм-аут или частично доступный API оставляют рабочий интерфейс.
 */
export async function initPlatform(timeoutMs=4000):Promise<PlatformAdapter>{
 document.documentElement.dataset.platform=launchContext().kind;
 if(!isTelegramLaunch())return adapter;
 try{
  const app=await loadTelegramBridge(timeoutMs);
  if(!app)return adapter;
  const next=telegramAdapter(app);
  setPlatform(next,app);
  next.ready();
  return next;
 }catch(error){
  console.warn('Интеграция Telegram недоступна, работает обычный режим',error);
  return adapter;
 }
}

/** Тема и размеры переводятся в переменные оболочки; недоступные значения оставляют CSS браузера. */
export function applyEnvironment(){
 const root=document.documentElement;
 if(adapter.kind!=='telegram'){
  root.removeAttribute('data-theme');root.removeAttribute('data-launch-mode');
  ['--app-height','--inset-top','--inset-bottom','--inset-safe-top','--inset-content-top'].forEach(name=>root.style.removeProperty(name));
  return;
 }
 const {scheme,params}=adapter.theme();
 root.dataset.theme=scheme;
 // Переменные темы выставляем сами: не полагаемся на внутреннюю реализацию bridge; неполная тема даёт резерв из CSS.
 for(const [key,value] of Object.entries(params))if(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))root.style.setProperty(`--tg-theme-${key.replace(/_/g,'-')}`,value);
 const view=adapter.viewport();
 // Режим запуска виден стилям и экрану «Ещё»: во весь экран поверх контента лежат кнопки клиента и системная строка.
 if(view.mode)root.dataset.launchMode=view.mode; else root.removeAttribute('data-launch-mode');
 // Док занятия следует за устойчивой высотой Telegram, а при открытой клавиатуре — за фактически видимой областью.
 const visual=typeof window!=='undefined'&&window.visualViewport?.height;
 const heights=[view.stableHeight,visual&&visual<window.innerHeight-1?visual:null].filter((value):value is number=>!!value&&value>0);
 if(heights.length)root.style.setProperty('--app-height',`${Math.round(Math.min(...heights))}px`);
 else root.style.removeProperty('--app-height');
 // Отступы устройства и перекрытия Telegram не суммируются с env(): в WebView действуют значения bridge.
 root.style.setProperty('--inset-top',`${view.safeArea.top+view.contentSafeArea.top}px`);
 // Отдельно: системная строка и полоса кнопок клиента — в полном экране строка прогресса занятия встаёт в эту полосу.
 root.style.setProperty('--inset-safe-top',`${view.safeArea.top}px`);
 root.style.setProperty('--inset-content-top',`${view.contentSafeArea.top}px`);
 root.style.setProperty('--inset-bottom',`${view.safeArea.bottom+view.contentSafeArea.bottom}px`);
}

/** Подписка на тему и размеры активного адаптера; переустанавливается при смене адаптера. */
export function useEnvironment(){
 const current=usePlatform();
 useEffect(()=>{
  applyEnvironment();
  const offTheme=current.onThemeChange(applyEnvironment);
  const offViewport=current.onViewportChange(applyEnvironment);
  const visual=current.kind==='telegram'?window.visualViewport:null;
  visual?.addEventListener('resize',applyEnvironment);
  return()=>{offTheme();offViewport();visual?.removeEventListener('resize',applyEnvironment)};
 },[current]);
}

/**
 * Нативный возврат экрана. Один обработчик на экран: регистрация и снятие симметричны,
 * поэтому StrictMode и смена маршрута не оставляют лишних обработчиков.
 */
export function useBackHandler(handler:(()=>void)|null,priority=1){
 const current=usePlatform();
 useLayoutEffect(()=>{
  if(!handler)return;
  return current.back(handler,priority);
 },[current,handler,priority]);
}
/** Главное действие экрана снимается при размонтировании и при смене адаптера. */
export function usePrimaryAction(action:PrimaryAction|null){
 const current=usePlatform();
 useEffect(()=>{
  if(!action||!current.capabilities.primaryAction)return;
  current.primaryAction(action);
  return()=>current.clearPrimaryAction();
 },[current,action?.text,action?.loading,action?.disabled,action?.onClick]);
}
/** Режим запуска с живым обновлением: Telegram присылает fullscreenChanged и изменения отступов. */
export function useLaunchMode(){
 const current=usePlatform();
 return useSyncExternalStore(
  listener=>{const off=current.onViewportChange(listener);return()=>off()},
  ()=>current.viewport().mode,()=>null,
 );
}
export function useHaptics(){
 const current=usePlatform();
 return useCallback((kind:HapticKind)=>current.haptic(kind),[current]);
}
