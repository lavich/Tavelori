const VOWELS='αεηιουωάέήίόύώϊϋΐΰ';
const ACCENTED='άέήίόύώΐΰ';
const DIGRAPHS=['ου','ού','ει','εί','οι','οί','αι','αί','αυ','αύ','ευ','εύ','υι','ηυ'];
const ARTICLES=new Set(['ο','η','το','οι','τα','τον','την','τους','τις']);
/** Сочетания, с которых начинаются греческие слова: такие пары уходят к следующему слогу целиком. */
const ONSETS=new Set([
 'βγ','βδ','βλ','βρ','γδ','γκ','γλ','γν','γρ','δρ','θλ','θν','θρ','κλ','κν','κρ','κτ','μν','μπ','ντ',
 'πλ','πν','πρ','πτ','σβ','σγ','σθ','σκ','σλ','σμ','σν','σπ','στ','σφ','σχ','τζ','τμ','τρ','τσ',
 'φθ','φλ','φρ','φτ','χθ','χλ','χν','χρ','χτ',
]);
const lower=(value:string)=>value.toLocaleLowerCase('el');
const isVowel=(char:string)=>VOWELS.includes(lower(char));
const isAccented=(part:string)=>[...part].some(char=>ACCENTED.includes(lower(char)));
const endsWithSoftI=(part:string)=>{const last=lower(part.at(-1)??'');return last==='ι'||last==='υ'};

interface Nucleus {start:number;end:number}
function nuclei(word:string):Nucleus[]{
 const text=lower(word), found:Nucleus[]=[];
 for(let i=0;i<text.length;){
  if(DIGRAPHS.includes(text.slice(i,i+2))){found.push({start:i,end:i+2});i+=2;continue}
  if(isVowel(text[i])){found.push({start:i,end:i+1});i+=1;continue}
  i+=1;
 }
 // Синизеса: безударные ι и υ сливаются со следующей гласной — διαβάζω звучит в три слога, не в четыре.
 const merged:Nucleus[]=[];
 for(const item of found){
  const previous=merged[merged.length-1];
  const part=word.slice(item.start,item.end);
  if(previous&&previous.end===item.start&&endsWithSoftI(word.slice(previous.start,previous.end))
   &&!isAccented(word.slice(previous.start,previous.end))&&!DIGRAPHS.includes(lower(part))){
   previous.end=item.end;
   continue;
  }
  merged.push({...item});
 }
 return merged;
}

/** Где заканчивается слог: согласные между гласными делятся по правилам начала слова. */
function boundary(word:string,from:number,to:number):number{
 const cluster=lower(word.slice(from,to));
 if(cluster.length===0)return from;
 if(cluster.length===1)return from;
 if(cluster[0]===cluster[1])return from+1; // двойные согласные делятся: παπ-πούς
 if(cluster.length===2)return ONSETS.has(cluster)?from:from+1;
 return ONSETS.has(cluster.slice(0,2))?from:from+1;
}

/** Делит одно греческое слово на слоги, сохраняя ударения и конечную сигму. */
export function splitSyllables(word:string):string[]{
 const text=word.normalize('NFC');
 const cores=nuclei(text);
 if(cores.length<2)return text?[text]:[];
 const parts:string[]=[];
 let start=0;
 for(let index=0;index<cores.length-1;index++){
  const cut=boundary(text,cores[index].end,cores[index+1].start);
  parts.push(text.slice(start,cut));
  start=cut;
 }
 parts.push(text.slice(start));
 return parts.filter(part=>part.length>0);
}

export interface SyllableWriting {
 article:string|null;
 /** Слоги каждого токена после артикля; границы нужны для восстановления пробелов. */
 tokens:string[][];
 syllables:string[];
}

/** Отделяет ведущий определённый артикль и делит остальные токены на слоги. */
export function splitWriting(greek:string):SyllableWriting{
 const parts=greek.normalize('NFC').trim().split(/\s+/).filter(Boolean);
 const article=parts.length>1&&ARTICLES.has(lower(parts[0]))?parts.shift()!:null;
 const tokens=parts.map(splitSyllables);
 return {article,tokens,syllables:tokens.flat()};
}

