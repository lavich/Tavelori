// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import type {Phrase, SessionItem, Word} from '../src/domain/types';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
// jsdom не реализует прокрутку, а раскрытый ответ подводится к верху области.
if(!Element.prototype.scrollIntoView)Element.prototype.scrollIntoView=()=>undefined;

/** Что прозвучало: важен факт и число запусков, а не сам проигрыватель. */
const spoken:string[]=[];
vi.mock('../src/shared/audio',async importOriginal=>{
 const original=await importOriginal<typeof import('../src/shared/audio')>();
 return {...original,
  playWord:async(word:Word)=>{spoken.push(word.greek);return 'voice' as const},
  playText:async(text:string)=>{spoken.push(text);return 'voice' as const}};
});

const {Assembly, Spelling}=await import('../src/features/learning/exercises');

const word=(over:Partial<Word>={}):Word=>({id:'w1',greek:'το σπίτι',russian:'дом',ipa:'to ˈspiti',
 segments:[],examples:[{greek:'Το σπίτι είναι μεγάλο.',russian:'Дом большой.',target:'σπίτι'}],
 verified:false,createdAt:'',updatedAt:'',...over});
const phrase=(over:Partial<Phrase>={}):Phrase=>({id:'p1',text:'Καλημέρα',translation:'Доброе утро',
 usage:'Приветствие до полудня',note:'Ударение на последнем слоге',
 provenance:{sourceLabel:'тест',operation:'verbatim'},createdAt:'',updatedAt:'',...over});

const wordItem=(over:Partial<Word>={},id='i1'):SessionItem=>({id,ref:{kind:'word',id:over.id??'w1'},unitKey:`word:${over.id??'w1'}`,
 card:{kind:'word',word:word(over)},type:'spelling',options:[],isNew:false,mode:'scheduled',expectedVersion:1});
const phraseItem=(over:Partial<Phrase>={}):SessionItem=>({id:'i2',ref:{kind:'phrase',id:'p1'},unitKey:'phrase:p1',
 card:{kind:'phrase',phrase:phrase(over)},type:'spelling',options:[],isNew:false,mode:'scheduled',expectedVersion:1});
const assemblyItem=(over:Partial<Word>={}):SessionItem=>({...wordItem(over,'i3'),type:'assembly',options:[]});

let root:Root|null=null, container:HTMLElement|null=null;
let answers=0;
beforeEach(()=>{spoken.length=0;answers=0});
afterEach(()=>{act(()=>root?.unmount());container?.remove();root=null;container=null});

const onAnswer=async()=>{answers++;return true};
const showSpelling=async(item:SessionItem,autoSpeak=false)=>{
 container=document.body.appendChild(document.createElement('div'));
 root=createRoot(container);
 await act(async()=>{root!.render(<Spelling item={item} onAnswer={onAnswer} onNext={()=>undefined} autoSpeak={autoSpeak}/>)});
 return container;
};
const showAssembly=async(item:SessionItem,autoSpeak=false)=>{
 container=document.body.appendChild(document.createElement('div'));
 root=createRoot(container);
 await act(async()=>{root!.render(<Assembly item={item} onAnswer={onAnswer} onNext={()=>undefined} autoSpeak={autoSpeak}/>)});
 return container;
};
const press=async(element:Element|undefined|null)=>{await act(async()=>{(element as HTMLElement).click()})};
const button=(host:HTMLElement,text:string)=>Array.from(host.querySelectorAll('button')).find(item=>item.textContent===text);
const reveal=(host:HTMLElement)=>host.querySelector('[data-testid="reveal"]');
const feedback=(host:HTMLElement)=>host.querySelector('[data-testid="feedback"]');
const speakButton=(host:Element)=>host.querySelector('[aria-label="Послушать слово"],[aria-label="Послушать фразу"],[aria-label="Озвучка недоступна"]');

