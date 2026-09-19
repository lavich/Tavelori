import {expect, test, type Page} from '@playwright/test';
import {readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GREEK_VOICE, installLessons, ready, readTable, seedMixedLesson, setCourseLimit} from './helpers';
import {onlyReviews, openTelegram, tg} from './telegram';

/**
 * Смешанный урок из непубликуемой фикстуры: слова, фразы и задания с пропуском в одном занятии.
 * Урок кладётся в базу как установленный пакет; реальный каталог его не содержит.
 * Голос браузера подменяется явно: доступность аудирования фразы не должна зависеть от набора голосов машины.
 */
const NO_VOICE=`Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
 getVoices:()=>[],speak(){},cancel(){},addEventListener(){},removeEventListener(){},
}});`;

const tomorrow=()=>new Date(Date.now()+86400000).toISOString().slice(0,10);
const today=()=>new Date().toISOString().slice(0,10);
/** Канонические ответы фикстуры: тест вводит их сам, из интерфейса до ответа они недоступны. */
const ANSWERS:Record<string,string>={'ένα γράμμα.':'Γράφω','Γράφω ένα':'γράμμα','Το βουνό είναι':'ψηλό','Το παιδί':'παίζει','Η άνοιξη':'φέρνει'};
const answerFor=(template:string)=>Object.entries(ANSWERS).find(([hint])=>template.includes(hint))![1];
const INTRO=['Новая фраза','Новое задание с пропуском','Новое слово'];
/** Счётчик занятия: по нему ждём перерисовку, иначе подпись задания читается от предыдущего шага. */
const counter=(page:Page)=>page.getByLabel(/^(Знакомство|Упражнение) \d+ из \d+$/);
const promptOf=async(page:Page)=>{await counter(page).waitFor();return page.getByTestId('prompt').first().innerText()};
/** «Далее» с ожиданием смены счётчика: следующий шаг читается уже из нового состояния. */
async function advance(page:Page){
 const previous=await counter(page).getAttribute('aria-label');
 await page.getByRole('button',{name:'Далее',exact:true}).click();
 await expect(page.getByLabel(previous!,{exact:true})).toHaveCount(0);
}

/** Осталось ли одно незакрытое задание при хотя бы одном ответе: дальше занятие завершится и перестанет быть начатым. */
async function lastUnanswered(page:Page){
 const session=(await readTable(page,'sessions')).find(row=>row.status==='active');
 if(!session)return false;
 const open=session.items.filter((item:{eventId?:string;skipped?:boolean})=>!item.eventId&&!item.skipped);
 return open.length<=1&&session.items.length>open.length;
}

/** Установленный урок 1.1 даёт слово фикстуры; смешанный урок получает ближайшую дату, поэтому его карточки идут первыми. */
async function prepare(page:Page,limit:number,options:Parameters<typeof seedMixedLesson>[1]={}){
 await page.goto('/');
 await ready(page);
 await installLessons(page,['lesson-1-1']);
 await setCourseLimit(page,'leeke',limit);
 return seedMixedLesson(page,{targetDate:tomorrow(),...options});
}

test('экран урока: группы трёх видов, просмотр карточек, непроверяемая фраза, удаление связи и нетронутый раздел «Слова»',async({page})=>{
 test.setTimeout(120000);
 await page.addInitScript(NO_VOICE);
 await prepare(page,4);
 await page.goto('/lessons/lesson-mixed');
 await expect(page.getByTestId('composition')).toContainText('11 карточек: 1 слово · 5 фраз · 5 пропусков');
 await expect(page.getByRole('heading',{name:'Слова · 1'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Фразы · 5'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Заполни пропуск · 5'})).toBeVisible();
 // Фраза без перевода и озвучки помечена отдельно и объясняет ограничение при раскрытии.
 const silent=page.getByTestId('phrase-row').filter({hasText:'Το φρύδι της είναι λεπτό.'});
 await expect(silent.getByTestId('unavailable-badge')).toHaveText('Нет доступного упражнения');
 await silent.getByRole('button',{name:'Το φρύδι της είναι λεπτό.'}).click();
 await expect(silent.getByTestId('phrase-details')).toContainText('нельзя проверить объективно');
 await expect(page.getByText('1 фраза без доступного упражнения')).toBeVisible();
 // Просмотр пропуска: полное предложение с выделенной формой, объяснение и описание цели без перевода идентификаторов.
 const vouno=page.getByTestId('cloze-row').filter({hasText:'Το βουνό είναι'});
 await vouno.getByRole('button',{name:/Το βουνό είναι/}).click();
 await expect(vouno.getByTestId('cloze-details')).toContainText('Прилагательное согласуется');
 await expect(vouno.getByTestId('cloze-target')).toHaveText('Цель: adjective-form (gender: neuter, number: singular)');
 // Удаление связи: карточка исчезает из группы, сама карточка и запись об удалении остаются.
 await page.getByTestId('cloze-row').filter({hasText:'Η άνοιξη'}).getByRole('button',{name:'Убрать'}).click();
 await expect(page.getByRole('heading',{name:'Заполни пропуск · 4'})).toBeVisible();
 await expect(page.getByTestId('composition')).toContainText('10 карточек');
 expect((await readTable(page,'clozes')).some(row=>row.id==='c-anoixi')).toBe(true);
 expect((await readTable(page,'packages')).find(row=>row.lessonId==='lesson-mixed').removed).toEqual([JSON.stringify(['cloze','c-anoixi'])]);
 // Раздел «Слова» остаётся словарём слов: фразы и пропуски туда не попадают.
 await page.getByRole('navigation').getByRole('link',{name:'Слова'}).click();
 await page.getByRole('searchbox').fill('Γράφω ένα');
 await expect(page.getByTestId('word-count')).toHaveText('0 слов');
 await page.getByRole('searchbox').fill('γράφω');
 await expect(page.getByRole('link',{name:/γράφω/})).toBeVisible();
 await expect(page.getByTestId('word-count')).toHaveText('1 слово');
});