/** Восстанавливает написание, сохраняя исходные границы токенов и пробел после артикля. */
export function restoreWriting(greek:string,ordered:string[]):string{
 const writing=splitWriting(greek);
 let offset=0;
 const tokens=writing.tokens.map(token=>{
  const restored=ordered.slice(offset,offset+token.length).join('');
  offset+=token.length;
  return restored;
 });
 return [writing.article,...tokens].filter((part):part is string=>part!==null).join(' ').normalize('NFC').trim();
}

/** Плитки упражнения содержат только слоги самого слова, без артикля. */
export const tiles=(greek:string):string[]=>splitWriting(greek).syllables;

/** Старые сессии хранили артикль среди вариантов; убираем его, только если он лишний: слог тоже может писаться как артикль (το φρού-το). */
export function assemblyOptions(greek:string,options:string[]):string[]{
 const {article,syllables}=splitWriting(greek);
 if(!article)return options;
 const matches=(value:string)=>value.normalize('NFC')===article;
 const expected=syllables.filter(matches).length;
 const present=options.filter(matches).length;
 if(present<=expected)return options;
 const articleIndex=options.findIndex(matches);
 return options.filter((_,index)=>index!==articleIndex);
}

/** Человекочитаемая запись правильного ответа: артикль · сло-ги. */
export function formatSyllables(greek:string):string{
 const writing=splitWriting(greek);
 const word=writing.tokens.map(token=>token.join('-')).join(' ');
 return writing.article?`${writing.article} · ${word}`:word;
}

export type MaskSymbol={kind:'hidden'}|{kind:'lead';char:string}|{kind:'mark';char:string};
export interface WritingMask {
 /** Группы по словам исходного написания: пробел не символ маски, а граница группы. */
 groups:MaskSymbol[][];
 letters:number;
}

const isLetter=(char:string)=>/[\p{L}\p{N}]/u.test(char);

/**
 * Маска подсказки длины: буквы скрыты, знаки показаны — подчёркивание обещало бы букву там, где её нет.
 * Скрытый символ не хранит саму букву: до ответа ожидаемое написание не должно жить и в модели.
 * `lead` открывает первую букву каждого слова — и артикля, и самого слова: подсказка, с чего начать каждое.
 * У ответа из одной буквы она не открывается: это был бы весь ответ целиком.
 */
export function maskWriting(greek:string,options:{lead?:boolean}={}):WritingMask{
 const tokens=greek.normalize('NFC').trim().split(/\s+/).filter(Boolean).map(token=>[...token]);
 const letters=tokens.flat().filter(isLetter).length;
 const lead=!!options.lead&&letters>1;
 const groups=tokens.map(token=>{
  let shown=false;
  return token.map((char):MaskSymbol=>{
   if(!isLetter(char))return {kind:'mark',char};
   if(lead&&!shown){shown=true;return {kind:'lead',char}}
   return {kind:'hidden'};
  });
 });
 return {groups,letters};
}

/** Структура маски без открытой буквы: по ней сравниваются допустимые ответы. */
const maskShape=(mask:WritingMask)=>mask.groups.map(group=>group.map(symbol=>symbol.kind==='mark'?symbol.char:'_').join('')).join(' ');

/**
 * Общая маска допустимых ответов или её отсутствие. Разные по структуре варианты общей маски не имеют, а маска
 * по одному из них отсекала бы остальные: «τηλεόραση» и «την τηλεόραση» одинаково верны, и подсказка из девяти
 * букв заставила бы отбросить ответ из двух слов. Тогда лучше не подсказывать вовсе. Открытая буква берётся из
 * канонического написания: варианты могут различаться регистром, а на структуру это не влияет.
 */
export function agreedMask(forms:readonly string[]):WritingMask|null{
 const usable=forms.filter(form=>form.trim());
 if(!usable.length)return null;
 const shapes=usable.map(form=>maskShape(maskWriting(form)));
 return shapes.every(shape=>shape===shapes[0])?maskWriting(usable[0],{lead:true}):null;
}
