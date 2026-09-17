import 'fake-indexeddb/auto';
import {describe, expect, it} from 'vitest';
import {defaultSettings, fillSettings, type Settings} from '../src/domain/types';
import {LexiDatabase} from '../src/storage/db';
import {loadSettings} from '../src/storage/queries';

describe('настройка отчётов об ошибках',()=>{
 it('запись без поля читается как включённая, по умолчанию отчёты включены',()=>{
  expect(defaultSettings.errorReports).toBe(true);
  const legacy={id:'settings',timezone:'Asia/Nicosia',sessionSize:20} as Settings;
  expect(fillSettings(legacy).errorReports).toBe(true);
  expect(fillSettings(undefined).errorReports).toBe(true);
 });
 it('сохранённое выключение переживает перечитывание из базы',async()=>{
  const db=new LexiDatabase('lexi-error-reports');
  await db.delete();
  await db.open();
  await db.settings.put({...defaultSettings,errorReports:false});
  expect((await loadSettings(db)).errorReports).toBe(false);
  db.close();
 });
});
