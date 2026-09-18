import {describe, expect, it} from 'vitest';
import {ContentError, parseCatalog, parsePackage, SCHEMA_VERSION, SUPPORTED_SCHEMAS, validateCloze, validateTarget, type ContentPackage} from '../src/content/schema';
import {content} from './helpers/content';

const provenance={sourceLabel:'Иллюстрация формата',locator:'fixture',excerpt:'Γράφω ένα γράμμα.',operation:'cloze-from-source' as const};
const word=content.packages[0].words[0];
const phrase={id:'p-1',text:'Καλημέρα.',translation:'Доброе утро.',provenance:{...provenance,operation:'verbatim' as const},revision:'r1'};
const cloze={id:'c-1',template:'{{gap}} ένα γράμμα.',answer:'Γράφω',acceptedAnswers:['Γράφω'],provenance,revision:'r2',target:{kind:'verb-form',ref:'w-grafo',features:{tense:'present',person:1,number:'singular',finite:true}}};
const mixed:Record<string,unknown>={
 schemaVersion:3,id:'mixed',courseId:'c',version:'v1',language:'el',lesson:{title:'Смешанный'},
 words:[word],phrases:[phrase],clozes:[cloze],
 items:[{kind:'phrase',id:'p-1',position:0},{kind:'word',id:word.id,position:1},{kind:'cloze',id:'c-1',position:2}],
 media:content.packages[0].media.filter(item=>item.id===word.imageAssetId||item.id===word.audioAssetId),
};

describe('пакет схемы 3',()=>{
 it('текущая версия — 3, читаются версии 2 и 3',()=>{
  expect(SCHEMA_VERSION).toBe(3);
  expect(SUPPORTED_SCHEMAS).toEqual([2,3]);
 });
 it('смешанный пакет проходит проверку и сохраняет порядок карточек и цель целиком',()=>{
  const pack=parsePackage(mixed);
  expect(pack.items.map(item=>[item.kind,item.id])).toEqual([['phrase','p-1'],['word',word.id],['cloze','c-1']]);
  expect(pack.phrases[0]).toMatchObject({text:'Καλημέρα.',translation:'Доброе утро.'});
  expect(pack.clozes[0].target).toEqual(cloze.target);
  expect(pack.clozes[0].acceptedAnswers).toEqual(['Γράφω']);
  // словарные связи остаются для прежнего кода клиента и следуют позициям items
  expect(pack.links).toEqual([{wordId:word.id,position:1}]);
 });
 it('пакет без слов допустим при наличии других карточек',()=>{
  const pack=parsePackage({...mixed,words:[],media:[],items:[{kind:'phrase',id:'p-1',position:0},{kind:'cloze',id:'c-1',position:1}]});
  expect(pack.words).toEqual([]);
  expect(pack.items).toHaveLength(2);
  expect(()=>parsePackage({...mixed,words:[],phrases:[],clozes:[],media:[],items:[]})).toThrow(/нет карточек/);
 });
 it('неизвестный вид цели с допустимой формой сохраняется без изменений',()=>{
  const pack=parsePackage({...mixed,clozes:[{...cloze,target:{kind:'future-thing',features:{'some-flag':false,level:2}}}]});
  expect(pack.clozes[0].target).toEqual({kind:'future-thing',features:{'some-flag':false,level:2}});
 });
 it('отклоняет неверные ссылки, дубликаты и вид карточки',()=>{
  expect(()=>parsePackage({...mixed,items:[...(mixed.items as unknown[]),{kind:'cloze',id:'нет',position:3}]})).toThrow(/которой нет в пакете/);
  expect(()=>parsePackage({...mixed,items:[...(mixed.items as unknown[]),{kind:'grammar',id:'g',position:3}]})).toThrow(/вид карточки/);
  expect(()=>parsePackage({...mixed,items:[...(mixed.items as unknown[]),{kind:'phrase',id:'p-1',position:3}]})).toThrow(/повторяются/);
  expect(()=>parsePackage({...mixed,clozes:[cloze,cloze]})).toThrow(/повторяются/);
  expect(()=>parsePackage({...mixed,items:(mixed.items as {position:number}[]).map(item=>({...item,position:0}))})).toThrow(/повторяются/);
 });
 it('отклоняет неверную разметку пропуска и ответы',()=>{
  const bad=(patch:Partial<typeof cloze>)=>()=>parsePackage({...mixed,clozes:[{...cloze,...patch}]});
  expect(bad({template:'Γράφω ένα γράμμα.'})).toThrow(/ровно один/);
  expect(bad({template:'{{gap}} ένα {{gap}}.'})).toThrow(/ровно один/);
  expect(bad({answer:'  '})).toThrow(/пуст/);
  expect(bad({acceptedAnswers:[]})).toThrow(/допустимых ответов/);
  expect(bad({acceptedAnswers:['Γράφεις']})).toThrow(/канонический ответ/);
  expect(bad({template:'Γρά{{gap}} ένα γράμμα.'})).toThrow(/часть слова/);
  expect(bad({template:'{{gap}}ένα γράμμα.'})).toThrow(/часть слова/);
 });
 it('отклоняет неверную форму цели и принимает kebab-case',()=>{
  const bad=(target:unknown)=>()=>parsePackage({...mixed,clozes:[{...cloze,target}]});
  expect(bad({kind:''})).toThrow(/kebab-case/);
  expect(bad({kind:'verbForm'})).toThrow(/kebab-case/);
  expect(bad({kind:'verb_form'})).toThrow(/kebab-case/);
  expect(bad({kind:'verb-form',features:{Tense:'present'}})).toThrow(/kebab-case/);
  expect(bad({kind:'verb-form',features:{tense:{nested:true}}})).toThrow(/строка, число или да\/нет/);
  expect(bad({kind:'verb-form',features:{tense:null}})).toThrow(/строка, число или да\/нет/);
  expect(bad({kind:'verb-form',features:{tense:['a']}})).toThrow(/строка, число или да\/нет/);
  expect(bad({kind:'verb-form',ref:''})).toThrow(/ref/);
  expect(bad('verb-form')).toThrow(/объект/);
  expect(validateTarget({kind:'article-choice',features:{'word-order':'svo',person:3,plural:false}},'x')).toEqual({kind:'article-choice',features:{'word-order':'svo',person:3,plural:false}});
 });
 it('требует происхождение с операцией и запрос для преобразования и генерации',()=>{
  const bad=(patch:Record<string,string|undefined>)=>()=>parsePackage({...mixed,clozes:[{...cloze,provenance:{...provenance,...patch}}]});
  expect(()=>parsePackage({...mixed,clozes:[{...cloze,provenance:undefined}]})).toThrow(/provenance/);
  expect(bad({operation:'guessed'})).toThrow(/операция/);
  expect(bad({operation:'requested-transform'})).toThrow(/request/);
  expect(bad({operation:'requested-generation'})).toThrow(/request/);
  expect(bad({sourceLabel:''})).toThrow(/sourceLabel/);
  expect(parsePackage({...mixed,clozes:[{...cloze,provenance:{sourceLabel:'Агент по запросу',operation:'requested-generation',request:'составь пример'}}]}).clozes[0].provenance.operation).toBe('requested-generation');
 });
 it('validateCloze проверяет форму карточки вне пакета',()=>{
  expect(()=>validateCloze({...cloze,acceptedAnswers:['Γράφω','']},'x')).toThrow(/пуст/);
  expect(validateCloze(cloze,'x').answer).toBe('Γράφω');
 });
});

