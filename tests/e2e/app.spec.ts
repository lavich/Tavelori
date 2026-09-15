import {expect, test} from '@playwright/test';
import {ready, seedQueue} from './helpers';

test.beforeEach(async({page})=>{
 await page.goto('/');
 await ready(page);
});

test('оболочка открывается, разделы доступны с клавиатуры',async({page})=>{
 await expect(page.getByRole('heading',{name:'Немного каждый день'})).toBeVisible();
 await expect(page.getByText('Урок 1.2')).toBeVisible();
 await page.getByRole('navigation').getByRole('link',{name:'Слова'}).click();
 await expect(page.getByRole('heading',{name:'Слова'})).toBeVisible();
 await page.getByRole('navigation').getByRole('link',{name:'Уроки'}).click();
 await expect(page.getByRole('link',{name:/1\.1/})).toBeVisible();
 await page.keyboard.press('Tab');
 const focused=await page.evaluate(()=>document.activeElement?.tagName);
 expect(['A','BUTTON','INPUT','SELECT']).toContain(focused);
});

test('исходные уроки, карточка слова и ручная тренировка',async({page})=>{
 await page.getByRole('navigation').getByRole('link',{name:'Слова'}).click();
 await page.getByRole('searchbox').fill('σπίτι');
 await page.getByRole('link',{name:/το σπίτι/}).click();
 await expect(page.getByText('/to ˈspiti/')).toBeVisible();
 await expect(page.getByText('Ударение на первый слог')).toBeVisible();
 await expect(page.getByText('Το σπίτι είναι μικρό.')).toBeVisible();
 await expect(page.getByTestId('word-art')).toBeVisible();
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
  const next=page.getByRole('button',{name:'Далее'});
  // Последний «Далее» уводит на экран результата, поэтому кнопка может исчезнуть под кликом.
  if(await next.isVisible().catch(()=>false)){await next.click({timeout:5000}).catch(()=>undefined);continue}
  await page.getByTestId('prompt').first().waitFor({state:'visible'});
  const prompt=await page.getByTestId('prompt').first().innerText();

  if(prompt==='Новое слово'){
   seen.add('intro');
   await page.getByRole('button',{name:'Запомнил — проверим'}).click();
   await page.getByRole('button',{name:'Показать ответ'}).waitFor({state:'visible'});
  }else if(prompt==='Вспомни слово'){
   seen.add('recall');
   if(await page.getByRole('button',{name:'Показать ответ'}).isVisible().catch(()=>false)){
    await page.getByRole('button',{name:'Показать ответ'}).click();
    await page.getByTestId('grade').first().waitFor({state:'visible'});
   }
   await page.getByRole('button',{name:/Вспомнил/}).first().click();
   await next.waitFor({state:'visible'});
  }else if(prompt==='Что означает слово?'||prompt==='Что вы услышали?'){
   seen.add(prompt==='Что означает слово?'?'recognition':'listening');
   await page.getByTestId('option').and(page.locator(':not([disabled])')).first().click();
   await next.waitFor({state:'visible'});
  }else if(prompt==='Напишите по-гречески'){
   seen.add('spelling');
   await page.getByLabel('Ваш ответ по-гречески').fill('λάθος');
   await page.getByRole('button',{name:'Проверить'}).click();
   await expect(page.getByTestId('feedback')).toBeVisible();
   await expect(page.getByTestId('chars')).toBeVisible();
   await next.waitFor({state:'visible'});
  }
  // Уход в середине занятия не теряет уже записанные ответы.
  if(step===3){
   await page.goto('/');
   await ready(page);
   await page.getByRole('button',{name:/Продолжить занятие/}).click();
   await page.waitForURL('**/session');
  }
 }
 expect([...seen].sort()).toEqual(['intro','listening','recall','recognition','spelling']);
 await expect(page.getByRole('heading',{name:'Занятие завершено'})).toBeVisible();
 await expect(page.getByText(/Объективная точность/)).toBeVisible();
 await expect(page.getByText(/Активное время/)).toBeVisible();
 // Активное время копится по всем упражнениям и переживает возврат в занятие.
 const activeMs=await page.evaluate(()=>new Promise<number>(resolve=>{
  const request=indexedDB.open('lexi');
  request.onsuccess=()=>{
   const rows=request.result.transaction('sessions','readonly').objectStore('sessions').getAll();
   rows.onsuccess=()=>resolve(Math.max(0,...rows.result.map((session:{activeTimeMs:number})=>session.activeTimeMs)));
  };
 }));
 expect(activeMs).toBeGreaterThan(1000);
 await page.getByRole('button',{name:'Готово'}).click();
 await ready(page);
 await page.reload();
 await ready(page);
 await page.getByRole('navigation').getByRole('link',{name:'Ещё'}).click();
 await page.getByRole('link',{name:/Статистика/}).click();
 const recorded=await page.getByText(/Всего записано/).innerText();
 expect(recorded).not.toContain('Всего записано 0');
});

test('будущие занятия: импорт нового набора, дата и пересчёт плана',async({page})=>{
 await page.getByRole('navigation').getByRole('link',{name:'Ещё'}).click();
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
 await page.getByRole('navigation').getByRole('link',{name:'Сегодня'}).click();
 await expect(page.getByText('Урок 1.2')).toBeVisible();
});
