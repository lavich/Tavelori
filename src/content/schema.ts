import type {
  CardKind,
  Example,
  LearningRef,
  LearningTarget,
  Provenance,
  ProvenanceOperation,
  Segment,
  SourceRecord,
} from "../domain/types.ts";
import { CARD_KINDS } from "../domain/types.ts";

/**
 * Контракт поставляемого контента. Каталог — только метаданные; пакет — урок целиком.
 * Пакеты неизменяемы: версия входит в URL, поэтому старые адреса продолжают работать.
 * Положение урока во времени — статус занятия и дата — контентом не поставляется: оно
 * принадлежит пользователю и живёт только в его базе. Версия 2 — это их удаление.
 * Версия 3 — смешанный урок: слова, фразы, задания с пропуском и упорядоченные типизированные связи.
 * Читатель принимает версии 2 и 3; словарный пакет версии 2 представляется уроком из слов.
 */
export const SCHEMA_VERSION = 3;
export const SUPPORTED_SCHEMAS = [2, 3] as const;
export type SupportedSchema = (typeof SUPPORTED_SCHEMAS)[number];

export interface CatalogCourse {
  id: string;
  title: string;
  language: string;
  source?: string;
  lessonIds: string[];
}
export interface CatalogEntry {
  id: string;
  courseId: string;
  language: string;
  title: string;
  wordCount: number;
  phraseCount: number;
  clozeCount: number;
  cardCount: number;
  version: string;
  url: string;
  bytes: number;
  media: { count: number; bytes: number };
}
export interface Catalog {
  schemaVersion: SupportedSchema;
  generatedAt: string;
  courses: CatalogCourse[];
  lessons: CatalogEntry[];
}

export interface PackageWord {
  id: string;
  greek: string;
  russian: string;
  ipa: string;
  note?: string;
  segments: Segment[];
  examples: Example[];
  imageAssetId?: string;
  audioAssetId?: string;
  verified: boolean;
  source?: string;
  revision: string;
}
export interface PackagePhrase {
  id: string;
  text: string;
  translation?: string;
  usage?: string;
  note?: string;
  audioAssetId?: string;
  provenance: Provenance;
  revision: string;
}
export interface PackageCloze {
  id: string;
  template: string;
  answer: string;
  acceptedAnswers: string[];
  context?: string;
  explanation?: string;
  target?: LearningTarget;
  related?: LearningRef;
  audioAssetId?: string;
  provenance: Provenance;
  revision: string;
}
/** Словарная связь прежнего формата; в схеме 3 выводится из `items` для кода, который ещё работает только со словами. */
export interface PackageLink {
  wordId: string;
  position: number;
}
export interface PackageItem {
  kind: CardKind;
  id: string;
  position: number;
}
export interface PackageMedia {
  id: string;
  kind: "image" | "audio";
  mimeType: string;
  url: string;
  bytes: number;
  version: string;
  required: boolean;
  alt: string;
  source: string;
}
export interface ContentPackage {
  schemaVersion: SupportedSchema;
  id: string;
  courseId: string;
  version: string;
  language: string;
  lesson: { title: string };
  words: PackageWord[];
  phrases: PackagePhrase[];
  clozes: PackageCloze[];
  items: PackageItem[];
  links: PackageLink[];
  media: PackageMedia[];
}

export type ContentErrorKind = "schema" | "unsupported" | "network" | "storage";
export class ContentError extends Error {
  readonly kind: ContentErrorKind;
  constructor(message: string, kind: ContentErrorKind = "schema") {
    super(message);
    this.kind = kind;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown, path: string): string => {
  if (typeof value !== "string") throw new ContentError(`${path}: ожидалась строка`);
  return value;
};
const num = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new ContentError(`${path}: ожидалось число`);
  return value;
};
const bool = (value: unknown, path: string): boolean => {
  if (typeof value !== "boolean") throw new ContentError(`${path}: ожидалось да/нет`);
  return value;
};
const opt = <T>(value: unknown, read: (v: unknown) => T): T | undefined =>
  value === undefined || value === null ? undefined : read(value);
