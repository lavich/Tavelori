import {expect, test} from '@playwright/test';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ready} from './helpers';

test('полная копия переносит слова, правки и медиа в чистый профиль',async({browser})=>{
 const source=await browser.newContext();
 const page=await source.newPage();
 await page.goto('/');
 await ready(page);
 // Правка, которой нет в исходном наборе: по ней и проверяем перенос.
 await page.locator('.nav').getByRole('link',{name:'Слова'}).click();
 await page.getByRole('searchbox').fill('σπίτι');
 await page.getByRole('link',{name:/το σπίτι/}).click();
 await page.getByRole('link',{name:'Редактировать слово'}).click();
 await page.locator('#russian').fill('дом (моя правка)');
 await page.getByRole('button',{name:'Сохранить'}).click();
 await expect(page.getByText('Сохранено.')).toBeVisible();

 await page.locator('.nav').getByRole('link',{name:'Ещё'}).click();
 await page.getByRole('link',{name:/Копия данных/}).click();
 const download=await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button',{name:'Скачать полную копию'}).click(),
 ]).then(([item])=>item);
 const file=join(tmpdir(),`lexi-e2e-${Date.now()}.json`);
 writeFileSync(file,readFileSync(await download.path()));
 const parsed=JSON.parse(readFileSync(file,'utf8'));
 expect(parsed.data.databaseName).toBe('lexi');
 expect(parsed.data.tables.map((table:{name:string})=>table.name)).toEqual(expect.arrayContaining(['words','assets','states','events','sessions','settings','meta']));
 expect(parsed.data.tables.find((table:{name:string})=>table.name==='assets').rowCount).toBe(63);
 await source.close();

 const clean=await browser.newContext();
 const fresh=await clean.newPage();
 await fresh.goto('/');
 await ready(fresh);
 await fresh.locator('.nav').getByRole('link',{name:'Ещё'}).click();
 await fresh.getByRole('link',{name:/Копия данных/}).click();
 await fresh.locator('#backup').setInputFiles(file);
 await expect(fresh.getByText(/Файл проверен/)).toBeVisible();
 fresh.on('dialog',dialog=>dialog.accept());
 const [saved]=await Promise.all([
  fresh.waitForEvent('download'),
  fresh.getByRole('button',{name:'Заменить данные копией'}).click(),
 ]);
 expect(saved.suggestedFilename()).toContain('before-restore');
 await expect(fresh.getByText('Данные восстановлены полностью.')).toBeVisible();
 await fresh.locator('.nav').getByRole('link',{name:'Слова'}).click();
 await fresh.getByRole('searchbox').fill('σπίτι');
 await fresh.getByRole('link',{name:/το σπίτι/}).click();
 await expect(fresh.getByText('дом (моя правка)')).toBeVisible();
 await expect(fresh.locator('img.word-art')).toBeVisible();
 await clean.close();
});

test('повреждённый и чужой файл не меняют данные',async({page})=>{
 await page.goto('/');
 await ready(page);
 await page.locator('.nav').getByRole('link',{name:'Ещё'}).click();
 await page.getByRole('link',{name:/Копия данных/}).click();
 const broken=join(tmpdir(),'lexi-broken.json');
 writeFileSync(broken,'{не json');
 await page.locator('#backup').setInputFiles(broken);
 await expect(page.getByText(/не читается как копия/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Заменить данные копией'})).toBeDisabled();

 const alien=join(tmpdir(),'lexi-alien.json');
 writeFileSync(alien,JSON.stringify({formatName:'dexie',formatVersion:1,data:{databaseName:'other',databaseVersion:1,tables:[],data:[]}}));
 await page.locator('#backup').setInputFiles(alien);
 await expect(page.getByText(/другим приложением/)).toBeVisible();

 const future=join(tmpdir(),'lexi-future.json');
 writeFileSync(future,JSON.stringify({formatName:'dexie',formatVersion:1,data:{databaseName:'lexi',databaseVersion:9,tables:[],data:[]}}));
 await page.locator('#backup').setInputFiles(future);
 await expect(page.getByText(/более новой версией/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Заменить данные копией'})).toBeDisabled();

 await page.locator('.nav').getByRole('link',{name:'Слова'}).click();
 await expect(page.getByText('63 слова')).toBeVisible();
});
