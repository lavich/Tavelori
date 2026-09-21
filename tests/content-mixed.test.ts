import { describe, expect, it } from "vitest";
import { buildContent, clozeRevisionOf, phraseRevisionOf, type BuiltContent } from "../content/build";
import { parseCatalog, parsePackage } from "../src/content/schema";
import { buildMixed, type MixedFiles } from "./helpers/mixed";

/**
 * Непубликуемая фикстура: смешанный урок собирается во временной копии исходников проекта (см. helpers/mixed.ts).
 * Реальный каталог фраз и пропусков не получает; тексты — иллюстрация формата на уже существующем примере проекта.
 */
const provenance = {
  sourceLabel: "Существующий пример проекта, иллюстрация формата",
  locator: "content/words/γράφω.yaml, examples[0]",
  excerpt: "Γράφω ένα γράμμα.",
  operation: "cloze-from-source",
};
const phrase = {
  text: "Γράφω ένα γράμμα.",
  translation: "Я пишу письмо.",
  provenance: { ...provenance, operation: "verbatim" },
};
const cloze = {
  template: "{{gap}} ένα γράμμα.",
  answer: "Γράφω",
  acceptedAnswers: ["Γράφω"],
  context: "Я пишу письмо.",
  related: { kind: "word", id: "w11-27" },
  target: { kind: "verb-form", ref: "w11-27", features: { tense: "present", person: 1, number: "singular" } },
  provenance,
};
const mixed = ({ phrases = { "p-grafo": phrase }, clozes = { "c-grafo": cloze }, lesson, mutate }: MixedFiles = {}) =>
  buildMixed({
    phrases,
    clozes,
    lesson: lesson ?? {
      title: "Смешанный урок",
      language: "el",
      items: [
        ...Object.keys(phrases).map((id) => ({ kind: "phrase", id })),
        { kind: "word", id: "w11-27" },
        ...Object.keys(clozes).map((id) => ({ kind: "cloze", id })),
      ],
    },
    mutate,
  });
const pack = (built: BuiltContent) => built.packages.find((p) => p.id === "lesson-mixed")!;