const type=async(host:HTMLElement,text:string)=>{
 const input=host.querySelector('input') as HTMLInputElement;
 await act(async()=>{
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;
  setter.call(input,text);
  input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await press(button(host,'Проверить'));
};
const assemble=async(host:HTMLElement)=>{
 for(const tile of Array.from(host.querySelectorAll('[data-testid="tile"]')))await press(tile);
 await press(button(host,'Проверить'));
};

describe('раскрытие материала после письменного ответа',()=>{
 it('после ошибки в написании показывает карточку слова с озвучкой и разбор ответа',async()=>{
  const host=await showSpelling(wordItem());
  await type(host,'το σπιτι');
  const card=reveal(host);
  expect(card).not.toBeNull();
  expect(card!.textContent).toContain('το σπίτι');
  expect(card!.textContent).toContain('дом');
  expect(card!.textContent).toContain('to ˈspiti');
  expect(card!.textContent).toContain('Дом большой.');
  expect(speakButton(card!)).not.toBeNull();
  expect(host.querySelector('[data-testid="chars"]')).not.toBeNull();
  expect(answers).toBe(1);
 });

 it('после «Почти» разбор остаётся, раскрытие такое же',async()=>{
  const host=await showSpelling(wordItem());
  await type(host,'το σπιτί');
  expect(feedback(host)!.textContent).toContain('Почти');
  expect(host.querySelector('[data-testid="chars"]')).not.toBeNull();
  expect(reveal(host)!.textContent).toContain('дом');
 });

 it('после верного ответа раскрытие то же, а сравнивать нечего',async()=>{
  const host=await showSpelling(wordItem());
  await type(host,'το σπίτι');
  expect(feedback(host)!.textContent).toContain('Правильно!');
  expect(host.querySelector('[data-testid="chars"]')).toBeNull();
  expect(reveal(host)!.textContent).toContain('дом');
 });

 it('после «Не знаю» плашка не называет написание, а раскрытие называет',async()=>{
  const host=await showSpelling(wordItem());
  await press(button(host,'Не знаю'));
  const plate=feedback(host)!;
  expect(plate.textContent).not.toContain('το σπίτι');
  expect(plate.textContent).toContain('Ничего страшного');
  expect(host.querySelector('[data-testid="chars"]')).toBeNull();
  expect(reveal(host)!.textContent).toContain('το σπίτι');
 });

 it('строки «Правильно: …» в плашке больше нет',async()=>{
  const host=await showSpelling(wordItem());
  await type(host,'λάθος');
  expect(feedback(host)!.textContent).not.toContain('Правильно:');
 });

 it('задание не задваивается: перевод и картинка только в карточке',async()=>{
  const host=await showSpelling(wordItem({imageAssetId:'img-1'}));
  await type(host,'λάθος');
  expect(host.querySelectorAll('img').length).toBeLessThanOrEqual(1);
  const shown=host.textContent!.split('дом').length-1;
  expect(shown).toBe(1);
  expect(host.querySelector('input')).toBeNull();
 });

 it('до ответа раскрытия нет и написание нигде не показано',async()=>{
  const host=await showSpelling(wordItem());
  expect(reveal(host)).toBeNull();
  expect(host.textContent).not.toContain('το σπίτι');
  // В маске поля ввода открыты только первые буквы слов: остальные — пустые ячейки.
  expect(host.querySelector('[data-testid="answer-mask"]')!.textContent).toBe('τσ');
  expect(host.textContent).not.toContain('σπίτι');
 });

 it('у фразы раскрывает текст, перевод, ситуацию, примечание и даёт озвучку',async()=>{
  const host=await showSpelling(phraseItem());
  await type(host,'Καλιμερα');
  const card=reveal(host)!;
  expect(card.textContent).toContain('Καλημέρα');
  expect(card.textContent).toContain('Доброе утро');
  expect(card.textContent).toContain('Приветствие до полудня');
  expect(card.textContent).toContain('Ударение на последнем слоге');
  expect(speakButton(card)).not.toBeNull();
 });

 it('в сборке остаются слоги в плашке, а карточка слова приходит под ней',async()=>{
  const host=await showAssembly(assemblyItem({greek:'η οικογένεια',russian:'семья',examples:[]}));
  await assemble(host);
  expect(feedback(host)!.textContent).toContain('η · οι-κο-γέ-νεια');
  const card=reveal(host)!;
  expect(card.textContent).toContain('η οικογένεια');
  expect(card.textContent).toContain('семья');
  expect(speakButton(card)).not.toBeNull();
  expect(host.querySelectorAll('[data-testid="tile"]').length).toBe(0);
  expect(answers).toBe(1);
 });

 it('в сборке до ответа раскрытия нет',async()=>{
  const host=await showAssembly(assemblyItem());
  expect(reveal(host)).toBeNull();
 });
});

describe('озвучка раскрытия после письменного ответа',()=>{
 it('после ошибки звучит ровно один раз',async()=>{
  const host=await showSpelling(wordItem(),true);
  await type(host,'λάθος');
  expect(spoken).toEqual(['το σπίτι']);
 });

 it('после верного ответа тоже звучит',async()=>{
  const host=await showSpelling(wordItem(),true);
  await type(host,'το σπίτι');
  expect(spoken).toEqual(['το σπίτι']);
 });

 it('после «Не знаю» звучит',async()=>{
  const host=await showSpelling(wordItem(),true);
  await press(button(host,'Не знаю'));
  expect(spoken).toEqual(['το σπίτι']);
 });

 it('фраза звучит своим текстом',async()=>{
  const host=await showSpelling(phraseItem(),true);
  await type(host,'λάθος');
  expect(spoken).toEqual(['Καλημέρα']);
 });

 it('сборка звучит после ответа',async()=>{
  const host=await showAssembly(assemblyItem(),true);
  await assemble(host);
  expect(spoken).toEqual(['το σπίτι']);
 });

 it('до ответа задание молчит',async()=>{
  await showSpelling(wordItem(),true);
  expect(spoken).toEqual([]);
 });

 it('при выключенной настройке молчит и после ответа',async()=>{
  const host=await showSpelling(wordItem(),false);
  await type(host,'λάθος');
  expect(spoken).toEqual([]);
  expect(speakButton(reveal(host)!)).not.toBeNull();
 });

 it('следующая карточка звучит заново, даже если упражнение переиспользовали без key',async()=>{
  container=document.body.appendChild(document.createElement('div'));
  root=createRoot(container);
  const render=async(item:SessionItem)=>{
   await act(async()=>{root!.render(<Spelling item={item} onAnswer={onAnswer} onNext={()=>undefined} autoSpeak/>)});
  };
  await render(wordItem());
  await type(container,'λάθος');
  expect(spoken).toEqual(['το σπίτι']);

  const second=wordItem({id:'w2',greek:'η πόρτα',russian:'дверь',examples:[]},'i9');
  await render(second);
  expect(spoken).toEqual(['το σπίτι']); // новое задание молчит до ответа
  await type(container,'λάθος');
  expect(spoken).toEqual(['το σπίτι','η πόρτα']);
 });
});
