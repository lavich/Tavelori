import {describe, expect, it} from 'vitest';
import {assemblyOptions, checkAssembly, formatSyllables, restoreAssembly, restoreWriting, splitSyllables, splitWriting, tiles} from '../src/domain/syllables';
import {buildContent} from '../content/build';
const seedWords=buildContent().words;

describe('деление на слоги',()=>{
 it.each([
  ['σπίτι',['σπί','τι']],
  ['δέντρο',['δέ','ντρο']],
  ['μπάλα',['μπά','λα']],
  ['θάλασσα',['θά','λασ','σα']],
  ['παππούς',['παπ','πούς']],
  ['μπαλκόνι',['μπαλ','κό','νι']],
  ['βάρκα',['βάρ','κα']],
  ['αδελφός',['α','δελ','φός']],
  ['πατέρας',['πα','τέ','ρας']],
  ['σοκολάτα',['σο','κο','λά','τα']],
  ['κρεβάτι',['κρε','βά','τι']],
  ['σχολείο',['σχο','λεί','ο']],
  ['βιβλίο',['βι','βλί','ο']],
  ['φως',['φως']],
  ['τρώω',['τρώ','ω']],
  ['ακούω',['α','κού','ω']],
  ['είμαι',['εί','μαι']],
  ['μαθαίνω',['μα','θαί','νω']],
 ])('%s → %s',(word,expected)=>expect(splitSyllables(word)).toEqual(expected));

 it.each([
  ['διαβάζω',['δια','βά','ζω']],
  ['καρδιά',['καρ','διά']],
  ['μαλλιά',['μαλ','λιά']],
  ['οικογένεια',['οι','κο','γέ','νεια']],
  ['ήλιος',['ή','λιος']],
  ['γιαγιά',['για','γιά']],
  ['γιος',['γιος']],
  ['μπάνιο',['μπά','νιο']],
  ['σπάνια',['σπά','νια']],
 ])('синизеса: %s → %s',(word,expected)=>expect(splitSyllables(word)).toEqual(expected));

 it('отделяет артикль от слогов слова',()=>{
  expect(splitWriting('το σπίτι')).toEqual({article:'το',tokens:[['σπί','τι']],syllables:['σπί','τι']});
  expect(splitWriting('η οικογένεια')).toEqual({article:'η',tokens:[['οι','κο','γέ','νεια']],syllables:['οι','κο','γέ','νεια']});
  expect(splitWriting('το φως')).toEqual({article:'το',tokens:[['φως']],syllables:['φως']});
  expect(splitWriting('διαβάζω')).toEqual({article:null,tokens:[['δια','βά','ζω']],syllables:['δια','βά','ζω']});
  expect(splitWriting('καλή μέρα')).toEqual({article:null,tokens:[['κα','λή'],['μέ','ρα']],syllables:['κα','λή','μέ','ρα']});
  expect(tiles('τα μαλλιά')).toEqual(['μαλ','λιά']);
 });

 it('ничего не теряет и не добавляет ни в одном исходном слове',()=>{
  for(const word of seedWords){
   const parts=tiles(word.greek);
   expect(restoreWriting(word.greek,parts),word.greek).toBe(word.greek.normalize('NFC').trim());
   expect(parts.every(part=>part.length>0),word.greek).toBe(true);
  }
 });
 it('односложные слова считаются по слову без артикля',()=>{
  const short=seedWords.filter(word=>tiles(word.greek).length<2).map(word=>word.greek);
  expect(short).toEqual(['Γεια','γκρι','η Γη','και','μπλε','ο γιος','πού','Ροζ','στο','το φως']);
 });
 it('восстанавливает пробелы и форматирует обратную связь',()=>{
  expect(restoreWriting('η οικογένεια',['οι','κο','γέ','νεια'])).toBe('η οικογένεια');
  expect(restoreWriting('καλή μέρα',['κα','λή','μέ','ρα'])).toBe('καλή μέρα');
  expect(formatSyllables('η οικογένεια')).toBe('η · οι-κο-γέ-νεια');
  expect(formatSyllables('διαβάζω')).toBe('δια-βά-ζω');
 });
 it('дополняет артиклем пул старой сессии, не трогая пул с артиклем',()=>{
  expect(assemblyOptions('η οικογένεια',['κο','νεια','οι','γέ'])).toEqual(['η','κο','νεια','οι','γέ']);
  expect(assemblyOptions('η οικογένεια',['κο','η','νεια','οι','γέ'])).toEqual(['κο','η','νεια','οι','γέ']);
  expect(assemblyOptions('διαβάζω',['βά','δια','ζω'])).toEqual(['βά','δια','ζω']);
  expect(assemblyOptions('το φρούτο',['το','φρού'])).toEqual(['το','το','φρού']);
  expect(assemblyOptions('το φρούτο',['το','φρού','το'])).toEqual(['το','φρού','το']);
 });
 it('восстанавливает написание из выложенных плиток, считая первую местом артикля',()=>{
  expect(restoreAssembly('η οικογένεια',['η','οι','κο','γέ','νεια'])).toBe('η οικογένεια');
  expect(restoreAssembly('το φρούτο',['το','φρού','το'])).toBe('το φρούτο');
  expect(restoreAssembly('η οικογένεια',['οι','κο','γέ','νεια','η'])).toBe('οι κογένειαη');
  expect(restoreAssembly('διαβάζω',['δια','βά','ζω'])).toBe('διαβάζω');
  expect(restoreAssembly('καλή μέρα',['κα','λή','μέ','ρα'])).toBe('καλή μέρα');
 });
});

describe('проверка сборки',()=>{
 it('верное написание засчитывается',()=>{
  expect(checkAssembly('η οικογένεια',['η','οι','κο','γέ','νεια'])).toEqual({status:'correct',answer:'η οικογένεια',message:'Правильно!'});
  expect(checkAssembly('διαβάζω',['δια','βά','ζω']).status).toBe('correct');
  expect(checkAssembly('το φρούτο',['το','φρού','το']).status).toBe('correct');
 });
 it('верные слоги и артикль не на месте дают «Почти»',()=>{
  const result=checkAssembly('η οικογένεια',['οι','κο','γέ','νεια','η']);
  expect(result.status).toBe('almost');
  expect(result.message).toBe('Почти! Проверь артикль.');
  expect(checkAssembly('η οικογένεια',['οι','κο','η','γέ','νεια']).status).toBe('almost');
  expect(checkAssembly('το φρούτο',['φρού','το','το']).status).toBe('almost');
 });
 it('неверный порядок слогов остаётся ошибкой',()=>{
  expect(checkAssembly('η οικογένεια',['η','κο','οι','γέ','νεια'])).toEqual({status:'wrong',answer:'η κοοιγένεια',message:'Пока не сходится — посмотри написание.'});
  expect(checkAssembly('η οικογένεια',['κο','οι','γέ','νεια','η']).status).toBe('wrong');
  expect(checkAssembly('το φρούτο',['το','το','φρού']).status).toBe('wrong');
  expect(checkAssembly('διαβάζω',['βά','δια','ζω'])).toEqual({status:'wrong',answer:'βάδιαζω',message:'Пока не сходится — посмотри порядок слогов.'});
 });
});
