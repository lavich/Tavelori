import {expect, test} from '@playwright/test';
import {installLessons, ready, seedQueue} from './helpers';
import {addDays} from '../../src/domain/learning';
import {isoWeekday} from '../../src/domain/schedule';
import {capitalize, dativeWeekday, dayMonth, weekday} from '../../src/shared/format';

test.beforeEach(async({page})=>{
 await page.goto('/');
 await ready(page);
 await installLessons(page,['lesson-1-1','lesson-1-2','lesson-1-3','lesson-1-4']);
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

test('хвост пройденного урока виден на «Сегодня» и разбирается первым',async({page})=>{
 // Урок 1.1 поставляется пройденным: его слова просрочены, пока их ни разу не показали.
 await expect(page.getByTestId('backlog')).toContainText('Хвост прошедших занятий');
 await expect(page.getByTestId('backlog')).toContainText('33 слова из 1 занятия');
 await page.getByRole('button',{name:'Начать занятие'}).click();
 await page.waitForURL('**/session');
 const lesson=await page.evaluate(async()=>{
  const database=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open('lexi');request.onsuccess=()=>resolve(request.result)});
  const session=await new Promise<{items:{wordId:string}[]}>(resolve=>{
   const all=database.transaction('sessions').objectStore('sessions').getAll();
   all.onsuccess=()=>resolve((all.result as {items:{wordId:string}[];status:string}[]).find(item=>item.status==='active')!);
  });
  const links=await new Promise<{lessonId:string;wordId:string}[]>(resolve=>{
   const all=database.transaction('lessonWords').objectStore('lessonWords').getAll();
   all.onsuccess=()=>resolve(all.result as {lessonId:string;wordId:string}[]);
  });
  database.close();
  const own=new Set(links.filter(link=>link.lessonId==='lesson-1-1').map(link=>link.wordId));
  return session.items.filter(item=>own.has(item.wordId)).length;
 });
 expect(lesson).toBeGreaterThan(0); // слова пройденного урока попали в занятие, а не остались висеть
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
  {wordId:'w11-03',tested:['recall','recognition','assembly','assembly'],audio:false},
  {wordId:'w11-04',tested:['recall','recognition','assembly','assembly','spelling'],audio:true},
 ]);
 await page.getByRole('button',{name:/Начать занятие/}).click();
 await page.waitForURL('**/session');
 const seen=new Set<string>();
 let completed=0;
 for(let step=0;step<80;step++){
  if(await page.getByRole('heading',{name:'Занятие завершено'}).isVisible())break;
  const prompt=await page.getByTestId('prompt').first().innerText();
  const next=page.getByRole('button',{name:'Далее',exact:true});
  if(prompt==='Новое слово'){
   seen.add('intro');
  }else{
   await expect(page.getByTestId('grade')).toHaveCount(0);
   if(prompt==='Что значит это слово?'||prompt==='Что прозвучало?'){
    seen.add(prompt==='Что значит это слово?'?'recognition':'listening');
    await page.getByTestId('option').and(page.locator(':not([disabled])')).first().click();
   }else if(prompt==='Собери слово'){
    seen.add('assembly');
    for(const tile of await page.getByTestId('tile').all())await tile.click();
    await page.getByRole('button',{name:'Проверить'}).click();
   }else if(prompt==='Напиши по-гречески'){
    seen.add('spelling');
    await page.getByLabel('Твой ответ по-гречески').fill('λάθος');
    await page.getByRole('button',{name:'Проверить'}).click();
    await expect(page.getByTestId('chars')).toBeVisible();
   }else throw new Error(`Неожиданное задание: ${prompt}`);
   await expect(page.getByTestId('feedback').or(page.locator('[data-answer="correct"]'))).toBeVisible();
   if(++completed===3){
    await page.goto('/');
    await ready(page);
    await page.getByRole('button',{name:/Продолжить занятие/}).click();
    await page.waitForURL('**/session');
    continue;
   }
  }
  const counter=page.getByLabel(/^(Знакомство|Упражнение) \d+ из \d+$/);
  const previous=await counter.getAttribute('aria-label');
  await next.click();
  await expect(page.getByLabel(previous!,{exact:true})).toHaveCount(0);
 }
 expect([...seen].sort()).toEqual(['assembly','intro','listening','recognition','spelling']);
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

test('будущие занятия: импорт нового набора без даты, дата на экране урока и пересчёт плана',async({page})=>{
 await page.getByRole('navigation').getByRole('link',{name:'Ещё'}).click();
 await page.getByRole('link',{name:/Импорт слов/}).click();
 await page.locator('#text').fill('το τραπέζι\nстол\nη καρέκλα\nстул\nτο σπίτι\nдом');
 await expect(page.getByText(/распознано 3 слова/)).toBeVisible();
 await expect(page.getByText(/уже есть в словаре/)).toBeVisible();
 await expect(page.locator('#date')).toHaveCount(0); // дату назначает расписание
 await page.locator('#title').fill('Урок 1.5');
 await page.getByRole('button',{name:/Сохранить 3 слова/}).click();
 await expect(page.getByRole('heading',{name:'Урок 1.5'})).toBeVisible();
 await expect(page.getByText(/3 слова/)).toBeVisible();
 await expect(page.getByText('Дата не назначена')).toBeVisible();
 await page.locator('#date').fill('2026-09-20');
 await page.getByRole('button',{name:'Сохранить дату'}).click();
 await expect(page.getByText(/План пересчитан|Дата сохранена/)).toBeVisible();
 await page.getByRole('navigation').getByRole('link',{name:'Сегодня'}).click();
 await expect(page.getByText('Урок 1.2')).toBeVisible();
});