const list = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) throw new ContentError(`${path}: ожидался список`);
  return value;
};
const obj = (value: unknown, path: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new ContentError(`${path}: ожидался объект`);
  return value;
};
const relativeUrl = (value: unknown, path: string): string => {
  const url = str(value, path);
  if (!url || url.startsWith("/") || url.includes("..") || /^[a-z]+:/i.test(url))
    throw new ContentError(`${path}: ссылка должна быть относительной`);
  return url;
};
const unique = (ids: string[], path: string) => {
  if (new Set(ids).size !== ids.length) throw new ContentError(`${path}: идентификаторы повторяются`);
};
const isCardKind = (value: unknown): value is CardKind =>
  typeof value === "string" && (CARD_KINDS as readonly string[]).includes(value);
const cardKind = (value: unknown, path: string): CardKind => {
  if (!isCardKind(value)) throw new ContentError(`${path}: неизвестный вид карточки «${String(value)}»`);
  return value;
};

function checkSchemaVersion(raw: Record<string, unknown>, what: string): SupportedSchema {
  const version = raw.schemaVersion;
  if (!(SUPPORTED_SCHEMAS as readonly unknown[]).includes(version))
    throw new ContentError(
      `${what} версии схемы ${String(version)} не поддерживается этой версией приложения`,
      "unsupported",
    );
  return version as SupportedSchema;
}

export function parseCatalog(input: unknown): Catalog {
  const raw = obj(input, "каталог");
  const schemaVersion = checkSchemaVersion(raw, "Каталог");
  const lessons = list(raw.lessons, "каталог.lessons").map((entry, index): CatalogEntry => {
    const path = `каталог.lessons[${index}]`;
    const item = obj(entry, path);
    const media = obj(item.media ?? { count: 0, bytes: 0 }, `${path}.media`);
    const head = {
      id: str(item.id, `${path}.id`),
      courseId: str(item.courseId ?? "", `${path}.courseId`),
      language: str(item.language, `${path}.language`),
      title: str(item.title, `${path}.title`),
    };
    // Каталог схемы 2 знает только слова: счётчики новых видов равны нулю, а число карточек — числу слов.
    const wordCount = num(item.wordCount, `${path}.wordCount`);
    const phraseCount = num(item.phraseCount ?? 0, `${path}.phraseCount`),
      clozeCount = num(item.clozeCount ?? 0, `${path}.clozeCount`);
    return {
      ...head,
      wordCount,
      phraseCount,
      clozeCount,
      cardCount: num(item.cardCount ?? wordCount + phraseCount + clozeCount, `${path}.cardCount`),
      version: str(item.version, `${path}.version`),
      url: relativeUrl(item.url, `${path}.url`),
      bytes: num(item.bytes, `${path}.bytes`),
      media: { count: num(media.count, `${path}.media.count`), bytes: num(media.bytes, `${path}.media.bytes`) },
    };
  });
  unique(
    lessons.map((l) => l.id),
    "каталог.lessons",
  );
  const courses = list(raw.courses ?? [], "каталог.courses").map((entry, index): CatalogCourse => {
    const path = `каталог.courses[${index}]`;
    const item = obj(entry, path);
    const course: CatalogCourse = {
      id: str(item.id, `${path}.id`),
      title: str(item.title, `${path}.title`),
      language: str(item.language ?? "", `${path}.language`),
      lessonIds: list(item.lessonIds ?? [], `${path}.lessonIds`).map((value, i) =>
        str(value, `${path}.lessonIds[${i}]`),
      ),
    };
    const source = opt(item.source, (value) => str(value, `${path}.source`));
    if (source) course.source = source;
    return course;
  });
  unique(
    courses.map((course) => course.id),
    "каталог.courses",
  );
  return { schemaVersion, generatedAt: str(raw.generatedAt, "каталог.generatedAt"), courses, lessons };
}

