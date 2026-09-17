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

describe('границы данных в сообщениях ошибок',()=>{
 it('ошибка сохранения ответа не несёт слово, перевод и ответ пользователя ни в сообщении, ни в стеке',async()=>{
  const {LexiDatabase}=await import('../src/storage/db');
  const {dexieSource}=await import('../src/storage/queries');
  const {makeSession}=await import('../src/domain/learning');
  const {recordAnswer}=await import('../src/storage/ops');
  const {installLessons}=await import('./helpers/content');
  const db=new LexiDatabase('lexi-error-message');
  await db.delete();await db.open();
  await installLessons(db,['lesson-1-1']);
  const now=new Date('2026-09-16T09:00:00Z');
  const session=await makeSession({source:dexieSource(db),now,random:()=>0.3});
  await db.sessions.add(session);
  const item=session.items.find(entry=>entry.type!=='recall')!;
  const secret=[item.word.greek,item.word.russian,'мой тайный ответ'];
  const failures:unknown[]=[];
  // Конфликт версий: слово уже отвечено в другой вкладке.
  await recordAnswer({session,item:{...item,expectedVersion:99},correct:false,answer:secret[2],responseTimeMs:1,activeTimeMs:1,timezone:'UTC',now,database:db}).catch(error=>failures.push(error));
  // Отказ хранилища: база закрыта.
  db.close();
  await recordAnswer({session,item,correct:true,answer:secret[2],responseTimeMs:1,activeTimeMs:1,timezone:'UTC',now,database:db}).catch(error=>failures.push(error));
  expect(failures).toHaveLength(2);
  for(const failure of failures){
   const text=[String(failure),(failure as Error).message,(failure as Error).stack??''].join('\n');
   for(const word of secret)expect(text).not.toContain(word);
  }
 });
});