test('расписание: даты уроков 1.3 и 1.4, ручной перенос сдвигает хвост, возврат в расписание',async({page})=>{
 // Первое занятие — урок 1.1 — не раньше сегодня и после якоря 1.2 (18 сентября), поэтому проверка не зависит от календаря.
 const today=new Date().toISOString().slice(0,10);
 const start=[addDays(today,2),'2026-09-19'].sort().pop()!;
 const days=[isoWeekday(start),isoWeekday(addDays(start,3))];
 const SHORT=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
 const lessonAt=(number:string,day:string)=>page.getByRole('link',{name:new RegExp(`${number} · К ${dativeWeekday(day)}, ${dayMonth(day)}`)});
 const lessons=()=>page.getByRole('navigation').getByRole('link',{name:'Уроки'}).click();

 await lessons();
 await expect(page.getByText('Не задано — даты уроков назначаются вручную')).toBeVisible();
 await expect(page.getByRole('link',{name:/1\.3 · Без даты/})).toBeVisible();
 await page.getByRole('button',{name:'Задать расписание'}).click();
 await page.locator('#start').fill(start);
 await page.getByRole('button',{name:'Сохранить'}).click();
 await expect(page.getByText('Выберите хотя бы один день недели.')).toBeVisible();
 for(const day of days){
  const toggle=page.getByRole('button',{name:SHORT[day-1],exact:true});
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed','true');
 }
 await page.getByRole('button',{name:'Сохранить'}).click();
 const named=[...days].sort((a,b)=>a-b).map(day=>SHORT[day-1]);
 await expect(page.getByText(`${named[0]} и ${named[1]}, первое занятие ${dayMonth(start)}`)).toBeVisible();
 await expect(page.getByRole('link',{name:new RegExp(`1\\.1 · ${capitalize(weekday(start))}, ${dayMonth(start)}`)})).toContainText('проведён');
 await expect(lessonAt('1\\.3',addDays(start,3))).toBeVisible();
 await expect(lessonAt('1\\.4',addDays(start,7))).toBeVisible();
 await expect(page.getByRole('link',{name:/1\.2 ·/})).toContainText('дата вручную');
 await expect(page.getByRole('link',{name:/1\.3 ·/})).not.toContainText('дата вручную');

 await lessonAt('1\\.3',addDays(start,3)).click();
 await expect(page.locator('#date')).toHaveValue(addDays(start,3));
 await expect(page.getByText('Дата по расписанию. Своя дата сдвинет следующие уроки.')).toBeVisible();
 await page.locator('#date').fill(addDays(start,7));
 await page.getByRole('button',{name:'Сохранить дату'}).click();
 await expect(page.getByText(/Дата сохранена/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Вернуть в расписание'})).toBeVisible();
 await lessons();
 await expect(lessonAt('1\\.3',addDays(start,7))).toContainText('дата вручную');
 await expect(lessonAt('1\\.4',addDays(start,10))).toBeVisible();

 await lessonAt('1\\.3',addDays(start,7)).click();
 await page.getByRole('button',{name:'Вернуть в расписание'}).click();
 await expect(page.locator('#date')).toHaveValue(addDays(start,3));
 await expect(page.getByText('Дата по расписанию. Своя дата сдвинет следующие уроки.')).toBeVisible();
 await lessons();
 await expect(lessonAt('1\\.3',addDays(start,3))).toBeVisible();
 await expect(lessonAt('1\\.4',addDays(start,7))).toBeVisible();

 // Экран «Сегодня» показывает срок по дате из расписания.
 await page.getByRole('navigation').getByRole('link',{name:'Сегодня'}).click();
 await expect(page.getByRole('link',{name:new RegExp(`1\\.3 · К ${dativeWeekday(addDays(start,3))}`)})).toBeVisible();

 await lessons();
 await page.getByRole('button',{name:'Изменить расписание'}).click();
 await page.getByRole('button',{name:'Убрать расписание'}).click();
 await expect(page.getByText('Не задано — даты уроков назначаются вручную')).toBeVisible();
 await expect(page.getByRole('link',{name:/1\.3 · Без даты/})).toBeVisible();
});

test('расписание с первым занятием в прошлом сразу закрепляет прошедшие уроки',async({page})=>{
 const today=new Date().toISOString().slice(0,10);
 const start=addDays(today,-14);
 const days=[isoWeekday(start),isoWeekday(addDays(start,3))];
 const SHORT=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
 const lessons=()=>page.getByRole('navigation').getByRole('link',{name:'Уроки'}).click();

 await page.goto('/');
 await lessons();
 // Урок 1.2 возвращается в расписание, иначе его якорь 18 сентября удержит следующие уроки в будущем.
 await page.getByRole('link',{name:/1\.2 ·/}).click();
 await page.getByRole('button',{name:'Вернуть в расписание'}).click();
 await lessons();
 await page.getByRole('button',{name:'Задать расписание'}).click();
 await expect(page.locator('#start')).not.toHaveAttribute('min');
 await page.locator('#start').fill(start);
 await expect(page.getByText('Дата в прошлом: уроки, чьи дни уже прошли, будут отмечены проведёнными.')).toBeVisible();
 for(const day of days)await page.getByRole('button',{name:SHORT[day-1],exact:true}).click();
 await page.getByRole('button',{name:'Сохранить'}).click();
 for(const [number,day] of [['1\\.1',start],['1\\.2',addDays(start,3)],['1\\.3',addDays(start,7)],['1\\.4',addDays(start,10)]] as const){
  const item=page.getByRole('link',{name:new RegExp(`${number} · ${capitalize(weekday(day))}, ${dayMonth(day)}`)});
  await expect(item).toContainText('проведён');
 }
 await expect(page.getByRole('link',{name:/1\.2 ·/})).not.toContainText('предстоит');
});