test('при системном голосе фраза без перевода проверяема, а предложение пропуска озвучивается только после ответа',async({page})=>{
 test.setTimeout(150000);
 await page.addInitScript(GREEK_VOICE);
 await prepare(page,4);
 await page.goto('/lessons/lesson-mixed');
 const silent=page.getByTestId('phrase-row').filter({hasText:'Το φρύδι της είναι λεπτό.'});
 await expect(silent.getByTestId('unavailable-badge')).toHaveCount(0);
 await expect(page.getByText('без доступного упражнения')).toHaveCount(0);
 // Ручная тренировка группы пропусков: знакомства, затем проверка.
 await page.getByTestId('group-cloze').getByRole('button',{name:'Потренировать группу'}).click();
 await page.waitForURL('**/session');
 for(let step=0;step<8;step++){
  if((await promptOf(page))!=='Новое задание с пропуском')break;
  await advance(page);
 }
 await expect(page.getByTestId('prompt').first()).toHaveText('Заполни пропуск');
 const answer=answerFor(await page.getByTestId('cloze-template').innerText());
 const spoken=()=>page.evaluate(()=>(window as unknown as {__spoken:string[]}).__spoken);
 // До ответа озвучки предложения нет ни кнопкой, ни звуком.
 await expect(page.getByRole('button',{name:'Послушать предложение'})).toHaveCount(0);
 expect(await spoken()).toEqual([]);
 await page.getByTestId('cloze-input').fill(answer);
 await page.getByRole('button',{name:'Проверить'}).click();
 await expect(page.getByTestId('feedback')).toContainText('Правильно');
 await page.getByRole('button',{name:'Послушать предложение'}).click();
 expect((await spoken()).some(text=>text.includes(answer))).toBe(true); // после ответа звучит полное предложение
});

test('урок без слов не пуст, а группа без доступных заданий сообщает об этом',async({page})=>{
 test.setTimeout(120000);
 await page.addInitScript(NO_VOICE);
 await page.goto('/');
 await ready(page);
 await installLessons(page,['lesson-1-1']);
 await seedMixedLesson(page,{lessonId:'lesson-text',title:'Только фразы',only:['p-grafo','c-gramma','p-silent']});
 await page.goto('/lessons/lesson-text');
 await expect(page.getByTestId('composition')).toContainText('3 карточки: 2 фразы · 1 пропуск');
 await expect(page.getByRole('heading',{name:/^Слова ·/})).toHaveCount(0);
 await expect(page.getByText('В наборе пока нет карточек')).toHaveCount(0);
 // Группа из одной непроверяемой фразы: тренировка не начинается, сообщение на месте.
 await page.getByTestId('phrase-row').filter({hasText:'Γράφω ένα γράμμα.'}).getByRole('button',{name:'Убрать'}).click();
 await expect(page.getByRole('heading',{name:'Фразы · 1'})).toBeVisible();
 await page.getByTestId('group-phrase').getByRole('button',{name:'Потренировать группу'}).click();
 await expect(page.getByRole('alert')).toContainText('В группе «Фразы» нет доступных заданий');
 await expect(page).toHaveURL(/\/lessons\/lesson-text$/);
 // Тренировка группы с доступным заданием начинает занятие.
 await page.getByTestId('group-cloze').getByRole('button',{name:'Потренировать группу'}).click();
 await page.waitForURL('**/session');
 await expect(page.getByTestId('prompt').first()).toHaveText(/Заполни пропуск|Новое задание с пропуском/);
 // Список уроков считает карточки, а не слова.
 await page.goto('/lessons');
 await expect(page.getByRole('link',{name:/Только фразы/})).toContainText('2 карточки');
});

