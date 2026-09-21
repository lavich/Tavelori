import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { buildContent, clozeRevisionOf, phraseRevisionOf } from "../content/build";
import { parsePackage } from "../src/content/schema";
import {
  buildMixed,
  MIXED_CLOZES,
  MIXED_LESSON,
  MIXED_PHRASES,
  mixedContent,
  mixedPackage,
} from "./helpers/mixed-fixture";

const DOC = "docs/lesson-authoring.md",
  TEMPLATES = "docs/lesson-authoring",
  SKILL = ".agents/skills/prepare-lesson/SKILL.md";
/** Примеры употребления всех слов каталога: материал, из которого готовится непубликуемая фикстура. */
const projectExamples = readdirSync("content/words").flatMap((file) =>
  (
    (parse(readFileSync(join("content/words", file), "utf8")) as { examples?: { greek: string; russian: string }[] })
      .examples ?? []
  ).map((example) => ({ ...example, file })),
);
const norm = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();

describe("шаблоны инструкции", () => {
  it("слово, фраза, пропуск и смешанный урок из docs/ проходят тот же валидатор, что и каталог", () => {
    const root = mkdtempSync(join(tmpdir(), "lexi-doc-"));
    // Копируются все папки контента: шаблон проверяется рядом с настоящим каталогом, каким бы он ни стал.
    for (const entry of readdirSync("content", { withFileTypes: true }))
      if (entry.isDirectory()) cpSync(join("content", entry.name), join(root, entry.name), { recursive: true });
    for (const dir of ["phrases", "clozes"]) mkdirSync(join(root, dir), { recursive: true });
    const copy = (from: string, to: string) =>
      writeFileSync(join(root, to), readFileSync(join(TEMPLATES, from), "utf8"));
    copy("word.yaml", "words/w-example.yaml");
    copy("phrase.yaml", "phrases/p-example.yaml");
    copy("cloze.yaml", "clozes/c-example.yaml");
    copy("lesson.yaml", "lessons/lesson-example.yaml");
    writeFileSync(
      join(root, "courses/leeke.yaml"),
      `${readFileSync("content/courses/leeke.yaml", "utf8")}  - lesson-example\n`,
    );
    try {
      const built = buildContent(root);
      const pack = built.packages.find((item) => item.id === "lesson-example")!;
      expect(pack.items.map((item) => [item.kind, item.id])).toEqual([
        ["phrase", "p-example"],
        ["word", "w-example"],
        ["cloze", "c-example"],
      ]);
      expect(pack.phrases[0]).toMatchObject({
        id: "p-example",
        text: "Το δείγμα είναι απλό.",
        translation: "Образец простой.",
      });
      expect(pack.clozes[0]).toMatchObject({
        id: "c-example",
        answer: "είναι",
        target: { kind: "verb-form", ref: "w-example", features: { tense: "present", person: 3, number: "singular" } },
      });
      expect(pack.clozes[0].provenance.parts?.target).toMatchObject({
        operation: "requested-transform",
        request: expect.any(String),
      });
      expect(pack.words[0]).toMatchObject({ id: "w-example", greek: "το δείγμα", examples: [{ target: "δείγμα" }] });
      // Пакет проходит и проверку установки, а не только сборку.
      const file = built.files.find(
        (item) => item.path === built.catalog.lessons.find((entry) => entry.id === "lesson-example")!.url,
      )!;
      expect(parsePackage(JSON.parse(file.body as string)).items).toHaveLength(3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("инструкция ссылается на все шаблоны и на навык, навык — на инструкцию", () => {
    const doc = readFileSync(DOC, "utf8");
    for (const name of ["word", "phrase", "cloze", "lesson"])
      expect(doc, name).toContain(`lesson-authoring/${name}.yaml`);
    expect(doc).toContain("prepare-lesson/SKILL.md");
    // Границы, которые инструкция обязана называть явно.
    for (const rule of [
      "Только присланное и запрошенное",
      "`extract`",
      "`transform`",
      "`generate`",
      "kebab-case",
      "requested-generation",
      "provenance.parts",
    ])
      expect(doc, rule).toContain(rule);
    const skill = readFileSync(SKILL, "utf8");
    expect(skill).toContain("docs/lesson-authoring.md");
    expect(skill).toContain("npm run content");
    expect(skill).toMatch(/не повод перейти в `generate`/);
  });
});

/**
 * Прогон инструкции на непубликуемом примере: фикстура собрана из уже существующих примеров проекта,
 * в основной каталог не попадает (`tests/helpers/mixed-fixture.ts`). Проверяется то, что требует инструкция:
 * ничего не придумано, цели размечены только по запросу, повторная обработка сохраняет идентификаторы.
 */
describe("прогон инструкции на существующем материале проекта", () => {
  const phrases = Object.entries(MIXED_PHRASES) as [string, Record<string, string | undefined>][];
  const clozes = Object.entries(MIXED_CLOZES) as [
    string,
    {
      template: string;
      answer: string;
      context?: string;
      explanation?: string;
      target?: { kind: string; features?: Record<string, unknown> };
      provenance: { operation: string; parts?: Record<string, { operation: string; request?: string }> };
    },
  ][];
  it("тексты фраз и восстановленные предложения пропусков есть в материале проекта, новых предложений нет", () => {
    for (const [id, phrase] of phrases) {
      const source = projectExamples.find((example) => norm(example.greek) === norm(phrase.text!));
      expect(source, id).toBeTruthy();
      expect(phrase.provenance).toMatchObject({
        operation: "verbatim",
        locator: expect.stringContaining(source!.file),
        excerpt: phrase.text,
      });
    }
    for (const [id, cloze] of clozes) {
      const restored = cloze.template.replace("{{gap}}", cloze.answer);
      const source = projectExamples.find((example) => norm(example.greek) === norm(restored));
      expect(source, id).toBeTruthy();
      expect(cloze.provenance.operation).toBe("cloze-from-source");
    }
  });
  it("переводы взяты из того же материала, нового перевода нет; фраза без перевода им не дополняется", () => {
    for (const [id, phrase] of phrases) {
      const source = projectExamples.find((example) => norm(example.greek) === norm(phrase.text!))!;
      if (phrase.translation) expect(norm(phrase.translation), id).toBe(norm(source.russian));
    }
    const silent = MIXED_PHRASES["p-silent"] as { translation?: string };
    expect(silent.translation).toBeUndefined(); // перевода в материале нет и переводить не просили
    // Контекст пропуска — тот же перевод исходного предложения, а не новый текст.
    for (const [id, cloze] of clozes) {
      const restored = cloze.template.replace("{{gap}}", cloze.answer);
      const source = projectExamples.find((example) => norm(example.greek) === norm(restored))!;
      if (cloze.context) expect(norm(cloze.context), id).toBe(norm(source.russian));
    }
  });
  it("учебная цель размечена только по запросу, и есть пропуск без цели", () => {
    const targeted = clozes.filter(([, cloze]) => cloze.target);
    const plain = clozes.filter(([, cloze]) => !cloze.target);
    expect(targeted.length).toBeGreaterThan(0);
    expect(plain.length).toBeGreaterThan(0); // карточка без цели полноценна
    for (const [id, cloze] of targeted) {
      const parts = cloze.provenance.parts;
      expect(parts?.target, id).toMatchObject({ operation: "requested-transform" });
      expect(parts!.target.request, id).toBeTruthy();
      if (cloze.explanation) expect(parts?.explanation, id).toMatchObject({ operation: "requested-transform" }); // объяснения нет в материале — оно по запросу
      const target = cloze.target!;
      expect(target.kind, id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      for (const key of Object.keys(target.features ?? {})) expect(key, id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
  it("повторная обработка сохраняет идентификаторы: опечатка и поздняя цель меняют только ревизию", () => {
    const before = mixedPackage();
    const typo = {
      ...(MIXED_CLOZES["c-vouno"] as Record<string, unknown>),
      explanation: "Прилагательное согласуется с существительным среднего рода в числе.",
    };
    const late = {
      ...(MIXED_CLOZES["c-gramma"] as Record<string, unknown>),
      target: { kind: "noun-form", features: { case: "accusative" } },
      provenance: {
        ...(MIXED_CLOZES["c-gramma"] as { provenance: Record<string, unknown> }).provenance,
        parts: {
          target: {
            sourceLabel: "Разметка по запросу",
            operation: "requested-transform",
            request: "Отметить, что тренирует карточка",
          },
        },
      },
    };
    const again = buildMixed({
      phrases: MIXED_PHRASES,
      clozes: { ...MIXED_CLOZES, "c-vouno": typo, "c-gramma": late },
      lesson: {
        title: "Смешанный урок",
        language: "el",
        items: before.items.map((item) => ({ kind: item.kind, id: item.id })),
      },
    });
    const after = again.packages.find((pack) => pack.id === MIXED_LESSON)!;
    expect(after.clozes.map((item) => item.id)).toEqual(before.clozes.map((item) => item.id)); // ID не изменились
    const pair = (id: string) =>
      [before.clozes.find((item) => item.id === id)!, after.clozes.find((item) => item.id === id)!] as const;
    const [oldVouno, newVouno] = pair("c-vouno");
    expect(newVouno.revision).not.toBe(oldVouno.revision);
    expect(newVouno.answer).toBe(oldVouno.answer);
    const [oldGramma, newGramma] = pair("c-gramma");
    expect(oldGramma.target).toBeUndefined();
    expect(newGramma.target).toEqual({ kind: "noun-form", features: { case: "accusative" } });
    expect(newGramma.revision).not.toBe(oldGramma.revision);
    expect(newGramma.revision).toBe(clozeRevisionOf({ ...newGramma, revision: "" } as never));
    // Нетронутые карточки сохраняют и ID, и ревизию.
    const [oldGrafo, newGrafo] = pair("c-grafo");
    expect(newGrafo).toEqual(oldGrafo);
    expect(after.phrases.map((item) => [item.id, item.revision])).toEqual(
      before.phrases.map((item) => [item.id, item.revision]),
    );
    expect(after.phrases[0].revision).toBe(phraseRevisionOf({ ...after.phrases[0], revision: "" } as never));
  });
  it("реальные уроки каталога не изменились: фикстура добавляет только свой урок", () => {
    const real = buildContent();
    const withFixture = mixedContent();
    expect(withFixture.packages.filter((pack) => pack.id !== MIXED_LESSON).map((pack) => pack.id)).toEqual(
      real.packages.map((pack) => pack.id),
    );
    for (const pack of real.packages) {
      const same = withFixture.packages.find((item) => item.id === pack.id)!;
      expect(same.words, pack.id).toEqual(pack.words);
      expect(same.items, pack.id).toEqual(pack.items);
      expect(same.version, pack.id).toBe(pack.version); // ревизии и версии прежних пакетов не сдвинулись
    }
    // Фикстура добавляет только свои карточки: карточки каталога остаются ровно теми же записями.
    const own = (built: typeof real, kind: "phrases" | "clozes") =>
      built[kind].filter((item) => real[kind].some((card) => card.id === item.id));
    expect(own(withFixture, "phrases")).toEqual(real.phrases);
    expect(own(withFixture, "clozes")).toEqual(real.clozes);
    expect(withFixture.phrases.length - real.phrases.length).toBe(Object.keys(MIXED_PHRASES).length);
    expect(withFixture.clozes.length - real.clozes.length).toBe(Object.keys(MIXED_CLOZES).length);
  });
});
