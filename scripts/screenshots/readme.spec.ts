import { expect, test, type Page } from "@playwright/test";
import { GREEK_VOICE, installLessons, useSchedule } from "../../tests/e2e/helpers";

/** Скриншоты README снимаются с production build: `npm run screenshots` перезаписывает `docs/screenshots`. */
const shot = (page: Page, name: string) => page.screenshot({ path: `docs/screenshots/${name}.png` });

test("экраны для README", async ({ page }) => {
  await page.addInitScript(GREEK_VOICE);
  await page.goto("/");
  await installLessons(page, ["lesson-1-1", "lesson-1-2", "lesson-3-4"]);
  // Первое занятие через неделю: на экране ближайший урок и спокойный темп, без долгов и предупреждений.
  await useSchedule(page, "leeke", "lexi", 6);
  // План считается после загрузки экрана: ждём карточку ближайшего занятия, а не пустое состояние.
  await page.getByText(/^(К [а-я]+, \d+ [а-я]+|Занятие сегодня)$/).waitFor();
  await expect(page.getByRole("button", { name: "Начать занятие" })).toBeEnabled();
  await page.waitForTimeout(300);
  await shot(page, "today");

  await page.goto("/lessons");
  await page.getByRole("heading", { name: "Уроки" }).waitFor();
  await shot(page, "lessons");

  await page.goto("/words/w34-03");
  await page.getByTestId("word-art").waitFor();
  await shot(page, "word");

  await page.goto("/words/w34-03/exercise/assembly");
  await page.getByText("Без учёта прогресса").waitFor();
  // Слово собрано наполовину: видно и выбранные слоги, и оставшиеся.
  await page.getByRole("button", { name: "η", exact: true }).click();
  await page.getByRole("button", { name: "κα", exact: true }).click();
  await page.waitForTimeout(500);
  await shot(page, "exercise");
});