test('занятие: знакомство с фразой и пропуском, проверка без утечки ответа, Enter, «Не знаю» и продолжение после перезапуска без сети',async({page,context})=>{
 test.setTimeout(180000);
 await page.addInitScript(NO_VOICE);
 await prepare(page,4);
 await page.setViewportSize({width:360,height:560}); // узкая ширина с местом под экранную клавиатуру; остальные сценарии идут на 390 из конфигурации
 await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>undefined));
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:20000});
 await page.getByRole('button',{name:'Начать занятие'}).click();
 await page.waitForURL('**/session');

 // Знакомства всех новых видов идут общим проходом до проверок.
 const intros:string[]=[];
 for(let step=0;step<12;step++){
  const prompt=await promptOf(page);
  if(!INTRO.includes(prompt))break;
  intros.push(prompt);
  if(prompt==='Новая фраза')await expect(page.getByTestId('phrase-text')).toBeVisible();
  if(prompt==='Новое задание с пропуском'){
   // На знакомстве пропуск показан полным примером с выделенной формой.
   const example=await page.getByTestId('cloze-example').innerText();
   expect(Object.values(ANSWERS).some(answer=>example.includes(answer))).toBe(true);
  }
  await expect(page.getByLabel(/^Знакомство \d+ из \d+$/)).toBeVisible();
  await advance(page);
 }
 expect(intros).toEqual(expect.arrayContaining(['Новая фраза','Новое задание с пропуском','Новое слово']));

 const seen=new Set<string>();
 let wrong=false, skipped=false, restarted=false, chosen=false;
 for(let step=0;step<40;step++){
  if(await page.getByRole('heading',{name:'Занятие завершено'}).isVisible())break;
  const prompt=await promptOf(page);
  seen.add(prompt);
  if(prompt==='Заполни пропуск'){
   const template=await page.getByTestId('cloze-template').innerText();
   const answer=answerFor(template);
   const choices=page.getByTestId('cloze-option');
   // Ни у одного вида пропуска до ответа нет полного предложения, объяснения и озвучки.
   await expect(page.getByRole('button',{name:'Послушать предложение'})).toHaveCount(0);
   await expect(page.getByTestId('cloze-explanation')).toHaveCount(0);
   if(await choices.count()){
    // Дополнительная попытка после ошибки: четыре готовых ответа вместо поля ввода.
    await expect(choices).toHaveCount(4);
    await expect(page.getByTestId('cloze-input')).toHaveCount(0);
    chosen=true;
    await choices.filter({hasText:answer}).first().click();
    await expect(page.getByTestId('feedback')).toContainText('Правильно');
   }else{
    // Свободный ввод: правильной формы нет ни в тексте, ни в разметке, включая подписи для экранного диктора.
    expect(await page.locator('main').innerText()).not.toContain(answer);
    expect(await page.locator('main').innerHTML()).not.toContain(answer);
    const input=page.getByTestId('cloze-input');
    await expect(input).toBeInViewport();
    await expect(page.getByRole('button',{name:'Проверить'})).toBeDisabled(); // пустой ввод не проверяется
    if(!wrong){
     await input.fill('λάθος');
     await input.press('Enter'); // Enter отправляет ответ
     await expect(page.getByTestId('feedback')).toContainText('Пока не получилось');
     wrong=true;
    }else if(!skipped){
     await page.getByRole('button',{name:'Не знаю',exact:true}).click();
     await expect(page.getByTestId('feedback')).toContainText('Правильная форма');
     skipped=true;
    }else{
     await input.fill(answer);
     await page.getByRole('button',{name:'Проверить'}).click();
     await expect(page.getByTestId('feedback')).toContainText('Правильно');
    }
   }
   // После сохранения доступно полное предложение; без файла и голоса озвучка честно недоступна.
   await expect(page.getByTestId('cloze-sentence')).toContainText(answer);
   await expect(page.getByText('Озвучка недоступна: нет файла и греческого голоса')).toBeVisible();
  }else if(prompt==='Что значит эта фраза?'||prompt==='Что значит это слово?'){
   await page.getByTestId('option').and(page.locator(':not([disabled])')).first().click();
   await expect(page.locator('[data-answer]').first()).toBeVisible();
  }else if(prompt==='Напиши по-гречески'){
   await page.getByLabel('Твой ответ по-гречески').fill('λάθος');
   await page.getByRole('button',{name:'Проверить'}).click();
   await expect(page.getByTestId('feedback')).toBeVisible();
  }else if(prompt==='Собери слово'){
   for(const tile of await page.getByTestId('tile').all())await tile.click();
   await page.getByRole('button',{name:'Проверить'}).click();
   await expect(page.getByTestId('feedback')).toBeVisible();
  }else throw new Error(`Неожиданное задание: ${prompt}`);
  await expect(page.getByRole('button',{name:'Далее',exact:true})).toBeVisible();
  if(wrong&&!restarted){
   // Перезапуск без сети: сохранённые ответы не запрашиваются снова, знакомства не повторяются.
   restarted=true;
   const answered=(await readTable(page,'events')).length;
   await context.setOffline(true);
   await page.goto('/');
   await ready(page);
   await page.getByRole('button',{name:/Продолжить занятие/}).click();
   await page.waitForURL('**/session');
   await expect(page.getByRole('button',{name:'Далее',exact:true})).toHaveCount(0);
   expect(INTRO).not.toContain(await page.getByTestId('prompt').first().innerText());
   expect((await readTable(page,'events')).length).toBe(answered);
   await context.setOffline(false);
   continue;
  }
  await advance(page);
 }
 expect([...seen]).toEqual(expect.arrayContaining(['Заполни пропуск','Что значит эта фраза?']));
 expect(wrong&&skipped&&restarted).toBe(true);
 expect(chosen).toBe(true); // ошибка в пропуске дала попытку с вариантами, и она была пройдена
 await expect(page.getByRole('heading',{name:'Занятие завершено'})).toBeVisible();
 await expect(page.getByTestId('composition')).toContainText('пропуск');
 await expect(page.getByText(/Объективная точность .*пропуск/)).toBeVisible();

 // Ответы сохранены, сроки независимы: ошибка в пропуске не сдвинула слово и другой пропуск того же предложения.
 const events=await readTable(page,'events');
 const failed=events.find(item=>item.ref.kind==='cloze'&&item.answer==='λάθος');
 expect(failed.snapshot.template).toContain('{{gap}}');
 expect(failed.snapshot.answer).toBeTruthy();
 const states=await readTable(page,'cardStates');
 const due=(key:string)=>new Date(states.find(state=>state.unitKey===key).card.due).getTime();
 const others=states.filter(state=>state.unitKey!==failed.unitKey);
 expect(others.length).toBeGreaterThan(0);
 expect(others.some(state=>due(state.unitKey)!==due(failed.unitKey))).toBe(true);
 expect(new Set(states.map(state=>state.ref.kind)).size).toBeGreaterThan(1); // карточки разных видов ведут свой прогресс
});