describe('совместимость со схемой 2',()=>{
 const v2=JSON.parse(content.files.find(file=>file.path===content.catalog.lessons[0].url)!.body as string) as ContentPackage;
 const legacy=()=>{
  const {phrases:_p,clozes:_c,items,...rest}=v2 as unknown as Record<string,unknown>&{items:{kind:string;id:string;position:number}[]};
  return {...rest,schemaVersion:2,links:items.filter(item=>item.kind==='word').map(item=>({wordId:item.id,position:item.position}))};
 };
 it('словарный пакет схемы 2 читается как урок из слов в прежнем порядке',()=>{
  const pack=parsePackage(legacy());
  expect(pack.schemaVersion).toBe(2);
  expect(pack.items.map(item=>item.kind)).toEqual(pack.items.map(()=>'word'));
  expect(pack.items.map(item=>item.id)).toEqual(v2.items.filter(item=>item.kind==='word').map(item=>item.id));
  expect(pack.phrases).toEqual([]);
  expect(pack.clozes).toEqual([]);
 });
 it('пакет схемы 2 не принимает смешанные поля молча',()=>{
  expect(()=>parsePackage({...legacy(),phrases:[phrase]})).toThrow(/схемы 2/);
 });
 it('каталог схемы 2 читается с нулевыми счётчиками новых видов',()=>{
  const raw=JSON.parse(content.files.find(file=>file.path==='content/catalog.json')!.body as string);
  const old={...raw,schemaVersion:2,lessons:raw.lessons.map(({phraseCount:_a,clozeCount:_b,cardCount:_c,...entry}:Record<string,unknown>)=>entry)};
  const catalog=parseCatalog(old);
  expect(catalog.lessons[0]).toMatchObject({phraseCount:0,clozeCount:0,cardCount:catalog.lessons[0].wordCount});
 });
 it('неизвестные версии отклоняются как неподдерживаемые',()=>{
  for(const version of [1,4]){
   try{parsePackage({...v2,schemaVersion:version});expect.unreachable()}catch(error){expect((error as ContentError).kind).toBe('unsupported')}
  }
 });
});
