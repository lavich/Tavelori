// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ClozeExercise } from "../src/features/learning/exercises";
import type { Cloze, SessionItem } from "../src/domain/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;

const cloze: Cloze = {
  id: "c1",
  template: "{{gap}} ένα γράμμα.",
  answer: "Γράφω",
  acceptedAnswers: ["Γράφω"],
  context: "Я пишу письмо.",
  explanation: "Первое лицо настоящего времени.",
  provenance: { sourceLabel: "тест", operation: "cloze-from-source" },
  createdAt: "",
  updatedAt: "",
};
const item = (options: string[]): SessionItem => ({
  id: "i1",
  ref: { kind: "cloze", id: "c1" },
  unitKey: '["cloze","c1"]',
  card: { kind: "cloze", cloze },
  type: "cloze",
  options,
  isNew: false,
  mode: "practice",
  expectedVersion: 1,
});

const OPTIONS = ["Γράφω", "Διαβάζω", "Τρώω", "Πίνω"];
let root: Root | null = null,
  container: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const show = async (entry: SessionItem) => {
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  await act(async () => {
    root!.render(<ClozeExercise item={entry} onAnswer={async () => true} onNext={() => undefined} />);
  });
  return container;
};
const press = async (element: Element | undefined) => {
  await act(async () => {
    (element as HTMLElement).click();
  });
};
const choice = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll('[data-testid="cloze-option"]')).find((button) => button.textContent === text);
const feedback = (host: HTMLElement) => host.querySelector('[data-testid="feedback"]');

describe("пропуск с вариантами ответа", () => {
  it("при четырёх вариантах поля ввода нет, а правильной формы нет в DOM до ответа", async () => {
    const host = await show(item(OPTIONS));
    expect(host.querySelector('[data-testid="cloze-input"]')).toBeNull();
    expect(host.querySelectorAll('[data-testid="cloze-option"]')).toHaveLength(4);
    expect(host.querySelector('[data-testid="cloze-template"]')!.textContent).toBe("… ένα γράμμα.");
    expect(feedback(host)).toBeNull();
    expect(host.textContent).not.toContain("Первое лицо настоящего времени.");
    expect(host.querySelector('[data-testid="answer-mask"]')).toBeNull();
  });
  it("верный вариант раскрывает предложение и объяснение", async () => {
    const host = await show(item(OPTIONS));
    await press(choice(host, "Γράφω"));
    expect(feedback(host)!.textContent).toContain("Правильно!");
    expect(host.querySelector('[data-testid="cloze-sentence"]')!.textContent).toBe("Γράφω ένα γράμμα.");
    expect(host.querySelector('[data-testid="cloze-explanation"]')!.textContent).toBe(
      "Первое лицо настоящего времени.",
    );
    expect(host.querySelector('[data-testid="cloze-option"]')).toBeNull();
  });
  it("неверный вариант раскрывает правильную форму и разбор по символам", async () => {
    const host = await show(item(OPTIONS));
    await press(choice(host, "Διαβάζω"));
    expect(feedback(host)!.textContent).toContain("Пока не получилось");
    expect(host.querySelector('[data-testid="cloze-sentence"]')!.textContent).toBe("Γράφω ένα γράμμα.");
    expect(host.querySelector('[data-testid="chars"]')).not.toBeNull();
  });
  it("без четырёх вариантов остаётся свободный ввод", async () => {
    const host = await show(item([]));
    expect(host.querySelector('[data-testid="cloze-input"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-testid="cloze-option"]')).toHaveLength(0);
  });
  it("«Не знаю» остаётся доступным и в вариантах", async () => {
    const host = await show(item(OPTIONS));
    const dontKnow = Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Не знаю");
    expect(dontKnow).toBeDefined();
    await press(dontKnow);
    expect(feedback(host)!.textContent).toContain("Правильная форма:");
    expect(host.querySelector('[data-testid="chars"]')).toBeNull(); // разбора по символам у пропуска без ответа нет
  });
});