function parseWord(input: unknown, path: string): PackageWord {
  const raw = obj(input, path);
  const segments = list(raw.segments ?? [], `${path}.segments`).map((entry, i): Segment => {
    const seg = obj(entry, `${path}.segments[${i}]`);
    return {
      text: str(seg.text, `${path}.segments[${i}].text`),
      ipa: str(seg.ipa, `${path}.segments[${i}].ipa`),
      explanation: str(seg.explanation, `${path}.segments[${i}].explanation`),
      start: num(seg.start, `${path}.segments[${i}].start`),
    };
  });
  const examples = list(raw.examples ?? [], `${path}.examples`).map((entry, i): Example => {
    const ex = obj(entry, `${path}.examples[${i}]`);
    return {
      greek: str(ex.greek, `${path}.examples[${i}].greek`),
      russian: str(ex.russian, `${path}.examples[${i}].russian`),
      target: str(ex.target, `${path}.examples[${i}].target`),
      source: opt(ex.source, (v) => str(v, `${path}.examples[${i}].source`)),
    };
  });
  const word: PackageWord = {
    id: str(raw.id, `${path}.id`),
    greek: str(raw.greek, `${path}.greek`),
    russian: str(raw.russian, `${path}.russian`),
    ipa: str(raw.ipa ?? "", `${path}.ipa`),
    segments,
    examples,
    verified: bool(raw.verified ?? false, `${path}.verified`),
    revision: str(raw.revision, `${path}.revision`),
  };
  const note = opt(raw.note, (v) => str(v, `${path}.note`));
  if (note) word.note = note;
  const source = opt(raw.source, (v) => str(v, `${path}.source`));
  if (source) word.source = source;
  const image = opt(raw.imageAssetId, (v) => str(v, `${path}.imageAssetId`));
  if (image) word.imageAssetId = image;
  const audio = opt(raw.audioAssetId, (v) => str(v, `${path}.audioAssetId`));
  if (audio) word.audioAssetId = audio;
  if (!word.greek.trim() || !word.russian.trim()) throw new ContentError(`${path}: у слова нет написания или перевода`);
  return word;
}

export const PROVENANCE_OPERATIONS: readonly ProvenanceOperation[] = [
  "verbatim",
  "cloze-from-source",
  "requested-transform",
  "requested-generation",
];
/** Поля, у которых может быть своё происхождение: имена частей — идентификаторы в kebab-case. */
export const PROVENANCE_PARTS: readonly string[] = [
  "translation",
  "usage",
  "note",
  "explanation",
  "accepted-answers",
  "target",
  "audio",
];
function validateSource(input: unknown, path: string): SourceRecord {
  const raw = obj(input, path);
  const operation = str(raw.operation, `${path}.operation`);
  if (!(PROVENANCE_OPERATIONS as readonly string[]).includes(operation))
    throw new ContentError(`${path}.operation: неизвестная операция «${operation}»`);
  const record: SourceRecord = {
    sourceLabel: str(raw.sourceLabel, `${path}.sourceLabel`),
    operation: operation as ProvenanceOperation,
  };
  if (!record.sourceLabel.trim()) throw new ContentError(`${path}.sourceLabel: не может быть пустым`);
  const locator = opt(raw.locator, (v) => str(v, `${path}.locator`));
  if (locator) record.locator = locator;
  const excerpt = opt(raw.excerpt, (v) => str(v, `${path}.excerpt`));
  if (excerpt) record.excerpt = excerpt;
  const request = opt(raw.request, (v) => str(v, `${path}.request`));
  if (request?.trim()) record.request = request;
  if (operation.startsWith("requested-") && !record.request)
    throw new ContentError(`${path}.request: для операции ${operation} нужен текст запроса пользователя`);
  return record;
}
/**
 * Происхождение обязательно у фраз и пропусков; запрошенные преобразование и генерация несут текст запроса.
 * `parts` описывает поля, чьё происхождение отличается от основного текста, и сам частей не имеет.
 */
