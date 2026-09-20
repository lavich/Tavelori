import type {ReactNode} from 'react';
import {Card, CardContent} from '@/components/ui/card';

/**
 * Плитка с числом: «Сегодня», результат занятия и статистика показывают счётчики одинаково.
 * `head` — подпись над числом (там, где у числа есть значок), `label` — под ним, `note` — вторая строка
 * мелким шрифтом. Плитки живут в сетке `ui.tiles`, размеры карточки задаёт `size="sm"`.
 *
 * `size='md'` оставлен ради единственной плитки «Повторение» на экране «Сегодня»: у неё число на 26px,
 * а не на 30px, как у соседей. Расхождение перенесено сюда как есть; свести обе к 'lg' — правка одного слова.
 */
export function StatTile({head,value,label,note,size='lg',testId}:{
 head?:ReactNode;value:ReactNode;label?:ReactNode;note?:ReactNode;size?:'lg'|'md';testId?:string;
}){
 return (
  <Card size="sm">
   <CardContent>
    {head&&<div className="flex items-center gap-2 text-sm text-muted-foreground">{head}</div>}
    <div className={`${size==='lg'?'text-[30px]':'text-[26px]'} leading-tight font-bold text-primary`}>{value}</div>
    {label&&<div className="text-sm text-muted-foreground">{label}</div>}
    {note&&<div className="mt-1 text-sm text-muted-foreground" data-testid={testId}>{note}</div>}
   </CardContent>
  </Card>
 );
}
