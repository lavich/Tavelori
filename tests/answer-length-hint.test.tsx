// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {Assembly, ClozeExercise, Spelling} from '../src/features/learning/exercises';
import type {Cloze, Phrase, SessionItem, Word} from '../src/domain/types';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
if(!Element.prototype.scrollIntoView)Element.prototype.scrollIntoView=()=>undefined;

const word=(over:Partial<Word>={}):Word=>({id:'w1',greek:'το σπίτι',russian:'дом',ipa:'to ˈspiti',
 segments:[],examples:[],verified:false,createdAt:'',updatedAt:'',...over});
const phrase=(over:Partial<Phrase>={}):Phrase=>({id:'p1',text:'Πώς σε λένε;',translation:'Как тебя зовут?',
 provenance:{sourceLabel:'тест',operation:'verbatim'},createdAt:'',updatedAt:'',...over});
const cloze=(over:Partial<Cloze>={}):Cloze=>({id:'c1',template:'{{gap}} ένα γράμμα.',answer:'Γράφω',
 acceptedAnswers:['Γράφω'],provenance:{sourceLabel:'тест',operation:'cloze-from-source'},createdAt:'',updatedAt:'',...over});

const wordItem=(over:Partial<Word>={}):SessionItem=>({id:'i1',ref:{kind:'word',id:'w1'},unitKey:'word:w1',
 card:{kind:'word',word:word(over)},type:'spelling',options:[],isNew:false,mode:'scheduled',expectedVersion:1});
const phraseItem=():SessionItem=>({id:'i2',ref:{kind:'phrase',id:'p1'},unitKey:'phrase:p1',
 card:{kind:'phrase',phrase:phrase()},type:'spelling',options:[],isNew:false,mode:'scheduled',expectedVersion:1});
const clozeItem=(over:Partial<Cloze>={},options:string[]=[]):SessionItem=>({id:'i3',ref:{kind:'cloze',id:'c1'},
 unitKey:'["cloze","c1"]',card:{kind:'cloze',cloze:cloze(over)},type:'cloze',options,isNew:false,mode:'practice',expectedVersion:1});
const assemblyItem=():SessionItem=>({...wordItem(),id:'i4',type:'assembly',options:['τι','σπί']});

let root:Root|null=null, container:HTMLElement|null=null;
let answers=0;
beforeEach(()=>{answers=0});
afterEach(()=>{act(()=>root?.unmount());container?.remove();root=null;container=null});

const onAnswer=async()=>{answers++;return true};
const show=async(element:React.ReactElement)=>{
 container=document.body.appendChild(document.createElement('div'));
 root=createRoot(container);
 await act(async()=>{root!.render(element)});
 return container;
};
const showSpelling=(item:SessionItem)=>show(<Spelling item={item} onAnswer={onAnswer} onNext={()=>undefined}/>);
const showCloze=(item:SessionItem)=>show(<ClozeExercise item={item} onAnswer={onAnswer} onNext={()=>undefined}/>);
const press=async(element:Element|undefined|null)=>{await act(async()=>{(element as HTMLElement).click()})};
const button=(host:HTMLElement,text:string)=>Array.from(host.querySelectorAll('button')).find(item=>item.textContent===text);
const mask=(host:HTMLElement)=>host.querySelector('[data-testid="answer-mask"]');
/** Читаемая запись маски: пустая ячейка — подчёркивание, показанный знак — сам знак, пробел — граница группы. */
const shown=(host:HTMLElement)=>Array.from(mask(host)!.querySelectorAll('[data-testid="mask-word"]'))
 .map(group=>Array.from(group.children).map(cell=>cell.textContent||'_').join('')).join(' ');
const note=(host:HTMLElement)=>Array.from(host.querySelectorAll('.sr-only')).map(item=>item.textContent).find(text=>text?.startsWith('Ответ из'));

const type=async(host:HTMLElement,text:string)=>{
 const input=host.querySelector('input') as HTMLInputElement;
 await act(async()=>{
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;
  setter.call(input,text);
  input.dispatchEvent(new Event('input',{bubbles:true}));
 });
};