export function validateProvenance(input: unknown, path: string): Provenance {
  if (input === undefined || input === null)
    throw new ContentError(`${path}: нужно provenance — происхождение материала`);
  const raw = obj(input, path);
  const provenance: Provenance = validateSource(raw, path);
  if (raw.parts !== undefined && raw.parts !== null) {
    const parts = obj(raw.parts, `${path}.parts`);
    const flat: Record<string, SourceRecord> = {};
    for (const [field, value] of Object.entries(parts)) {
      if (!PROVENANCE_PARTS.includes(field))
        throw new ContentError(
          `${path}.parts.${field}: у этого поля не бывает отдельного происхождения — ${PROVENANCE_PARTS.join(", ")}`,
        );
      if (obj(value, `${path}.parts.${field}`).parts !== undefined)
        throw new ContentError(`${path}.parts.${field}.parts: происхождение части не делится дальше`);
      flat[field] = validateSource(value, `${path}.parts.${field}`);
    }
    if (Object.keys(flat).length) provenance.parts = flat;
  }
  return provenance;
}

/** Идентификаторы цели и признаков: нижний регистр, kebab-case, ASCII. Значения после публикации стабильны и не переводятся. */
export const TARGET_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const targetName = (value: unknown, path: string) => {
  const name = str(value, path);
  if (!TARGET_NAME.test(name))
    throw new ContentError(`${path}: «${name}» — нужен идентификатор в нижнем регистре kebab-case, например verb-form`);
  return name;
};
/** Проверяется только форма: вид и признаки — открытые идентификаторы, их смысл не проверяется. */
export function validateTarget(input: unknown, path: string): LearningTarget {
  const raw = obj(input, path);
  const target: LearningTarget = { kind: targetName(raw.kind, `${path}.kind`) };
  if (raw.ref !== undefined && raw.ref !== null) {
    const ref = str(raw.ref, `${path}.ref`);
    if (!ref.trim()) throw new ContentError(`${path}.ref: не может быть пустым`);
    target.ref = ref;
  }
  if (raw.features !== undefined && raw.features !== null) {
    const features = obj(raw.features, `${path}.features`);
    const flat: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(features)) {
      const name = targetName(key, `${path}.features`);
      if (
        typeof value === "string" ||
        (typeof value === "number" && Number.isFinite(value)) ||
        typeof value === "boolean"
      )
        flat[name] = value;
      else throw new ContentError(`${path}.features.${key}: значение признака — строка, число или да/нет`);
    }
    target.features = flat;
  }
  return target;
}

export const GAP = "{{gap}}";
const letter = /\p{L}|\p{M}|\p{N}/u;
/**
 * Форма карточки пропуска: ровно один маркер, скрыто целое слово или сочетание целых слов,
 * канонический ответ непуст и входит в допустимые. Смысл ответа не проверяется.
 */
