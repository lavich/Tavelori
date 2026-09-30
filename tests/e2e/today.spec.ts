import { expect, test } from "@playwright/test";
import { installLessons, ready, setCourseLimit } from "./helpers";

test("первый запуск: «Учить курс» на «Сегодня» сразу даёт карточки на сегодня", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await expect(page.getByTestId("today-title")).toHaveText("Начните с курса");
  await expect(page.getByTestId("first-course")).toContainText("Греческий A2");
  // Пока уроков нет, начинать нечего: кнопки занятия нет, а не пустая очередь после нажатия.
  await expect(page.getByRole("button", { name: /Начать занятие/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Учить курс" }).click();
  await expect(page.getByTestId("today-title")).toHaveText(/новы[хе]|новая/, { timeout: 30000 });
  await expect(page.getByRole("button", { name: /Начать занятие/ })).toBeEnabled();
  // Расписания ещё нет: панель ведёт туда, где его задают.
  await page.getByRole("link", { name: /Занятие не назначено/ }).click();
  await expect(page.getByRole("heading", { name: "Уроки", level: 1 })).toBeVisible();
});

test("пустая очередь: «На сегодня всё» и тренировка урока вместо «Начать занятие»", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await installLessons(page, ["lesson-1-1"]);
  await setCourseLimit(page, "leeke", 0);
  await page.reload();
  await ready(page);
  await expect(page.getByTestId("today-title")).toHaveText("На сегодня всё");
  await expect(page.getByTestId("day-done")).toContainText("План на сегодня выполнен");
  await expect(page.getByRole("button", { name: /Начать занятие/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Потренировать урок 1.1" }).click();
  await page.waitForURL("**/session");
  await expect(page.getByTestId("prompt").first()).toBeVisible();
});
