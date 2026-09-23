// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WordScreen } from "../src/features/words/WordScreen";
import { SharedWordScreen } from "../src/features/words/SharedWordScreen";
import { refreshCatalog, resetCatalogPhase, resetPreviews, useFetcher } from "../src/content/client";
import { NO_SOUND } from "../src/domain/learning";
import { db } from "../src/storage/db";
import { installLessons, memoryFetcher } from "./helpers/content";

/** Здесь нет ни синтезатора, ни файлов звука: аудированию и пониманию на слух не на чем звучать. */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;
beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  resetCatalogPhase();
  resetPreviews();
  useFetcher(memoryFetcher());
  host = document.body.appendChild(document.createElement("div"));
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});
async function mount(path: string) {
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/words/:id" element={<WordScreen />} />
          <Route path="/share/word/:id" element={<SharedWordScreen />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}
const text = () => host.textContent ?? "";
async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw new Error(`не дождались: ${what}\n${text()}`);
}
const choice = (label: string) => host.querySelector<HTMLButtonElement>(`[aria-label='${label}: пройти']`);

describe("блок «Упражнения» на экране слова", () => {
  it("без файла и голоса аудирование и понимание на слух выключены с причиной, остальное доступно", async () => {
    await installLessons(db, ["lesson-3-4"]);
    await mount("/words/w34-03");
    await until(() => !!choice("Написание") && !choice("Написание")!.disabled, "блок упражнений");
    expect(choice("Узнавание")!.disabled).toBe(false);
    expect(choice("Сборка из слогов")!.disabled).toBe(false);
    expect(choice("Аудирование")!.disabled).toBe(true);
    expect(choice("Понимание на слух")!.disabled).toBe(true);
    expect(text().split(NO_SOUND)).toHaveLength(3);
  });
  it("у удалённого слова блока нет", async () => {
    await installLessons(db, ["lesson-3-4"]);
    await db.words.update("w34-03", { deletedAt: "2026-01-01T00:00:00.000Z" });
    await mount("/words/w34-03");
    await until(() => text().includes("Потренировать слово"), "экран слова");
    expect(host.querySelector("[data-testid=word-exercises]")).toBeNull();
  });
  it("на карточке по ссылке блока нет", async () => {
    await refreshCatalog();
    await mount("/share/word/w34-03");
    await until(() => text().includes("Слово из урока"), "карточка по ссылке");
    expect(host.querySelector("[data-testid=word-exercises]")).toBeNull();
    expect(text()).not.toContain("Упражнения");
  });
});