export function validateCloze(input: unknown, path: string): PackageCloze {
  const raw = obj(input, path);
  const template = str(raw.template, `${path}.template`);
  const gaps = template.split(GAP).length - 1;
  if (gaps !== 1)
    throw new ContentError(`${path}.template: в шаблоне должен быть ровно один пропуск ${GAP}, найдено ${gaps}`);
  const at = template.indexOf(GAP);
  const before = template[at - 1],
    after = template[at + GAP.length];
  if ((before && letter.test(before)) || (after && letter.test(after)))
    throw new ContentError(`${path}.template: пропуск скрывает часть слова — скрывайте форму целиком`);
  const answer = str(raw.answer, `${path}.answer`);
  if (!answer.trim()) throw new ContentError(`${path}.answer: ответ пуст`);
  const acceptedAnswers = list(raw.acceptedAnswers, `${path}.acceptedAnswers`).map((value, i) => {
    const text = str(value, `${path}.acceptedAnswers[${i}]`);
    if (!text.trim()) throw new ContentError(`${path}.acceptedAnswers[${i}]: ответ пуст`);
    return text;
  });
  if (!acceptedAnswers.length) throw new ContentError(`${path}.acceptedAnswers: список допустимых ответов пуст`);
  if (!acceptedAnswers.includes(answer))
    throw new ContentError(`${path}.acceptedAnswers: список должен содержать канонический ответ «${answer}»`);
  const cloze: PackageCloze = {
    id: str(raw.id, `${path}.id`),
    template,
    answer,
    acceptedAnswers,
    provenance: validateProvenance(raw.provenance, `${path}.provenance`),
    revision: str(raw.revision, `${path}.revision`),
  };
  const context = opt(raw.context, (v) => str(v, `${path}.context`));
  if (context) cloze.context = context;
  const explanation = opt(raw.explanation, (v) => str(v, `${path}.explanation`));
  if (explanation) cloze.explanation = explanation;
  const audio = opt(raw.audioAssetId, (v) => str(v, `${path}.audioAssetId`));
  if (audio) cloze.audioAssetId = audio;
  if (raw.target !== undefined && raw.target !== null) cloze.target = validateTarget(raw.target, `${path}.target`);
  if (raw.related !== undefined && raw.related !== null) {
    const related = obj(raw.related, `${path}.related`);
    const kind = cardKind(related.kind, `${path}.related.kind`);
    if (kind === "cloze")
      throw new ContentError(`${path}.related: связь ведёт на слово или фразу, а не на другой пропуск`);
    cloze.related = { kind, id: str(related.id, `${path}.related.id`) };
  }
  return cloze;
}

export function validatePhrase(input: unknown, path: string): PackagePhrase {
  const raw = obj(input, path);
  const text = str(raw.text, `${path}.text`);
  if (!text.trim()) throw new ContentError(`${path}.text: у фразы нет текста`);
  const phrase: PackagePhrase = {
    id: str(raw.id, `${path}.id`),
    text,
    provenance: validateProvenance(raw.provenance, `${path}.provenance`),
    revision: str(raw.revision, `${path}.revision`),
  };
  for (const field of ["translation", "usage", "note", "audioAssetId"] as const) {
    const value = opt(raw[field], (v) => str(v, `${path}.${field}`));
    if (value) phrase[field] = value;
  }
  return phrase;
}