test('полная копия переносит смешанный урок с прогрессом во второй профиль',async({browser})=>{
 test.setTimeout(180000);
 const source=await browser.newContext();
 const page=await source.newPage();
 await page.addInitScript(NO_VOICE);
 await prepare(page,3);
 await page.getByRole('button',{name:'Начать занятие'}).click();
 await page.waitForURL('**/session');
 for(let step=0;step<20;step++){
  const prompt=await promptOf(page);
  if(INTRO.includes(prompt)){await advance(page);continue}
  // Копия должна содержать начатое занятие: последнее незакрытое задание остаётся без ответа.
  if(await lastUnanswered(page))break;
  if(prompt==='Заполни пропуск'){
   const answer=answerFor(await page.getByTestId('cloze-template').innerText());
   await page.getByTestId('cloze-input').fill(answer);
   await page.getByRole('button',{name:'Проверить'}).click();
   await expect(page.getByTestId('feedback')).toContainText('Правильно');
   break;
  }
  if(await page.getByTestId('option').first().isVisible()){await page.getByTestId('option').first().click();await expect(page.locator('[data-answer]').first()).toBeVisible();await advance(page);continue}
  if(await page.getByLabel('Твой ответ по-гречески').isVisible()){await page.getByLabel('Твой ответ по-гречески').fill('λάθος');await page.getByRole('button',{name:'Проверить'}).click();await expect(page.getByTestId('feedback')).toBeVisible();await advance(page);continue}
  if(await page.getByTestId('tile').first().isVisible()){for(const tile of await page.getByTestId('tile').all())await tile.click();await page.getByRole('button',{name:'Проверить'}).click();await expect(page.getByTestId('feedback')).toBeVisible();await advance(page);continue}
  throw new Error(`Неожиданное задание: ${prompt}`);
 }
 const events=(await readTable(page,'events')).length;
 const states=(await readTable(page,'cardStates')).length;
 expect(events).toBeGreaterThan(0);
 await page.goto('/');
 await ready(page);
 await page.getByRole('navigation').getByRole('link',{name:'Ещё'}).click();
 await page.getByRole('link',{name:/Копия данных/}).click();
 const download=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Сохранить полную копию'}).click()]).then(([item])=>item);
 const file=join(tmpdir(),`lexi-mixed-${Date.now()}.json`);
 writeFileSync(file,readFileSync(await download.path()));
 const parsed=JSON.parse(readFileSync(file,'utf8'));
 const rows=(name:string)=>parsed.data.data.find((table:{tableName:string})=>table.tableName===name).rows;
 // Считаем карточки самого смешанного урока, а не всю базу: в каталоге могут быть и свои фразы с пропусками.
 const linked=rows('lessonItems').filter((row:{lessonId:string})=>row.lessonId==='lesson-mixed') as {ref:{kind:string;id:string}}[];
 const ofMixed=(name:string,kind:string)=>rows(name).filter((row:{id:string})=>linked.some(link=>link.ref.kind===kind&&link.ref.id===row.id));
 expect(linked).toHaveLength(11);
 expect(ofMixed('phrases','phrase')).toHaveLength(5);
 expect(ofMixed('clozes','cloze')).toHaveLength(5);
 expect(rows('sessions').some((row:{status:string})=>row.status==='active')).toBe(true);
 await source.close();

 const clean=await browser.newContext();
 const fresh=await clean.newPage();
 await fresh.addInitScript(NO_VOICE);
 await fresh.goto('/');
 await ready(fresh);
 await fresh.getByRole('navigation').getByRole('link',{name:'Ещё'}).click();
 await fresh.getByRole('link',{name:/Копия данных/}).click();
 await fresh.locator('#backup').setInputFiles(file);
 await expect(fresh.getByText(/Файл проверен/)).toBeVisible();
 await fresh.getByRole('button',{name:'Заменить данные копией'}).click();
 await Promise.all([fresh.waitForEvent('download'),fresh.getByRole('button',{name:'Заменить',exact:true}).click()]);
 await expect(fresh.getByText('Данные восстановлены полностью.')).toBeVisible();
 await fresh.goto('/lessons/lesson-mixed');
 await expect(fresh.getByTestId('composition')).toContainText('11 карточек: 1 слово · 5 фраз · 5 пропусков');
 await expect(fresh.getByRole('heading',{name:'Заполни пропуск · 5'})).toBeVisible();
 expect((await readTable(fresh,'events')).length).toBe(events);
 expect((await readTable(fresh,'cardStates')).length).toBe(states);
 await fresh.goto('/');
 await ready(fresh);
 await expect(fresh.getByRole('button',{name:/Продолжить занятие/})).toBeVisible(); // занятие продолжается на втором профиле
 await clean.close();
});

