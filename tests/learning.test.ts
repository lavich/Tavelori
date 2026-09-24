import { describe, expect, it } from "vitest";
import { createEmptyCard, Rating, State } from "ts-fsrs";
import {
  availableTypes,
  buildWordExercise,
  easierExercise,
  FEW_OPTIONS,
  NO_SOUND,
  ONE_SYLLABLE,
  wordExerciseOptions,
  hasEasierStep,
  localDay,
  daysBetween,
  isCheckable,
  FAST_ANSWER_MS,
  FAST_TYPES,
  gradeFor,
  makePlan as planOf,
  nextState,
  scheduler,
  chooseType,
  makeSession as sessionOf,
  objectiveExercise,
  phraseExercise,
  type OptionPools,
} from "../src/domain/learning";
import { emptySkills, type SkillSummary } from "../src/domain/skills";
import { fromSnapshot } from "../src/domain/snapshot-source";
import {
  defaultSchedule,
  defaultSettings,
  LOCAL_COURSE,
  type Course,
  type ExerciseType,
  type Phrase,
  type SessionCard,
  type Word,
  type Lesson,
  type Snapshot,
} from "../src/domain/types";
import { idsOf, wordEvent, wordKeyOf, wordRef, wordState } from "./helpers/cards";
const now = new Date("2026-09-15T09:00:00Z");
const words: Word[] = Array.from({ length: 30 }, (_, i) => ({
  id: `w${i}`,
  greek: `λέξη${i}`,
  russian: `слово${i}`,
  ipa: "",
  segments: [],
  examples: [],
  verified: false,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
}));
type LessonSpec = Lesson & { wordIds: string[] };
const lesson: LessonSpec = {
  id: "l",
  title: "1.2",
  targetDate: "2026-09-18",
  status: "upcoming",
  wordIds: words.map((w) => w.id),
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
type Spec = Omit<Snapshot, "lessons" | "links"> & { lessons: LessonSpec[] };
const snapshot = (spec: Spec): Snapshot => ({
  ...spec,
  lessons: spec.lessons.map(({ wordIds: _, ...rest }) => rest),
  links: spec.lessons.flatMap((l) => l.wordIds.map((wordId, position) => ({ lessonId: l.id, wordId, position }))),
});
/** Предел локального курса задан явно: сценарии описывают поведение при пределе 10, а не значение по умолчанию. */
const localCourse: Course = {
  id: LOCAL_COURSE,
  title: "Мои слова",
  origin: "local",
  subscribed: true,
  schedule: defaultSchedule,
  newItemsPerDay: 10,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
const data: Spec = {
  words,
  lessons: [lesson],
  courses: [localCourse],
  events: [],
  states: [],
  sessions: [],
  settings: defaultSettings,
};
const makePlan = (spec: Spec, at: Date) => planOf(fromSnapshot(snapshot(spec)), at);
const makeSession = (input: { data: Spec; now: Date; wordIds?: string[] }) =>
  sessionOf({ source: fromSnapshot(snapshot(input.data)), now: input.now, refs: input.wordIds?.map(wordRef) });
it("allocates ten new words for thirty due on Friday", async () => {
  const plan = await makePlan(data, now);
  expect(plan.requiredPerDay).toBe(10);
  expect(plan.newRefs).toHaveLength(10);
});
it("counts introduced words across sessions and avoids exceeding daily budget", async () => {
  const states = words
    .slice(0, 10)
    .map((w) =>
      wordState(w.id, { card: createEmptyCard(new Date("2026-09-16")), introducedAt: now.toISOString(), version: 1 }),
    );
  expect((await makePlan({ ...data, states }, now)).newRefs).toHaveLength(0);
});
it("shares words across dates without double counting", async () => {
  const plan = await makePlan({ ...data, lessons: [lesson, { ...lesson, id: "l2", targetDate: "2026-09-19" }] }, now);
  expect(plan.requiredPerDay).toBe(10);
});
it("handles multiple deadlines by cumulative demand", async () => {
  const plan = await makePlan(
    {
      ...data,
      lessons: [
        { ...lesson, wordIds: words.slice(0, 10).map((w) => w.id), targetDate: "2026-09-17" },
        { ...lesson, id: "l2", wordIds: words.slice(10).map((w) => w.id), targetDate: "2026-09-18" },
      ],
    },
    now,
  );
  expect(plan.requiredPerDay).toBe(10);
});
it("honors local calendar through DST and UTC midnight", () => {
  expect(localDay(new Date("2026-09-15T22:30Z"), "Asia/Nicosia")).toBe("2026-09-16");
  expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
});
it("schedules a new word without losing FSRS fields", () => {
  const state = nextState(undefined, wordRef("w0"), Rating.Good, now);
  expect(state.card.due.getTime()).toBeGreaterThan(now.getTime());
  expect(state.card.reps).toBe(1);
  expect(state.version).toBe(1);
});
it("chooses recognition for an untested word", () => expect(chooseType(wordKeyOf("w0"), [], {})).toBe("recognition"));

describe("оценка объективного ответа", () => {
  it("«Почти» получает Hard, а не Again", () => expect(gradeFor("almost", "spelling", 9000)).toBe(Rating.Hard));
  it("неверный ответ и «Не знаю» получают Again", () => {
    expect(gradeFor("wrong", "recognition", 900)).toBe(Rating.Again);
    expect(gradeFor("wrong", "spelling", 900)).toBe(Rating.Again);
  });
  it("быстрый верный выбор получает Easy", () => {
    for (const type of FAST_TYPES) expect(gradeFor("correct", type, FAST_ANSWER_MS - 1)).toBe(Rating.Easy);
  });
  it("неспешный верный выбор получает Good", () => {
    for (const type of FAST_TYPES) expect(gradeFor("correct", type, FAST_ANSWER_MS)).toBe(Rating.Good);
  });
  it("у заданий без вариантов время не читается", () => {
    for (const type of ["assembly", "spelling"] as const) expect(gradeFor("correct", type, 1)).toBe(Rating.Good);
  });
});

describe("разброс интервалов", () => {
  /** Карточка в Review с большим интервалом: только там разброс FSRS вообще применяется. */
  const mature = () => ({
    unitKey: wordKeyOf("w0"),
    ref: wordRef("w0"),
    version: 1,
    introducedAt: "2026-08-01T09:00:00Z",
    card: {
      ...createEmptyCard(new Date("2026-08-01")),
      state: State.Review,
      stability: 40,
      difficulty: 5,
      scheduled_days: 40,
      elapsed_days: 40,
      reps: 5,
      due: now,
      last_review: new Date("2026-08-06T09:00:00Z"),
    },
  });
  it("включён", () => expect(scheduler.parameters.enable_fuzz).toBe(true));
  it("воспроизводим для одной карточки, момента и состояния", () => {
    const first = nextState(mature(), wordRef("w0"), Rating.Good, now);
    const second = nextState(mature(), wordRef("w0"), Rating.Good, now);
    expect(second.card.due).toEqual(first.card.due);
    expect(second.card.scheduled_days).toBe(first.card.scheduled_days);
  });
});

it("кладёт в пул сборки артикль обычной плиткой, а доступность считает по слогам без него", () => {
  const history = [
    wordEvent("w", {
      id: "r",
      sessionId: "s",
      itemId: "i",
      snapshot: { greek: "", russian: "" },
      type: "recognition" as const,
      mode: "scheduled" as const,
      rating: 3 as const,
      correct: true,
      answer: "",
      createdAt: now.toISOString(),
      localDate: "2026-09-15",
      responseTimeMs: 100,
    }),
  ];
  const skills = {
    cleanAssemblies: 0,
    lastTypes: ["recognition" as const],
    types: { recognition: { recent: [true], lastAt: now.toISOString() } },
  };
  const family = { ...words[0], id: "family", greek: "η οικογένεια" };
  const exercise = objectiveExercise(family, [], skills, () => 0);
  expect(exercise).toEqual({ type: "assembly", options: ["οι", "κο", "γέ", "νεια", "η"] });
  expect([...exercise.options].sort()).toEqual(["γέ", "η", "κο", "νεια", "οι"]);
  expect(exercise.options.join("")).not.toBe("ηοικογένεια");
  const light = { ...words[0], id: "light", greek: "το φως" };
  expect(objectiveExercise(light, [], skills, () => 0).type).toBe("spelling");
  expect(history).toHaveLength(1); // форма события остаётся совместимой
});

it("never creates recall, including tiny dictionaries and duplicate translations", async () => {
  for (const pool of [
    words.slice(0, 1),
    words.slice(0, 2),
    words.slice(0, 5).map((w) => ({ ...w, russian: "одно значение" })),
  ]) {
    const session = await makeSession({ data: { ...data, words: pool }, now });
    expect(session.items.every((item) => item.type === "assembly")).toBe(true);
  }
  const single = { ...words[0], greek: "ναι" };
  const session = await makeSession({ data: { ...data, words: [single] }, now });
  expect(session.items[0].type).toBe("spelling");
});
it("puts the only new word after available reviews", async () => {
  const state = nextState(undefined, wordRef(words[1].id), 3, new Date("2026-09-01"));
  const session = await makeSession({
    data: { ...data, words: words.slice(0, 2), states: [state] },
    now,
    wordIds: [words[0].id, words[1].id],
  });
  expect(idsOf(session.items.map((item) => item.ref))).toEqual([words[1].id, words[0].id]);
});

describe("упражнения для фраз", () => {
  const iso = now.toISOString();
  const phrase = (id: string, over: Partial<Phrase> = {}): Phrase => ({
    id,
    text: `Φράση ${id}.`,
    translation: `Фраза ${id}.`,
    provenance: { sourceLabel: "тест", operation: "verbatim" },
    createdAt: iso,
    updatedAt: iso,
    ...over,
  });
  const pool = ["a", "b", "c", "d", "e"].map((id) => phrase(id));
  const skills = (types: Partial<Record<ExerciseType, boolean[]>>, lastTypes: ExerciseType[] = []): SkillSummary => ({
    types: Object.fromEntries(Object.entries(types).map(([type, recent]) => [type, { recent, lastAt: iso }])),
    lastTypes,
    cleanAssemblies: 0,
  });
  it("фраза с переводом: сначала узнавание среди фраз, слоговой сборки нет; при нехватке вариантов — написание", () => {
    const full = phraseExercise(pool[0], pool, emptySkills(), () => 0.5, false)!;
    expect(full.type).toBe("recognition");
    expect(full.options).toHaveLength(4);
    expect(full.options).toContain("Фраза a.");
    expect(full.options.every((option) => pool.some((p) => p.translation === option))).toBe(true); // варианты — только фразы
    const few = phraseExercise(pool[0], pool.slice(0, 3), emptySkills(), () => 0.5, false)!;
    expect(few.type).toBe("spelling");
    expect(few.options).toEqual([]);
    expect(availableTypes(emptySkills(), { hasOptions: true, canAssemble: false })).not.toContain("assembly");
  });
  it("без перевода и голоса объективного упражнения нет; голос и четыре различных фразы дают аудирование", () => {
    const silent = phrase("s", { translation: undefined });
    expect(phraseExercise(silent, pool, emptySkills(), () => 0.5, false)).toBeNull();
    expect(phraseExercise(silent, pool.slice(0, 2), emptySkills(), () => 0.5, true)).toBeNull();
    const heard = phraseExercise(silent, pool, emptySkills(), () => 0.5, true)!;
    expect(heard.type).toBe("listening");
    expect(new Set(heard.options).size).toBe(4);
    expect(heard.options).toContain("Φράση s.");
    expect(
      isCheckable({ kind: "phrase", hasTranslation: false, hasAudio: true }, { hasVoice: false, phrasePool: 4 }),
    ).toBe(true);
    expect(
      isCheckable({ kind: "phrase", hasTranslation: false, hasAudio: false }, { hasVoice: true, phrasePool: 3 }),
    ).toBe(false);
  });
  it("слабый навык фразы выбирается чаще: ошибочное написание при удачном узнавании — написание", () => {
    // Все доступные навыки уже проверены: иначе непроверенный выбирается раньше слабого.
    const weakSpelling = skills(
      { recognition: [true, true, true], spelling: [false, false], listening: [true], comprehension: [true] },
      ["listening", "recognition"],
    );
    expect(phraseExercise(pool[0], pool, weakSpelling, () => 0.5, true)!.type).toBe("spelling");
    const weakRecognition = skills(
      { recognition: [false, false, true], spelling: [true, true], listening: [true], comprehension: [true] },
      ["spelling", "listening"],
    );
    expect(phraseExercise(pool[0], pool, weakRecognition, () => 0.5, true)!.type).toBe("recognition");
  });
  it("единственная новая карточка любого вида идёт после доступных проверок; знакомство сохраняет основные места", async () => {
    const phrase: Phrase = {
      id: "p",
      text: "Γράφω ένα γράμμα.",
      translation: "Я пишу письмо.",
      provenance: { sourceLabel: "тест", operation: "verbatim" },
      createdAt: iso,
      updatedAt: iso,
    };
    const state = nextState(undefined, wordRef(words[1].id), 3, new Date("2026-09-01"));
    const session = await sessionOf({
      source: fromSnapshot(snapshot({ ...data, words: words.slice(0, 2), phrases: [phrase], states: [state] })),
      now,
      refs: [{ kind: "phrase", id: "p" }, wordRef(words[1].id)],
    });
    expect(session.items.map((item) => [item.ref.kind, item.ref.id, item.type, item.isNew])).toEqual([
      ["word", words[1].id, expect.any(String), false],
      ["phrase", "p", expect.any(String), true],
    ]);
    expect(session.items[1].card.kind === "phrase" && session.items[1].card.phrase.text).toBe("Γράφω ένα γράμμα.");
    expect(session.introducedKeys).toEqual([]);
  });
});

describe("дополнительная попытка на ступень проще", () => {
  const iso = now.toISOString();
  const word = (id: string, greek: string): Word => ({ ...words[0], id, greek, russian: `перевод ${id}` });
  const cardOfWord = (w: Word): SessionCard => ({ kind: "word", word: w });
  const pool = ["p1", "p2", "p3", "p4", "p5"].map((id, i) => word(id, `λέξις${i}`));
  const pools = (over: Partial<OptionPools> = {}): OptionPools => ({ words: pool, phrases: [], ...over });
  const family = word("family", "η οικογένεια");
  const light = word("light", "το φως");
  it("под написанием стоит сборка, а не повторный набор", () => {
    const step = easierExercise(cardOfWord(family), "spelling", pools(), () => 0)!;
    expect(step.type).toBe("assembly");
    expect([...step.options].sort()).toEqual(["γέ", "η", "κο", "νεια", "οι"]); // артикль ставит пользователь
    expect(step.options.join("")).not.toBe("ηοικογένεια");
  });
  it("слову без слогов остаётся узнавание, а без вариантов — то же задание", () => {
    const step = easierExercise(cardOfWord(light), "spelling", pools(), () => 0.5)!;
    expect(step.type).toBe("recognition");
    expect(step.options).toHaveLength(4);
    expect(step.options).toContain("перевод light");
    expect(easierExercise(cardOfWord(light), "spelling", pools({ words: pool.slice(0, 2) }), () => 0.5)).toBeNull();
  });
  it("под сборкой стоит узнавание", () => {
    const step = easierExercise(cardOfWord(family), "assembly", pools(), () => 0.5)!;
    expect(step.type).toBe("recognition");
    expect(step.options).toHaveLength(4);
    expect(easierExercise(cardOfWord(family), "assembly", pools({ words: [] }), () => 0.5)).toBeNull();
  });
  it("у узнавания и аудирования ступени ниже нет", () => {
    for (const type of ["recognition", "listening"] as ExerciseType[])
      expect(easierExercise(cardOfWord(family), type, pools(), () => 0.5)).toBeNull();
    expect(hasEasierStep("spelling")).toBe(true);
    expect(hasEasierStep("assembly")).toBe(true);
    expect(["recognition", "listening"].some((type) => hasEasierStep(type as ExerciseType))).toBe(false);
  });
  it("фразе сборка недоступна: под написанием сразу узнавание среди фраз", () => {
    const phrases: Phrase[] = ["a", "b", "c", "d", "e"].map((id) => ({
      id,
      text: `Φράση ${id}.`,
      translation: `Фраза ${id}.`,
      provenance: { sourceLabel: "тест", operation: "verbatim" },
      createdAt: iso,
      updatedAt: iso,
    }));
    const card: SessionCard = { kind: "phrase", phrase: phrases[0] };
    const step = easierExercise(card, "spelling", pools({ phrases }), () => 0.5)!;
    expect(step.type).toBe("recognition");
    expect(step.options).toContain("Фраза a.");
    expect(easierExercise(card, "spelling", pools({ phrases: phrases.slice(0, 2) }), () => 0.5)).toBeNull();
  });
});

describe("понимание на слух", () => {
  const iso = now.toISOString();
  const heard = (types: Partial<Record<ExerciseType, boolean[]>>): SkillSummary => ({
    types: Object.fromEntries(Object.entries(types).map(([type, recent]) => [type, { recent, lastAt: iso }])),
    lastTypes: [],
    cleanAssemblies: 0,
  });
  const known = heard({ recognition: [true] });
  const context = { hasAudio: true, hasOptions: true, canAssemble: false, canComprehend: true };
  it("открывается только после верного узнавания", () => {
    expect(availableTypes(emptySkills(), context)).not.toContain("comprehension");
    expect(availableTypes(heard({ recognition: [false, false] }), context)).not.toContain("comprehension");
    expect(availableTypes(known, context)).toContain("comprehension");
  });
  it("требует озвучки и четырёх различных переводов", () => {
    expect(availableTypes(known, { ...context, canComprehend: false })).not.toContain("comprehension");
    expect(availableTypes(known, { ...context, hasOptions: false, canComprehend: false })).not.toContain(
      "comprehension",
    );
  });
  it("варианты — переводы, а не написания", () => {
    const pool = Array.from({ length: 6 }, (_, i) => ({
      ...words[0],
      id: `c${i}`,
      greek: `λέξη${i}`,
      russian: `перевод ${i}`,
    }));
    const skills: SkillSummary = {
      ...known,
      types: {
        ...known.types,
        recognition: { recent: [true], lastAt: iso },
        assembly: { recent: [true], lastAt: iso },
        spelling: { recent: [true], lastAt: iso },
        listening: { recent: [true], lastAt: iso },
      },
    };
    const exercise = objectiveExercise(pool[0], pool, skills, () => 0.5, true);
    expect(exercise.type).toBe("comprehension"); // непроверенный навык выбирается первым
    expect(exercise.options).toHaveLength(4);
    expect(exercise.options).toContain("перевод 0");
    expect(exercise.options.every((option) => pool.some((word) => word.russian === option))).toBe(true);
  });
  it("под ним стоит узнавание: та же проверка значения, но с написанием на экране", () => {
    const pool = Array.from({ length: 6 }, (_, i) => ({
      ...words[0],
      id: `d${i}`,
      greek: `λέξη${i}`,
      russian: `перевод ${i}`,
    }));
    const step = easierExercise(
      { kind: "word", word: pool[0] },
      "comprehension",
      { words: pool, phrases: [] },
      () => 0.5,
    )!;
    expect(step.type).toBe("recognition");
    expect(step.options).toHaveLength(4);
    expect(hasEasierStep("comprehension")).toBe(true);
  });
  it("фраза с переводом и голосом тоже получает понимание на слух", () => {
    const pool = ["a", "b", "c", "d", "e"].map((id) => ({
      id,
      text: `Φράση ${id}.`,
      translation: `Фраза ${id}.`,
      provenance: { sourceLabel: "тест", operation: "verbatim" as const },
      createdAt: iso,
      updatedAt: iso,
    }));
    const skills: SkillSummary = {
      ...known,
      types: {
        recognition: { recent: [true], lastAt: iso },
        spelling: { recent: [true], lastAt: iso },
        listening: { recent: [true], lastAt: iso },
      },
    };
    const exercise = phraseExercise(pool[0], pool, skills, () => 0.5, true)!;
    expect(exercise.type).toBe("comprehension");
    expect(exercise.options).toContain("Фраза a.");
  });
});

describe("выбор упражнения пользователем", () => {
  const family = { ...words[0], id: "family", greek: "η οικογένεια", russian: "семья" };
  const light = { ...words[0], id: "light", greek: "το φως", russian: "свет" };
  const all = { available: true };
  it("у нового слова доступны все пять видов — условия навыков не действуют", () => {
    expect(wordExerciseOptions(family, words, true)).toEqual({
      recognition: all,
      assembly: all,
      spelling: all,
      listening: all,
      comprehension: all,
    });
  });
  it("звук даёт файл слова и без голоса", () => {
    expect(wordExerciseOptions({ ...family, audioAssetId: "snd-family" }, words, false).listening).toEqual(all);
  });
  it("причины недоступности: нет звука, один слог, мало вариантов", () => {
    const silent = wordExerciseOptions(family, words, false);
    expect(silent.listening).toEqual({ available: false, reason: NO_SOUND });
    expect(silent.comprehension).toEqual({ available: false, reason: NO_SOUND });
    expect(silent.recognition).toEqual(all);
    expect(wordExerciseOptions(light, words, true).assembly).toEqual({ available: false, reason: ONE_SYLLABLE });
    const few = wordExerciseOptions(family, words.slice(0, 2), true);
    expect(few.recognition).toEqual({ available: false, reason: FEW_OPTIONS });
    expect(few.listening).toEqual({ available: false, reason: FEW_OPTIONS });
    expect(few.comprehension).toEqual({ available: false, reason: FEW_OPTIONS });
    expect(few.spelling).toEqual(all);
    expect(few.assembly).toEqual(all);
  });
  it("строит выбранный вид без учёта навыков", () => {
    expect(buildWordExercise(family, "spelling", words, () => 0.3, false)).toEqual({ type: "spelling", options: [] });
    expect(buildWordExercise(family, "comprehension", words, () => 0.3, true)?.type).toBe("comprehension");
    const assembly = buildWordExercise(family, "assembly", words, () => 0.3)!;
    expect(assembly.type).toBe("assembly");
    expect([...assembly.options].sort()).toEqual(["γέ", "η", "κο", "νεια", "οι"]);
    const recognition = buildWordExercise(family, "recognition", words, () => 0.3)!;
    expect(recognition.options).toHaveLength(4);
    expect(recognition.options).toContain("семья");
    const listening = buildWordExercise(family, "listening", words, () => 0.3, true)!;
    expect(listening.options).toContain("η οικογένεια");
  });
  it("недоступный вид не строится", () => {
    expect(buildWordExercise(light, "assembly", words)).toBeNull();
    expect(buildWordExercise(family, "listening", words, Math.random, false)).toBeNull();
    expect(buildWordExercise(family, "recognition", [], Math.random, true)).toBeNull();
  });
});