export function parsePackage(input: unknown): ContentPackage {
  const raw = obj(input, "пакет");
  const schemaVersion = checkSchemaVersion(raw, "Пакет");
  const lessonRaw = obj(raw.lesson, "пакет.lesson");
  const words = list(raw.words, "пакет.words").map((entry, i) => parseWord(entry, `пакет.words[${i}]`));
  unique(
    words.map((w) => w.id),
    "пакет.words",
  );
  let phrases: PackagePhrase[] = [],
    clozes: PackageCloze[] = [],
    items: PackageItem[];
  if (schemaVersion === 2) {
    // Словарный пакет: смешанные поля в нём не читаются, чтобы новый контент не выдавал себя за старый.
    for (const field of ["phrases", "clozes", "items"])
      if (raw[field] !== undefined) throw new ContentError(`пакет.${field}: поле не входит в пакет схемы 2`);
    const known = new Set(words.map((w) => w.id));
    items = list(raw.links, "пакет.links").map((entry, i): PackageItem => {
      const link = obj(entry, `пакет.links[${i}]`);
      const wordId = str(link.wordId, `пакет.links[${i}].wordId`);
      if (!known.has(wordId))
        throw new ContentError(`пакет.links[${i}]: связь указывает на слово ${wordId}, которого нет в пакете`);
      return { kind: "word", id: wordId, position: num(link.position, `пакет.links[${i}].position`) };
    });
  } else {
    phrases = list(raw.phrases ?? [], "пакет.phrases").map((entry, i) => validatePhrase(entry, `пакет.phrases[${i}]`));
    unique(
      phrases.map((p) => p.id),
      "пакет.phrases",
    );
    clozes = list(raw.clozes ?? [], "пакет.clozes").map((entry, i) => validateCloze(entry, `пакет.clozes[${i}]`));
    unique(
      clozes.map((c) => c.id),
      "пакет.clozes",
    );
    const known = {
      word: new Set(words.map((w) => w.id)),
      phrase: new Set(phrases.map((p) => p.id)),
      cloze: new Set(clozes.map((c) => c.id)),
    };
    items = list(raw.items, "пакет.items").map((entry, i): PackageItem => {
      const path = `пакет.items[${i}]`;
      const item = obj(entry, path);
      const kind = cardKind(item.kind, `${path}.kind`);
      const id = str(item.id, `${path}.id`);
      if (!known[kind].has(id))
        throw new ContentError(`${path}: связь указывает на карточку ${kind}/${id}, которой нет в пакете`);
      return { kind, id, position: num(item.position, `${path}.position`) };
    });
    // `related` — навигационная ссылка на материал каталога: связанное слово может жить в другом уроке, поэтому в пакете не требуется.
    if (!items.length) throw new ContentError("пакет.items: в уроке нет карточек");
  }
  unique(
    items.map((item) => `${item.kind} ${item.id}`),
    "пакет.items",
  );
  unique(
    items.map((item) => String(item.position)),
    "пакет.items.position",
  );
  items = [...items].sort((a, b) => a.position - b.position);
  const media = list(raw.media ?? [], "пакет.media").map((entry, i): PackageMedia => {
    const path = `пакет.media[${i}]`;
    const item = obj(entry, path);
    const kind = item.kind;
    if (kind !== "image" && kind !== "audio") throw new ContentError(`${path}.kind: неизвестный тип медиа`);
    return {
      id: str(item.id, `${path}.id`),
      kind,
      mimeType: str(item.mimeType, `${path}.mimeType`),
      url: relativeUrl(item.url, `${path}.url`),
      bytes: num(item.bytes, `${path}.bytes`),
      version: str(item.version, `${path}.version`),
      required: bool(item.required ?? false, `${path}.required`),
      alt: str(item.alt ?? "", `${path}.alt`),
      source: str(item.source ?? "", `${path}.source`),
    };
  });
  unique(
    media.map((m) => m.id),
    "пакет.media",
  );
  const mediaIds = new Set(media.map((m) => m.id));
  for (const word of words)
    for (const ref of [word.imageAssetId, word.audioAssetId])
      if (ref && !mediaIds.has(ref))
        throw new ContentError(`пакет.words: слово ${word.id} ссылается на медиа ${ref}, которого нет в пакете`);
  for (const card of [...phrases, ...clozes])
    if (card.audioAssetId && !mediaIds.has(card.audioAssetId))
      throw new ContentError(
        `пакет: карточка ${card.id} ссылается на медиа ${card.audioAssetId}, которого нет в пакете`,
      );
  return {
    schemaVersion,
    id: str(raw.id, "пакет.id"),
    courseId: str(raw.courseId ?? "", "пакет.courseId"),
    version: str(raw.version, "пакет.version"),
    language: str(raw.language, "пакет.language"),
    lesson: { title: str(lessonRaw.title, "пакет.lesson.title") },
    words,
    phrases,
    clozes,
    items,
    links: items.filter((item) => item.kind === "word").map((item) => ({ wordId: item.id, position: item.position })),
    media,
  };
}

/** Поля слова, которые поставляет пакет; остальное принадлежит пользователю. */
export const SHIPPED_FIELDS = [
  "greek",
  "russian",
  "ipa",
  "note",
  "segments",
  "examples",
  "imageAssetId",
  "audioAssetId",
  "verified",
  "source",
] as const;
export type ShippedField = (typeof SHIPPED_FIELDS)[number];
/** Поставляемые поля фразы и пропуска: из них считается ревизия; `target` входит в неё, но не в идентичность карточки. */
export const PHRASE_FIELDS = ["text", "translation", "usage", "note", "audioAssetId", "provenance"] as const;
export const CLOZE_FIELDS = [
  "template",
  "answer",
  "acceptedAnswers",
  "context",
  "explanation",
  "target",
  "related",
  "audioAssetId",
  "provenance",
] as const;
