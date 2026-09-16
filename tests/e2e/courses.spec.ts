import {expect, test, type Page} from '@playwright/test';
import {ready} from './helpers';

/** Каталог без последнего урока курса: так выглядит поставка до того, как урок опубликован. */
async function withoutLastLesson(page:Page){
 await page.route('**/content/catalog.json',async route=>{
  const catalog=await (await route.fetch()).json();
  const dropped=catalog.lessons.at(-1).id;
  await route.fulfill({json:{
   ...catalog,
   lessons:catalog.lessons.filter((entry:{id:string})=>entry.id!==dropped),
   courses:catalog.courses.map((course:{lessonIds:string[]})=>({...course,lessonIds:course.lessonIds.filter(id=>id!==dropped)})),
  }});
 });
}

test('«Учить курс» ставит все уроки курса, а новый урок подхватывается при следующем запуске',async({page})=>{
 await withoutLastLesson(page);
 await page.goto('/');
 await ready(page);
 await page.getByRole('navigation').getByRole('link',{name:'Уроки'}).click();
 await expect(page.getByRole('heading',{name:'LEEKE A2'})).toBeVisible();
 await expect(page.getByText('Школа LEEKE, класс 26-27')).toBeVisible();

 await page.getByRole('button',{name:'Учить курс'}).click();
 await expect(page.getByRole('button',{name:'Учить курс'})).toHaveCount(0); // курс подписан
 await expect(page.getByRole('link',{name:/не загружен/})).toHaveCount(0);
 const installed=async()=>page.evaluate(async()=>{
  const database=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open('lexi');request.onsuccess=()=>resolve(request.result)});
  const keys=await new Promise<string[]>(resolve=>{const all=database.transaction('packages').objectStore('packages').getAllKeys();all.onsuccess=()=>resolve(all.result as string[])});
  database.close();
  return keys.sort();
 });
 await expect.poll(installed).toEqual(['lesson-1-1','lesson-1-2','lesson-1-3','lesson-1-4','lesson-2-1']);

 // Урок опубликован: подписанный курс доустанавливает его сам, без нажатий.
 await page.unroute('**/content/catalog.json');
 await page.goto('/');
 await ready(page);
 await expect.poll(installed,{timeout:20000}).toEqual(['lesson-1-1','lesson-1-2','lesson-1-3','lesson-1-4','lesson-2-1','lesson-2-2']);
});

test('свой набор попадает в «Мои слова» отдельной группой',async({page})=>{
 await page.goto('/');
 await ready(page);
 await page.getByRole('navigation').getByRole('link',{name:'Уроки'}).click();
 await page.getByRole('button',{name:'Добавить занятие'}).click();
 await page.getByLabel('Название').fill('Мой набор');
 await page.getByRole('button',{name:'Создать'}).click();
 await expect(page.getByRole('heading',{name:'Мои слова'})).toBeVisible();
 await expect(page.getByRole('link',{name:/Мой набор/})).toBeVisible();
});
