# Задачи

Порядок важен: задача 3 включает разброс интервалов и может сдвинуть эталон планировщика, поэтому эталон перегенерируется в задаче 9, когда поведение устоялось.

## 1. Сводка навыков показывает предлагаемые типы

**Файлы:** `src/domain/stats.ts:27`, тест `tests/results.test.ts`

- [ ] 1.1 Тест: `comprehension` есть в сводке, `recall` — нет
- [ ] 1.2 Запустить — FAIL
- [ ] 1.3 `SKILL_TYPES` = `['recognition','assembly','spelling','listening','comprehension','cloze']`
- [ ] 1.4 Запустить — PASS, закоммитить

## 2. Спека порога устойчивости

**Файлы:** `openspec/specs/learning-progress/spec.md` (через дельту этого изменения)

- [ ] 2.1 Дельта `specs/learning-progress/spec.md` описывает порог 21 день без условия об успешном вспоминании
- [ ] 2.2 `npm run spec`

## 3. Разброс интервалов FSRS

**Файлы:** `src/domain/learning.ts:7`, тест `tests/learning.test.ts`

- [ ] 3.1 Тест: два ответа на одну карточку в один момент из одного состояния дают один и тот же срок
- [ ] 3.2 `generatorParameters({enable_fuzz:true})`
- [ ] 3.3 Прогнать `tests/learning.test.ts`, `tests/storage.test.ts`, `tests/schedule.test.ts`; разобрать расхождения

## 4. Четыре градации оценки

**Файлы:** `src/domain/learning.ts` (константы оценки), `src/storage/ops.ts:22-36`, `src/features/learning/SessionScreen.tsx:96-103`, тест `tests/storage.test.ts`

- [ ] 4.1 Тесты: «Почти» → Hard и Review; верный быстрый выбор → Easy; верный медленный выбор → Good; быстрое написание → Good; «Не знаю» → Again
- [ ] 4.2 Запустить — FAIL
- [ ] 4.3 `gradeFor({status,type,responseTimeMs})` в `src/domain/learning.ts` рядом с `nextState`
- [ ] 4.4 `AnswerInput` получает `status?:TextAnswerStatus`; `recordAnswer` считает `rating` через `gradeFor`
- [ ] 4.5 `SessionScreen.answer` передаёт `status` в `recordAnswer`
- [ ] 4.6 Запустить — PASS, закоммитить

## 5. Гейт написания в одну сборку

**Файлы:** `src/domain/learning.ts:250`, тест `tests/learning.test.ts`

- [ ] 5.1 Тест: после одной верной сборки написание доступно; после ошибки в написании — снова нет
- [ ] 5.2 Тест последовательности: третьим заданием идёт написание
- [ ] 5.3 `spellingUnlockedFor` = `cleanAssemblies>=1`
- [ ] 5.4 Запустить — PASS, закоммитить

## 6. Пропуск с вариантами как ступень вниз

**Файлы:** `src/domain/learning.ts` (`OptionPools`, `EASIER`, `easierExercise`), `src/storage/queries.ts`, `src/storage/ops.ts`, `src/features/learning/exercises.tsx`, тесты `tests/learning.test.ts`, `tests/cloze.test.ts`

- [ ] 6.1 Тест: `easierExercise` для пропуска даёт `type:'cloze'` с четырьмя вариантами; при пуле меньше четырёх — `null`
- [ ] 6.2 `clozeOptionsFor(cloze,pool,random)` поверх `optionsAmong`
- [ ] 6.3 `OptionPools` получает `clozes`; `EASIER.cloze=['cloze']`; `easierExercise` собирает варианты
- [ ] 6.4 `clozePool(want,database)` в `queries.ts`; `easierRetry` читает его для карточки пропуска
- [ ] 6.5 `ClozeExercise` рисует кнопки вариантов при `options.length===4`
- [ ] 6.6 Тест компонента: до ответа правильной формы в DOM нет; после ответа раскрыты предложение и объяснение
- [ ] 6.7 Запустить — PASS, закоммитить

## 7. Карточки, которые не даются

**Файлы:** `src/domain/stats.ts`, `src/storage/queries.ts`, `src/domain/snapshot-source.ts`, тест `tests/results.test.ts`

- [ ] 7.1 Тест: состояние с восемью провалами попадает в `leeches` с подписью; с семью — нет; удалённые не попадают
- [ ] 7.2 `LEECH_LAPSES=8`, `LEECH_LIMIT=20`, `Progress.leeches`
- [ ] 7.3 `StatsSource.labelsOf(refs)` в обоих источниках
- [ ] 7.4 Запустить — PASS, закоммитить

## 8. Раздел на экране статистики

**Файлы:** `src/features/progress/StatsScreen.tsx`

- [ ] 8.1 Раздел «Не даётся» между «Состояние карточек» и «Навыки», скрыт при пустом списке
- [ ] 8.2 `npm run typecheck`, закоммитить

## 9. Эталон и полная проверка

- [ ] 9.1 `npx vitest run tests/plan-golden.test.ts` — прочитать diff и убедиться, что расхождение объяснимо
- [ ] 9.2 При необходимости `UPDATE_GOLDEN=1 npx vitest run tests/plan-golden.test.ts`
- [ ] 9.3 `npm test && npm run typecheck && npm run spec && npm run build`
- [ ] 9.4 `npm run test:e2e`
- [ ] 9.5 Закоммитить

## 10. Проверка на живых данных

- [ ] 10.1 Собрать и обновить дев-бота по `docs/telegram-dev.md`
- [ ] 10.2 Ответить в узнавании быстро и медленно, сверить сроки
- [ ] 10.3 Написать слово без ударения и убедиться, что карточка осталась в повторении, а тренировка добавилась
- [ ] 10.4 Ошибиться в пропуске и убедиться, что попытка предлагает варианты
- [ ] 10.5 Открыть статистику: строка понимания на слух на месте, `recall` пропал
