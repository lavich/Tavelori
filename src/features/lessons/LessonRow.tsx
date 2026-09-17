import {ChevronRight, FileText} from 'lucide-react';
import {Link} from 'react-router-dom';
import {Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle} from '@/components/ui/item';
import type {LessonProgress} from '../../domain/stats';
import {withCount, WORDS} from '../../shared/format';
import type {LessonView} from '../../storage/queries';
import styles from './LessonRow.module.css';

const GROUPS=[
 ['solid',['устойчивое','устойчивых','устойчивых']],
 ['review',['в повторении','в повторении','в повторении']],
 ['fresh',['новое','новых','новых']],
] as const;
/** Числа непустых групп в фиксированном порядке: «12 устойчивых · 8 в повторении · 13 новых», у нетронутого урока — «33 новых». */
export const progressText=(progress:LessonProgress)=>GROUPS.filter(([key])=>progress[key]).map(([key,forms])=>withCount(progress[key],[...forms])).join(' · ');

/** Строка урока в списках «Сегодня» и «Уроки»: экраны задают только заголовок и подпись даты, прогресс приходит из запроса. */
export function LessonRow({lesson,title,note}:{lesson:LessonView;title:string;note?:string}){
 const progress=lesson.wordCount?lesson.progress:undefined;
 const text=progress?progressText(progress):'';
 return (
  <Item variant="outline" className="min-h-16 rounded-[var(--radius-card)] bg-card text-foreground" render={<Link to={`/lessons/${lesson.id}`}/>}>
   <ItemMedia variant="icon"><FileText/></ItemMedia>
   <ItemContent>
    <ItemTitle className="text-base">{title}</ItemTitle>
    <ItemDescription>{withCount(lesson.wordCount,WORDS)}{note?` · ${note}`:''}</ItemDescription>
    {progress&&(
     <>
      <div role="img" aria-label={text} className={styles.bar}>
       {GROUPS.map(([key,forms])=>!!progress[key]&&<span key={key} className={styles[key]} style={{flexGrow:progress[key]}} title={withCount(progress[key],[...forms])}/>)}
      </div>
      <div aria-hidden="true" className="text-xs text-muted-foreground" data-testid="lesson-progress">{text}</div>
     </>
    )}
   </ItemContent>
   <ItemActions><ChevronRight className="text-muted-foreground"/></ItemActions>
  </Item>
 );
}
