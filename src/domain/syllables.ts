const VOWELS='αεηιουωάέήίόύώϊϋΐΰ';
const ACCENTED='άέήίόύώΐΰ';
const DIGRAPHS=['ου','ού','ει','εί','οι','οί','αι','αί','αυ','αύ','ευ','εύ','υι','ηυ'];
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

/** Плитки для упражнения: артикль отдельной плиткой, затем слоги слова. */
export const tiles=(greek:string):string[]=>
 greek.normalize('NFC').trim().split(/\s+/).filter(Boolean).flatMap(splitSyllables);