test('внутри Telegram: возврат из свёрнутого клиента не сбрасывает задание с пропуском, нативный «Назад» выходит с сохранением',async({page})=>{
 test.setTimeout(150000);
 await page.addInitScript(NO_VOICE);
 await openTelegram(page,{noCloud:true});
 await installLessons(page,['lesson-1-1']);
 const TG_DB='lexi-tg-TaveloriBot-1001';
 await onlyReviews(page);
 await setCourseLimit(page,'leeke',2,TG_DB);
 await seedMixedLesson(page,{targetDate:today(),only:['c-grafo','c-gramma'],databaseName:TG_DB});
 await page.getByRole('button',{name:/Начать занятие/}).click();
 await page.waitForURL('**/session');
 for(let step=0;step<6;step++){
  if((await promptOf(page))!=='Новое задание с пропуском')break;
  await advance(page);
 }
 await expect(page.getByTestId('prompt').first()).toHaveText('Заполни пропуск');
 await page.getByTestId('cloze-input').fill('γρά');
 const bridge=tg(page);
 await bridge.deactivate();
 await bridge.activate(700);
 await expect(page.getByTestId('cloze-input')).toHaveValue('γρά'); // возврат из Telegram не сбросил ввод
 await page.getByTestId('cloze-input').press('Enter');
 await expect(page.getByTestId('feedback')).toBeVisible();
 await bridge.back();
 await expect(page.getByRole('heading',{name:'Немного каждый день'})).toBeVisible();
 expect((await readTable(page,'events',TG_DB)).filter(row=>row.ref.kind==='cloze')).toHaveLength(1);
});
