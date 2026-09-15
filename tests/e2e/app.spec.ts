import {expect, test} from '@playwright/test';
import {ready, seedQueue} from './helpers';

test.beforeEach(async({page})=>{
 await page.goto('/');
 await ready(page);
});

test('оболочка открывается, разделы доступны с клавиатуры',async({page})=>{
 await expect(page.getByRole('heading',{name:'Немного каждый день'})).toBeVisible();
 await expect(page.getByText('Урок 1.2')).toBeVisible();
 await page.locator('.nav').getByRole('link',{name:'Слова'}).click();
 await expect(page.getByRole('heading',{name:'Слова'})).toBeVisible();
 await page.locator('.nav').getByRole('link',{name:'Уроки'}).click();
 await expect(page.getByRole('link',{name:/1\.1/})).toBeVisible();
 await page.keyboard.press('Tab');
 const focused=await page.evaluate(()=>document.activeElement?.tagName);
 expect(['A','BUTTON','INPUT','SELECT']).toContain(focused);
});

test('исходные уроки, карточка слова и ручная тренировка',async({page})=>{
 await page.locator('.nav').getByRole('link',{name:'Слова'}).click();
 await page.getByRole('searchbox').fill('σπίτι');
 await page.getByRole('link',{name:/το σπίτι/}).click();
 await expect(page.getByText('/to ˈspiti/')).toBeVisible();
 await expect(page.getByText('Ударение на первый слог')).toBeVisible();
 await expect(page.getByText('Το σπίτι είναι μικρό.')).toBeVisible();
 await expect(page.locator('img.word-art')).toBeVisible();
 await page.getByRole('button',{name:'Потренировать слово'}).click();
 await expect(page.getByText('Новое слово')).toBeVisible();
});

test('занятие: знакомство, четыре упражнения, результат и продолжение после перезапуска',async({page})=>{
 await seedQueue(page,[
  {wordId:'w11-01',tested:['recall']},
  {wordId:'w11-02',tested:['recall','recognition']},
  {wordId:'w11-03',tested:['recall','recognition','spelling'],audio:true},
  {wordId:'w11-04',tested:['recall']},
 ]);
 await page.getByRole('button',{name:/Начать занятие/}).click();
 await page.waitForURL('**/session');
 const seen=new Set<string>();
 for(let step=0;step<40;step++){
  if(await page.getByRole('heading',{name:'Занятие завершено'}).isVisible().catch(()=>false))break;
  if(await page.getByRole('button',{name:'Запомнил — проверим'}).isVisible().catch(()=>false)){
   seen.add('intro');
   await page.getByRole('button',{name:'Запомнил — проверим'}).click();
  }
  if(await page.getByRole('button',{name:'Показать ответ'}).isVisible().catch(()=>false)){
   seen.add('recall');
   await page.getByRole('button',{name:'Показать ответ'}).click();
   await page.getByRole('button',{name:/Вспомнил/}).first().click();
  }else if(await page.getByText('Что означает слово?').isVisible().catch(()=>false)){
   seen.add('recognition');
   await page.locator('.option').first().click();
  }else if(await page.getByText('Что вы услышали?').isVisible().catch(()=>false)){
   seen.add('listening');
   await page.locator('.option').first().click();
  }else if(await page.getByText('Напишите по-гречески').isVisible().catch(()=>false)){
   seen.add('spelling');
   await page.locator('input.answer').fill('λάθος');
   await page.getByRole('button',{name:'Проверить'}).click();
   await expect(page.locator('.feedback')).toBeVisible();
   await expect(page.locator('.chars')).toBeVisible();
  }
  const next=page.getByRole('button',{name:'Далее'});
  if(await next.isVisible().catch(()=>false))await next.click();
  // Уход в середине занятия не теряет уже записанные ответы.
  if(step===3){
   await page.goto('/');
   await ready(page);
   await page.getByRole('button',{name:/Продолжить занятие/}).click();
   await page.waitForURL('**/session');
  }
  await page.waitForTimeout(120);
 }
 expect([...seen].sort()).toEqual(['intro','listening','recall','recognition','spelling']);
 await expect(page.getByRole('heading',{name:'Занятие завершено'})).toBeVisible();
 await expect(page.getByText(/Объективная точность/)).toBeVisible();
 await page.getByRole('button',{name:'Готово'}).click();
 await ready(page);
 await page.reload();
 await ready(page);
 await page.locator('.nav').getByRole('link',{name:'Ещё'}).click();
 await page.getByRole('link',{name:/Статистика/}).click();
 const recorded=await page.getByText(/Всего записано/).innerText();
 expect(recorded).not.toContain('Всего записано 0');
});

test('будущие занятия: импорт нового набора, дата и пересчёт плана',async({page})=>{
 await page.locator('.nav').getByRole('link',{name:'Ещё'}).click();
 await page.getByRole('link',{name:/Импорт слов/}).click();
 await page.locator('#text').fill('το τραπέζι\nстол\nη καρέκλα\nстул\nτο σπίτι\nдом');
 await expect(page.getByText(/распознано 3 слова/)).toBeVisible();
 await expect(page.getByText(/уже есть в словаре/)).toBeVisible();
 await page.locator('#title').fill('Урок 1.3');
 await page.locator('#date').fill('2026-09-25');
 await page.getByRole('button',{name:/Сохранить 3 слова/}).click();
 await expect(page.getByRole('heading',{name:'Урок 1.3'})).toBeVisible();
 await expect(page.getByText(/3 слова/)).toBeVisible();
 await page.locator('#date').fill('2026-09-20');
 await page.getByRole('button',{name:'Сохранить дату'}).click();
 await expect(page.getByText(/План пересчитан|Дата сохранена/)).toBeVisible();
 await page.locator('.nav').getByRole('link',{name:'Сегодня'}).click();
 await expect(page.getByText('Урок 1.2')).toBeVisible();
});
