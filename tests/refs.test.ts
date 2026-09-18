import {describe, expect, it} from 'vitest';
import {clozeKey, parseUnitKey, phraseKey, unitKey, wordRef, type LearningRef} from '../src/domain/refs';

describe('типизированная ссылка на карточку',()=>{
 it('одинаковые ID разных видов дают разные ключи',()=>{
  const keys=(['word','phrase','cloze'] as const).map(kind=>unitKey({kind,id:'x-1'}));
  expect(new Set(keys).size).toBe(3);
 });
 it('ключ восстанавливается в ту же ссылку',()=>{
  const ref:LearningRef={kind:'cloze',id:'c-θέλω-να'};
  expect(parseUnitKey(unitKey(ref))).toEqual(ref);
 });
 it('ссылка на слово сохраняет прежний идентификатор',()=>{
  expect(wordRef('w11-01')).toEqual({kind:'word',id:'w11-01'});
 });
 it('ключ не совпадает с голым ID и не путает разделитель внутри ID',()=>{
  expect(unitKey(wordRef('w1'))).not.toBe('w1');
  expect(unitKey({kind:'word',id:'a"b'})).not.toBe(unitKey({kind:'word',id:'a\\"b'}));
  expect(parseUnitKey(unitKey({kind:'phrase',id:'a"b'}))).toEqual({kind:'phrase',id:'a"b'});
 });
 it('неизвестный вид карточки отклоняется при разборе ключа',()=>{
  expect(()=>parseUnitKey(JSON.stringify(['grammar','g1']))).toThrow(/вид карточки/);
  expect(()=>parseUnitKey('w1')).toThrow(/ключ/);
 });
});

describe('ключи дубликатов фраз и cloze',()=>{
 it('фраза — по нормализованному тексту и переводу',()=>{
  expect(phraseKey(' Καλημέρα. ','Доброе  утро')).toBe(phraseKey('καλημέρα.','доброе утро'));
  expect(phraseKey('Καλημέρα.','Доброе утро')).not.toBe(phraseKey('Καλημέρα.','Добрый день'));
  expect(phraseKey('Καλημέρα.',undefined)).not.toBe(phraseKey('Καλημέρα.','Доброе утро'));
 });
 it('cloze — по шаблону, ответу и множеству допустимых ответов, без учёта цели и порядка ответов',()=>{
  const base=clozeKey('{{gap}} ένα γράμμα.','Γράφω',['Γράφω','γράφω']);
  expect(clozeKey('{{gap}}  ένα γράμμα. ','γράφω',['γράφω','Γράφω'])).toBe(base);
  expect(clozeKey('Γράφω ένα {{gap}}.','γράμμα',['γράμμα'])).not.toBe(base);
  expect(clozeKey('{{gap}} ένα γράμμα.','Γράφω',['Γράφω','Γράφεις'])).not.toBe(base);
 });
});
