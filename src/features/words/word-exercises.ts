import { useLiveQuery } from "dexie-react-hooks";
import { OPTION_POOL, WORD_EXERCISES, wordExerciseOptions, type WordExerciseType } from "../../domain/learning";
import type { Word } from "../../domain/types";
import { useGreekVoice } from "../../shared/audio";
import { optionPool } from "../../storage/queries";

export const EXERCISE_LABELS: Record<WordExerciseType, string> = {
  recognition: "Узнавание",
  assembly: "Сборка из слогов",
  spelling: "Написание",
  listening: "Аудирование",
  comprehension: "Понимание на слух",
};
export const isWordExercise = (value: string | undefined): value is WordExerciseType =>
  (WORD_EXERCISES as readonly string[]).includes(value ?? "");
export const exercisePath = (wordId: string, type: WordExerciseType) =>
  `/words/${encodeURIComponent(wordId)}/exercise/${type}`;

/**
 * Какие упражнения слово может получить по выбору пользователя; `undefined` — ещё читается пул вариантов.
 * Хук живёт здесь, а не в `shared/store`: тому пришлось бы импортировать `shared/audio`, который сам импортирует `store`.
 */
export function useWordExercises(word: Word | undefined) {
  const voice = useGreekVoice();
  const pool = useLiveQuery(() => optionPool(OPTION_POOL), []);
  return word && pool ? wordExerciseOptions(word, pool, voice) : undefined;
}
