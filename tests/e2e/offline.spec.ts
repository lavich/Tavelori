import {expect, test} from '@playwright/test';
import {installLessons, ready} from './helpers';

test('работает без сети после закрытия страницы для скачанного урока',async({context,page})=>{
 await page.goto('/');
 await ready(page);
 await installLessons(page,['lesson-1-2']);
 // «Скачать для офлайн» получает все обязательные медиа урока; готовность показывается только после проверки файлов.
 await page.goto('/lessons/lesson-1-2');
 await page.getByRole('button',{name:'Скачать для офлайн'}).click();
 await expect(page.getByTestId('lesson-offline')).toContainText('Медиа: 30 из 30');
 await page.goto('/');
 await ready(page);
 await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>undefined));
 await page.reload();
 await ready(page);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:20000});
 await page.getByRole('navigation').getByRole('link',{name:'Ещё'}).click();
 await expect(page.getByText(/Готово офлайн|Офлайн-пакет/)).toBeVisible();
 await page.close();

 await context.setOffline(true);
 const offlinePage=await context.newPage();
 await offlinePage.goto('/');
 await expect(offlinePage.getByRole('heading',{name:'Немного каждый день'})).toBeVisible();
 await offlinePage.getByRole('navigation').getByRole('link',{name:'Слова'}).click();
 await offlinePage.getByRole('searchbox').fill('σπίτι');
 await offlinePage.getByRole('link',{name:/το σπίτι/}).click();
 // Картинка читается из IndexedDB, а не из сети.
 await expect(offlinePage.getByTestId('word-art')).toBeVisible();
 await expect(offlinePage.getByText('Το σπίτι είναι μικρό.')).toBeVisible();
 await offlinePage.getByRole('button',{name:'Потренировать слово'}).click();
 await expect(offlinePage.getByText('Новое слово')).toBeVisible();
 // Неустановленный урок без сети: понятное состояние и повтор, а не пустой урок.
 await offlinePage.goto('/lessons/lesson-1-3');
 await expect(offlinePage.getByText('Пакет не загружен')).toBeVisible();
 await expect(offlinePage.getByRole('button',{name:'Повторить загрузку'})).toBeVisible();
 await expect(offlinePage.getByRole('heading',{name:'Слова набора'})).toHaveCount(0);
 await context.setOffline(false);
});
