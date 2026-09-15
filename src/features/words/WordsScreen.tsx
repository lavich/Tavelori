import {useMemo, useState} from 'react';
import {ChevronRight, Search, SearchX} from 'lucide-react';
import {Link} from 'react-router-dom';
import {State} from 'ts-fsrs';
import {Badge} from '@/components/ui/badge';
import {Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle} from '@/components/ui/empty';
import {Field, FieldLabel} from '@/components/ui/field';
import {InputGroup, InputGroupAddon, InputGroupInput} from '@/components/ui/input-group';
import {Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle} from '@/components/ui/item';
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {BrandBar} from '../../app/TopBar';
import {normalize} from '../../domain/import';
import {withCount, WORDS} from '../../shared/format';
import {liveWords, useSnapshot} from '../../shared/store';
import type {LearningState} from '../../domain/types';
import ui from '../../shared/ui.module.css';

type Filter='all'|'new'|'learning'|'review'|'solid';
const FILTERS:{key:Filter;label:string}[]=[
 {key:'all',label:'Все'},{key:'new',label:'Не начаты'},{key:'learning',label:'В изучении'},{key:'review',label:'На повторении'},{key:'solid',label:'Закреплены'},
];
export const stateGroup=(state:LearningState|undefined):Filter=>{
 if(!state)return 'new';
 if(state.card.state===State.Learning||state.card.state===State.Relearning)return 'learning';
 return state.card.scheduled_days>=21?'solid':'review';
};

export function WordsScreen(){
 const {data}=useSnapshot();
 const [query,setQuery]=useState('');
 const [filter,setFilter]=useState<Filter>('all');
 const [lessonId,setLessonId]=useState('all');
 const states=useMemo(()=>new Map(data.states.map(state=>[state.wordId,state])),[data.states]);
 const found=useMemo(()=>{
  const needle=normalize(query);
  return liveWords(data)
   .filter(word=>!needle||normalize(word.greek).includes(needle)||word.russian.toLowerCase().includes(query.trim().toLowerCase()))
   .filter(word=>filter==='all'||stateGroup(states.get(word.id))===filter)
   .filter(word=>lessonId==='all'||data.lessons.find(lesson=>lesson.id===lessonId)?.wordIds.includes(word.id))
   .sort((a,b)=>a.greek.localeCompare(b.greek,'el'));
 },[data,query,filter,lessonId,states]);
 return (
  <>
   <BrandBar/>
   <main className={ui.screen}>
    <h1>Слова</h1>
    <InputGroup className="mb-2.5">
     <InputGroupAddon><Search/></InputGroupAddon>
     <InputGroupInput type="search" value={query} onChange={event=>setQuery(event.target.value)}
      placeholder="Поиск по греческому или русскому" aria-label="Поиск слова"/>
    </InputGroup>
    <div className="flex gap-2 overflow-x-auto pb-2">
     {FILTERS.map(item=>(
      <Badge key={item.key} variant={filter===item.key?'default':'secondary'}
       render={<button type="button" aria-pressed={filter===item.key} onClick={()=>setFilter(item.key)}/>}
       className="h-8 cursor-pointer px-3.5 text-sm whitespace-nowrap">{item.label}</Badge>
     ))}
    </div>
    <Field>
     <FieldLabel htmlFor="lesson-filter">Набор</FieldLabel>
     <Select value={lessonId} onValueChange={value=>setLessonId(value??'all')}>
      <SelectTrigger id="lesson-filter" className="w-full"><SelectValue/></SelectTrigger>
      <SelectContent>
       <SelectGroup>
        <SelectItem value="all">Все наборы</SelectItem>
        {data.lessons.map(lesson=><SelectItem key={lesson.id} value={lesson.id}>{lesson.title}</SelectItem>)}
       </SelectGroup>
      </SelectContent>
     </Select>
    </Field>
    <p className="mt-3.5 mb-2 text-sm text-muted-foreground">{withCount(found.length,WORDS)}</p>
    <ItemGroup className="gap-2.5">
     {found.map(word=>{
      const group=stateGroup(states.get(word.id));
      return (
       <Item key={word.id} variant="outline" className="min-h-16 rounded-[var(--radius-card)] bg-card text-foreground" render={<Link to={`/words/${word.id}`}/>}>
        <ItemContent>
         <ItemTitle className="text-base">{word.greek}</ItemTitle>
         <ItemDescription>{word.russian} · {FILTERS.find(f=>f.key===group)!.label.toLowerCase()}</ItemDescription>
        </ItemContent>
        <ItemActions><ChevronRight className="text-muted-foreground"/></ItemActions>
       </Item>
      );
     })}
    </ItemGroup>
    {!found.length&&(
     <Empty>
      <EmptyHeader>
       <EmptyMedia variant="icon"><SearchX/></EmptyMedia>
       <EmptyTitle>Ничего не найдено</EmptyTitle>
       <EmptyDescription>Измените запрос или снимите фильтры.</EmptyDescription>
      </EmptyHeader>
     </Empty>
    )}
   </main>
  </>
 );
}
