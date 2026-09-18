import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stringify} from 'yaml';
import {buildContent, type BuiltContent} from '../../content/build';

/**
 * Непубликуемая фикстура смешанного урока: собирается во временной копии исходников проекта, в основной каталог
 * не попадает. Тексты — уже существующие в проекте примеры предложений; реального материала пользователя здесь нет.
 * Курс `leeke` получает дополнительный урок `lesson-mixed`; прежние уроки собираются без изменений.
 */
const SOURCE='Существующий пример проекта, иллюстрация формата';
const verbatim=(locator:string,excerpt:string)=>({sourceLabel:SOURCE,locator,excerpt,operation:'verbatim'});
const fromSource=(locator:string,excerpt:string)=>({sourceLabel:SOURCE,locator,excerpt,operation:'cloze-from-source'});
/** Цель и объяснение размечены по отдельной просьбе, поэтому у них своё происхождение. */
const requested=(request:string)=>({sourceLabel:'Разметка по запросу',operation:'requested-transform',request});
const TARGET_REQUEST=requested('Отметить, что тренирует каждая карточка');
const withTarget=(locator:string,excerpt:string,parts:Record<string,unknown>={})=>({...fromSource(locator,excerpt),parts:{target:TARGET_REQUEST,...parts}});
export const MIXED_PHRASES:Record<string,Record<string,unknown>>={
 'p-grafo':{text:'Γράφω ένα γράμμα.',translation:'Я пишу письмо.',provenance:verbatim('content/words/γράφω.yaml, examples[0]','Γράφω ένα γράμμα.')},
 'p-vouno':{text:'Το βουνό είναι ψηλό.',translation:'Гора высокая.',usage:'Описание места',provenance:verbatim('content/words/το-βουνό.yaml, examples[0]','Το βουνό είναι ψηλό.')},
 'p-paidi':{text:'Το παιδί παίζει στο πάρκο.',translation:'Ребёнок играет в парке.',provenance:verbatim('content/words/το-παιδί.yaml, examples[0]','Το παιδί παίζει στο πάρκο.')},
 'p-anoixi':{text:'Η άνοιξη φέρνει λουλούδια.',translation:'Весна приносит цветы.',provenance:verbatim('content/words/η-άνοιξη.yaml, examples[0]','Η άνοιξη φέρνει λουλούδια.')},
 // Фраза без перевода и без аудио: доступна для просмотра, объективного упражнения нет.
 'p-silent':{text:'Το φρύδι της είναι λεπτό.',provenance:verbatim('content/words/το-φρύδι.yaml, examples[0]','Το φρύδι της είναι λεπτό.')},
};
export const SAME_TARGET={kind:'verb-form',features:{tense:'present',person:3,number:'singular'}};
export const MIXED_CLOZES:Record<string,Record<string,unknown>>={
 'c-grafo':{template:'{{gap}} ένα γράμμα.',answer:'Γράφω',acceptedAnswers:['Γράφω'],context:'Я пишу письмо.',related:{kind:'word',id:'w11-27'},
  target:{kind:'verb-form',ref:'w11-27',features:{tense:'present',person:1,number:'singular'}},provenance:withTarget('content/words/γράφω.yaml, examples[0]','Γράφω ένα γράμμα.')},
 // То же предложение, другое скрытое место — отдельная карточка без цели.
 'c-gramma':{template:'Γράφω ένα {{gap}}.',answer:'γράμμα',acceptedAnswers:['γράμμα'],context:'Я пишу письмо.',related:{kind:'phrase',id:'p-grafo'},provenance:fromSource('content/words/γράφω.yaml, examples[0]','Γράφω ένα γράμμα.')},
 'c-vouno':{template:'Το βουνό είναι {{gap}}.',answer:'ψηλό',acceptedAnswers:['ψηλό'],context:'Гора высокая.',explanation:'Прилагательное согласуется с существительным среднего рода.',
  target:{kind:'adjective-form',features:{gender:'neuter',number:'singular'}},
  provenance:withTarget('content/words/το-βουνό.yaml, examples[0]','Το βουνό είναι ψηλό.',{explanation:requested('Пояснить правило согласования')})},
 // Две карточки с одинаковой целью: прогресс у каждой свой.
 'c-paidi':{template:'Το παιδί {{gap}} στο πάρκο.',answer:'παίζει',acceptedAnswers:['παίζει'],context:'Ребёнок играет в парке.',target:SAME_TARGET,provenance:withTarget('content/words/το-παιδί.yaml, examples[0]','Το παιδί παίζει στο πάρκο.')},
 'c-anoixi':{template:'Η άνοιξη {{gap}} λουλούδια.',answer:'φέρνει',acceptedAnswers:['φέρνει'],context:'Весна приносит цветы.',target:SAME_TARGET,provenance:withTarget('content/words/η-άνοιξη.yaml, examples[0]','Η άνοιξη φέρνει λουλούδια.')},
};
export const MIXED_ITEMS=[
 {kind:'phrase',id:'p-grafo'},{kind:'word',id:'w11-27'},{kind:'cloze',id:'c-grafo'},{kind:'cloze',id:'c-gramma'},
 {kind:'phrase',id:'p-vouno'},{kind:'cloze',id:'c-vouno'},{kind:'phrase',id:'p-paidi'},{kind:'cloze',id:'c-paidi'},
 {kind:'phrase',id:'p-anoixi'},{kind:'cloze',id:'c-anoixi'},{kind:'phrase',id:'p-silent'},
];
export const MIXED_LESSON='lesson-mixed';

export interface MixedFiles {phrases?:Record<string,unknown>;clozes?:Record<string,unknown>;lesson?:Record<string,unknown>;mutate?:(root:string)=>void}
/** Сборка смешанной фикстуры с переопределениями; исходники проекта копируются во временную папку и удаляются после. */
export function buildMixed({phrases=MIXED_PHRASES,clozes=MIXED_CLOZES,lesson,mutate}:MixedFiles={}):BuiltContent{
 const root=mkdtempSync(join(tmpdir(),'lexi-mixed-'));
 for(const dir of ['words','lessons','art','courses','phrases','clozes','audio']) if(existsSync(join('content',dir)))cpSync(join('content',dir),join(root,dir),{recursive:true});
 for(const dir of ['phrases','clozes'])mkdirSync(join(root,dir),{recursive:true});
 for(const [id,doc] of Object.entries(phrases))writeFileSync(join(root,'phrases',`${id}.yaml`),stringify(doc));
 for(const [id,doc] of Object.entries(clozes))writeFileSync(join(root,'clozes',`${id}.yaml`),stringify(doc));
 const items=lesson?undefined:[...Object.keys(phrases).map(id=>({kind:'phrase',id})),{kind:'word',id:'w11-27'},...Object.keys(clozes).map(id=>({kind:'cloze',id}))];
 writeFileSync(join(root,'lessons',`${MIXED_LESSON}.yaml`),stringify(lesson??{title:'Смешанный урок',language:'el',items}));
 writeFileSync(join(root,'courses','leeke.yaml'),readFileSync('content/courses/leeke.yaml','utf8')+`  - ${MIXED_LESSON}\n`);
 mutate?.(root);
 try{return buildContent(root)}finally{rmSync(root,{recursive:true,force:true})}
}
let built:BuiltContent|null=null;
/** Стандартная смешанная фикстура: собирается один раз на прогон. */
export const mixedContent=()=>built??=buildMixed({lesson:{title:'Смешанный урок',language:'el',items:MIXED_ITEMS}});
export const mixedPackage=(content=mixedContent())=>content.packages.find(pack=>pack.id===MIXED_LESSON)!;
