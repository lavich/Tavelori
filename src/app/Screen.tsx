import type {ReactNode} from 'react';
import {BackBar, BrandBar} from './TopBar';
import ui from '../shared/ui.module.css';

/**
 * Оболочка экрана: шапка и область содержимого с отступами `ui.screen`. От этого класса зависят и отступы
 * под системную строку Telegram (`.app>.screen:first-child` в `ui.module.css`), поэтому все экраны
 * собираются здесь, а не повторяют разметку.
 *
 * Без `back` показывается `BrandBar` (главные разделы нижней навигации), с `back` — заголовок и возврат.
 * `bare` — экран без шапки: результат занятия, где из шага назад возвращаться некуда.
 * `roomy` добавляет верхний воздух такому экрану.
 */
export function Screen({back,right,onBack,subtitle,bare,roomy,children}:{
 back?:string;right?:ReactNode;onBack?:()=>void;subtitle?:string;bare?:boolean;roomy?:boolean;children?:ReactNode;
}){
 return (
  <>
   {bare?null:back===undefined?<BrandBar subtitle={subtitle}/>:<BackBar title={back} right={right} onBack={onBack}/>}
   <main className={roomy?`${ui.screen} ${ui.roomy}`:ui.screen}>{children}</main>
  </>
 );
}
