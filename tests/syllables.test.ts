import {describe, expect, it} from 'vitest';
import {splitSyllables, tiles} from '../src/domain/syllables';
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

 it('артикль остаётся отдельной плиткой',()=>{
  expect(tiles('το σπίτι')).toEqual(['το','σπί','τι']);
  expect(tiles('η οικογένεια')).toEqual(['η','οι','κο','γέ','νεια']);
  expect(tiles('τα μαλλιά')).toEqual(['τα','μαλ','λιά']);
 });

 it('ничего не теряет и не добавляет ни в одном исходном слове',()=>{
  for(const word of seedWords){
   const parts=tiles(word.greek);
   expect(parts.join(''),word.greek).toBe(word.greek.replace(/\s+/g,''));
   expect(parts.every(part=>part.length>0),word.greek).toBe(true);
  }
 });
 it('все исходные слова, кроме односложных без артикля, дают минимум две плитки',()=>{
  const short=seedWords.filter(word=>tiles(word.greek).length<2).map(word=>word.greek);
  expect(short).toEqual([]);
 });
});