describe("сборка смешанного урока", () => {
  it("собирает фразы, пропуски и слова в авторском порядке и проходит проверку пакета", () => {
    const built = mixed();
    const mixedPack = pack(built);
    expect(mixedPack.schemaVersion).toBe(3);
    expect(mixedPack.items.map((item) => [item.kind, item.id, item.position])).toEqual([
      ["phrase", "p-grafo", 0],
      ["word", "w11-27", 1],
      ["cloze", "c-grafo", 2],
    ]);
    expect(mixedPack.phrases[0]).toMatchObject({
      id: "p-grafo",
      text: "Γράφω ένα γράμμα.",
      translation: "Я пишу письмо.",
    });
    expect(mixedPack.clozes[0]).toMatchObject({
      id: "c-grafo",
      answer: "Γράφω",
      target: cloze.target,
      related: { kind: "word", id: "w11-27" },
    });
    expect(mixedPack.words.map((word) => word.id)).toEqual(["w11-27"]);
    const file = built.files.find((f) => f.path === built.catalog.lessons.find((l) => l.id === "lesson-mixed")!.url)!;
    expect(parsePackage(JSON.parse(file.body as string)).items).toHaveLength(3);
    const entry = parseCatalog(
      JSON.parse(built.files.find((f) => f.path === "content/catalog.json")!.body as string),
    ).lessons.find((l) => l.id === "lesson-mixed")!;
    expect(entry).toMatchObject({ wordCount: 1, phraseCount: 1, clozeCount: 1, cardCount: 3 });
  });
  it("урок без слов допустим, прежний список words принимается как сокращение", () => {
    const built = mixed({
      lesson: {
        title: "Без слов",
        items: [
          { kind: "phrase", id: "p-grafo" },
          { kind: "cloze", id: "c-grafo" },
        ],
      },
    });
    expect(pack(built).words).toEqual([]);
    expect(pack(built).items).toHaveLength(2);
    // Уроки, объявленные списком words, дают только слова — независимо от того, какие уроки смешанные.
    for (const p of built.packages.filter((p) => built.sources.lessons.get(p.id)?.words))
      expect(
        p.items.every((item) => item.kind === "word"),
        p.id,
      ).toBe(true);
    expect(() =>
      mixed({ lesson: { title: "Оба", words: ["w11-27"], items: [{ kind: "phrase", id: "p-grafo" }] } }),
    ).toThrow(/либо words, либо items/);
    expect(() => mixed({ lesson: { title: "Пусто" } })).toThrow(/нужен непустой список/);
  });
  it("ревизия меняется от цели и текста, идентификатор — нет", () => {
    const base = pack(mixed()).clozes[0];
    const retargeted = pack(
      mixed({
        clozes: {
          "c-grafo": {
            ...cloze,
            target: { ...cloze.target, features: { ...cloze.target.features, number: "plural" } },
          },
        },
      }),
    ).clozes[0];
    expect(retargeted.id).toBe(base.id);
    expect(retargeted.revision).not.toBe(base.revision);
    expect(base.revision).toBe(clozeRevisionOf(base));
    const { target: _t, ...withoutTarget } = base;
    expect(clozeRevisionOf(withoutTarget)).not.toBe(base.revision);
    const p = pack(mixed()).phrases[0];
    expect(p.revision).toBe(phraseRevisionOf(p));
    expect(phraseRevisionOf({ ...p, translation: "Другой перевод" })).not.toBe(p.revision);
  });
  it("отклоняет неверную разметку пропуска, ссылки и происхождение", () => {
    expect(() => mixed({ clozes: { "c-grafo": { ...cloze, template: "Γράφω {{gap}} {{gap}}." } } })).toThrow(
      /clozes\/c-grafo.yaml.*ровно один/,
    );
    expect(() => mixed({ clozes: { "c-grafo": { ...cloze, answer: "" } } })).toThrow(/пуст/);
    expect(() =>
      mixed({
        clozes: {
          "c-grafo": {
            ...cloze,
            template: "Γρά{{gap}} ένα γράμμα.",
            answer: "φω",
            acceptedAnswers: ["φω"],
            provenance: { ...provenance, excerpt: undefined },
          },
        },
      }),
    ).toThrow(/часть слова/);
    expect(() => mixed({ clozes: { "c-grafo": { ...cloze, related: { kind: "word", id: "w99-99" } } } })).toThrow(
      /w99-99/,
    );
    expect(() => mixed({ lesson: { title: "x", items: [{ kind: "cloze", id: "нет" }] } })).toThrow(
      /пропуска нет нет в clozes/,
    );
    expect(() => mixed({ lesson: { title: "x", items: [{ kind: "grammar", id: "g" }] } })).toThrow(/вид карточки/);
    expect(() => mixed({ clozes: { "c-grafo": { ...cloze, provenance: undefined } } })).toThrow(/provenance/);
    expect(() =>
      mixed({
        clozes: { "c-grafo": { ...cloze, provenance: { sourceLabel: "Агент", operation: "requested-generation" } } },
      }),
    ).toThrow(/request/);
    expect(() => mixed({ clozes: { "c-grafo": { ...cloze, template: "{{gap}} ένα βιβλίο." } } })).toThrow(
      /восстановленное предложение/,
    );
  });
  it("отклоняет цель не в kebab-case и вложенные признаки", () => {
    expect(() => mixed({ clozes: { "c-grafo": { ...cloze, target: { kind: "verbForm" } } } })).toThrow(/kebab-case/);
    expect(() => mixed({ clozes: { "c-grafo": { ...cloze, target: { kind: "verb_form" } } } })).toThrow(/kebab-case/);
    expect(() => mixed({ clozes: { "c-grafo": { ...cloze, target: { kind: "" } } } })).toThrow(/kebab-case/);
    expect(() =>
      mixed({ clozes: { "c-grafo": { ...cloze, target: { kind: "verb-form", features: { Tense: "present" } } } } }),
    ).toThrow(/kebab-case/);
    expect(() =>
      mixed({
        clozes: { "c-grafo": { ...cloze, target: { kind: "verb-form", features: { tense: { nested: true } } } } },
      }),
    ).toThrow(/строка, число или да\/нет/);
    expect(
      pack(mixed({ clozes: { "c-grafo": { ...cloze, target: { kind: "some-new-kind", features: { "x-y": true } } } } }))
        .clozes[0].target,
    ).toEqual({ kind: "some-new-kind", features: { "x-y": true } });
  });
  it("отклоняет дубликаты и сирот, разные скрытые места допустимы", () => {
    expect(() => mixed({ clozes: { "c-grafo": cloze, "c-twin": { ...cloze, target: undefined } } })).toThrow(
      /clozes\/c-twin.yaml повторяет пропуск/,
    );
    expect(() => mixed({ phrases: { "p-grafo": phrase, "p-twin": phrase } })).toThrow(
      /phrases\/p-twin.yaml повторяет фразу/,
    );
    expect(() =>
      mixed({
        clozes: {
          "c-grafo": cloze,
          "c-orphan": { ...cloze, template: "Γράφω ένα {{gap}}.", answer: "γράμμα", acceptedAnswers: ["γράμμα"] },
        },
        lesson: {
          title: "x",
          items: [
            { kind: "phrase", id: "p-grafo" },
            { kind: "cloze", id: "c-grafo" },
          ],
        },
      }),
    ).toThrow(/clozes\/c-orphan.yaml не входит ни в один урок/);
    const two = pack(
      mixed({
        clozes: {
          "c-grafo": cloze,
          "c-other": {
            ...cloze,
            template: "Γράφω ένα {{gap}}.",
            answer: "γράμμα",
            acceptedAnswers: ["γράμμα"],
            target: undefined,
          },
        },
      }),
    );
    expect(two.clozes.map((c) => c.id).sort()).toEqual(["c-grafo", "c-other"]);
  });
  it("прежние YAML собираются без изменений материала", () => {
    const before = buildContent();
    const after = mixed();
    for (const p of before.packages) expect(after.packages.find((q) => q.id === p.id)!.words, p.id).toEqual(p.words);
  });
});