describe('подсказка длины ответа',()=>{
 it('в написании слова открывает первую букву и прячет остальные',async()=>{
  const host=await showSpelling(wordItem({greek:'σπίτι'}));
  expect(shown(host)).toBe('σ____');
  expect(note(host)).toBe('Ответ из 5 букв, первая σ');
 });
 it('слово с артиклем даёт две группы',async()=>{
  const host=await showSpelling(wordItem());
  expect(shown(host)).toBe('τ_ _____');
  expect(note(host)).toBe('Ответ из 2 слов, 7 букв, первая τ');
 });
 it('во фразе знак препинания показан как есть и в счёт не входит',async()=>{
  const host=await showSpelling(phraseItem());
  expect(shown(host)).toBe('Π__ __ ____;');
  expect(note(host)).toBe('Ответ из 3 слов, 9 букв, первая Π');
 });
 it('маска лежит в самом поле ввода и скрыта от экранного диктора',async()=>{
  const host=await showSpelling(wordItem());
  const input=host.querySelector('input')!;
  expect(mask(host)!.getAttribute('aria-hidden')).toBe('true');
  expect(mask(host)!.parentElement!.contains(input)).toBe(true);
 });
 it('кроме первой буквы ожидаемое написание до ответа в DOM не попадает',async()=>{
  const host=await showSpelling(wordItem());
  expect(shown(host)).toBe('τ_ _____');
  expect(host.textContent).not.toContain('σπίτι');
  expect(host.textContent).not.toContain('πίτι');
  expect(host.textContent).not.toContain('το ');
 });
 it('с первым введённым символом маска уходит из поля',async()=>{
  const host=await showSpelling(wordItem({greek:'σπίτι'}));
  await type(host,'σπ');
  expect(mask(host)).toBeNull();
  expect(note(host)).toBeUndefined();
  expect((host.querySelector('input') as HTMLInputElement).value).toBe('σπ');
 });
 it('после очистки поля маска возвращается прежней',async()=>{
  const host=await showSpelling(wordItem({greek:'σπίτι'}));
  await type(host,'σπ');
  await type(host,'');
  expect(shown(host)).toBe('σ____');
 });
 it('после сохранённого ответа маски нет, а написание раскрыто',async()=>{
  const host=await showSpelling(wordItem({greek:'σπίτι'}));
  await type(host,'σπίτι');
  await press(button(host,'Проверить'));
  expect(mask(host)).toBeNull();
  expect(note(host)).toBeUndefined();
  expect(host.querySelector('[data-testid="reveal"]')!.textContent).toContain('σπίτι');
  expect(answers).toBe(1);
 });
 it('в пропуске маска показана, когда все допустимые ответы одной структуры',async()=>{
  const host=await showCloze(clozeItem({acceptedAnswers:['Γράφω','γράφω']}));
  expect(shown(host)).toBe('Γ____');
  expect(note(host)).toBe('Ответ из 5 букв, первая Γ');
  expect(host.textContent).not.toContain('Γράφω');
  expect(host.textContent).not.toContain('ράφω');
 });
 it('в пропуске маски нет, когда допустимые ответы различаются по структуре',async()=>{
  const host=await showCloze(clozeItem({acceptedAnswers:['Γράφω','Εγώ γράφω']}));
  expect(mask(host)).toBeNull();
  expect(note(host)).toBeUndefined();
  expect(host.querySelector('input')).not.toBeNull();
 });
 it('в пропуске маски нет, когда допустим вариант с артиклем',async()=>{
  const host=await showCloze(clozeItem({answer:'τηλεόραση',acceptedAnswers:['τηλεόραση','την τηλεόραση']}));
  expect(mask(host)).toBeNull();
 });
 it('в пропуске маска исчезает после ответа',async()=>{
  const host=await showCloze(clozeItem());
  await type(host,'Γράφω');
  await press(button(host,'Проверить'));
  expect(mask(host)).toBeNull();
  expect(answers).toBe(1);
 });
 it('вариант пропуска с кнопками маски не показывает',async()=>{
  const host=await showCloze(clozeItem({},['Γράφω','Διαβάζω','Τρώω','Πίνω']));
  expect(host.querySelectorAll('[data-testid="cloze-option"]')).toHaveLength(4);
  expect(mask(host)).toBeNull();
 });
 it('сборка из слогов маски не показывает',async()=>{
  const host=await show(<Assembly item={assemblyItem()} onAnswer={onAnswer} onNext={()=>undefined}/>);
  expect(host.querySelectorAll('[data-testid="tile"]').length).toBeGreaterThan(1);
  expect(mask(host)).toBeNull();
 });
 it('ответ из одной буквы её не открывает и склоняется в подписи',async()=>{
  const host=await showCloze(clozeItem({template:'{{gap}} γιος είναι εδώ.',answer:'ο',acceptedAnswers:['ο']}));
  expect(shown(host)).toBe('_');
  expect(note(host)).toBe('Ответ из 1 буквы');
 });
});
