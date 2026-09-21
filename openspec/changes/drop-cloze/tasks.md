## 1. Модель и проверка ответа

- [ ] 1.1 Убрать `cloze` из `CardKind` и `CARD_KINDS`, удалить интерфейс `Cloze`, вариант `SessionCard` и `LearningTarget` в `src/domain/types.ts`; оставить `cloze` в `ExerciseType` и третий вариант `CardSnapshot` без поля цели, снабдив оба комментарием про старую историю. Проверка: `npm run typecheck` называет все оставшиеся места использования.
- [ ] 1.2 Убрать `cloze-from-source` из `ProvenanceOperation` и `clozes` из `Snapshot` и `InstalledPackage`. Проверка: `npm run typecheck`.
- [ ] 1.3 Переименовать `src/domain/cloze.ts` в `src/domain/text-answer.ts`, удалить `splitTemplate`, `fillGap`, опцию `template` и разбор целого предложения вместо пропуска, обновить импорты. Проверка: `npx vitest run tests/cloze.test.ts` переименован в `tests/text-answer.test.ts` и проходит.
- [ ] 1.4 Удалить `clozeRef`, `clozeKey` и ветки пропуска в `refOfCard`, `snapshotOf`, `isShippedCard` в `src/domain/refs.ts`. Проверка: `npx vitest run tests/refs.test.ts`.

## 2. Подбор упражнений и статистика

- [ ] 2.1 Убрать из `src/domain/learning.ts` ветку `cloze` в подборе упражнения и в знакомстве, `clozeOptionsFor` и ступень вниз с вариантами в `easierExercise`; поле `options` у `SessionItem` сохранить. Проверка: `npx vitest run tests/learning.test.ts tests/plan.test.ts`.
- [ ] 2.2 Убрать `cloze` из списка предлагаемых типов и строку «Заполнение пропуска» из подписей в `src/domain/stats.ts`, оставив тип читаемым в истории наравне с `recall`. Проверка: `npx vitest run tests/results.test.ts` подтверждает, что строки этого типа в сводке нет, а ответы остаются в общем числе.

## 3. Хранилище и миграция на схему 7

- [ ] 3.1 Удалить таблицу `clozes` из `src/storage/db.ts`, поднять `SCHEMA_VERSION` до 7 и описать версию 7 в цепочке Dexie. Проверка: `npx vitest run tests/schema.test.ts`.
- [ ] 3.2 Написать миграцию 6 → 7: удаляет связи уроков, состояния повторений, отложенный облачный прогресс и элементы незавершённых сессий со ссылкой на снятый вид, чистит `clozes` и записи `items` вида `cloze` в `installedPackages`, не трогает события ответов. Проверка: новый тест в `tests/migration.test.ts` на профиле со всеми перечисленными записями — ссылок нет, события целы.
- [ ] 3.3 Сдвинуть позицию незавершённой сессии на ближайший оставшийся неотвеченный элемент; сессию только из снятых элементов завершить без потери сохранённых ответов. Проверка: сценарий в `tests/migration.test.ts`.
- [ ] 3.4 Убрать `clozePool`, `liveClozes` и ветки `cloze` в группировке, счётчиках и выборке карточек в `src/storage/queries.ts` и `src/storage/ops.ts`. Проверка: `npx vitest run tests/queries.test.ts tests/storage.test.ts tests/scale.test.ts`.

## 4. Контент и поставка

- [ ] 4.1 Удалить пять исходников `content/clozes/` и их пять записей из `content/lessons/lesson-1-1.yaml`. Проверка: `npm run content` собирает урок 1.1 из 59 карточек.
- [ ] 4.2 Убрать сборку снятого вида и `clozeRevisionOf` из `content/build.ts`, а счётчик `clozeCount` — из каталога. Проверка: `npx vitest run tests/courses.test.ts tests/authoring.test.ts`.
- [ ] 4.3 Убрать `validateCloze`, `PackageCloze`, `CLOZE_FIELDS`, `validateTarget` и чтение `clozes` из `src/content/schema.ts`; состав, ссылающийся на неизвестный вид, отклоняет пакет целиком с указанием вида. Проверка: новый тест в `tests/content-delivery.test.ts` на пакете схемы 3 с карточкой снятого вида — отказ, прежняя ревизия не изменена. Искать остатки в этом файле `awk` или `ast-grep`: `grep` его молча не читает.
- [ ] 4.4 Убрать установку и сверку снятого вида из `src/content/client.ts`. Проверка: `npx vitest run tests/content-mixed.test.ts`.

## 5. Синхронизация и полная копия

- [ ] 5.1 Убрать `cloze` из `KIND_CODE` в `src/sync/codec.ts`, оставив код типа проверки `z`; ссылка с неизвестным кодом вида SHALL пропускаться, а не приводить к `SnapshotFormatError`. Проверка: новый тест в `tests/sync-mixed.test.ts` — снимок со ссылками трёх видов применён в части слов и фраз, ошибки нет, публикуемый снимок ссылок снятого вида не содержит.
- [ ] 5.2 Убрать ветки снятого вида из `src/sync/snapshot.ts` и `src/domain/snapshot-source.ts`, обновить комментарий про формат 2 в `src/sync/types.ts`. Проверка: `npx vitest run tests/sync-mixed.test.ts`.
- [ ] 5.3 Принимать полную копию прежней схемы с таблицей снятого вида, отбрасывая его карточки, состояния и связи и сохраняя события; отсутствие таблицы не считать повреждением. Проверка: новый сценарий в `tests/storage.test.ts` или `tests/migration-cards.test.ts` на копии схемы 6 с пропусками.

## 6. Экраны

- [ ] 6.1 Удалить `ClozeExercise`, `ClozeIntro` и связанные ветки из `src/features/learning/exercises.tsx`, `SessionScreen.tsx` и `ResultScreen.tsx`. Проверка: `npm run typecheck` и `npx vitest run tests/answer-length-hint.test.tsx` — подсказка длины ответа у написания не сломана.
- [ ] 6.2 Убрать группу «Заполни пропуск», `ClozeRow` и `targetLabel` из `src/features/lessons/LessonScreen.tsx`, счётчики вида из `LessonRow.tsx` и `LessonsScreen.tsx`, константу `CLOZES` из `src/shared/format.ts`, счётчик из `src/shared/store.ts`. Проверка: `npx vitest run tests/telegram-ui.test.ts` и открытый урок 1.1 показывает две группы.
- [ ] 6.3 Убрать строку навыка снятого типа из `src/features/progress/StatsScreen.tsx`. Проверка: `npx vitest run tests/results.test.ts`.
- [ ] 6.4 Убрать ветки снятого вида из `src/features/backup/backup.ts`. Проверка: `npx vitest run tests/scrub.test.ts`.

## 7. Тесты

- [ ] 7.1 Удалить `tests/cloze-choice.test.tsx`, переименовать `tests/cloze.test.ts` в `tests/text-answer.test.ts` и оставить в нём только проверку письменного ответа. Проверка: `npm test` не содержит упавших файлов.
- [ ] 7.2 Перевести `tests/helpers/mixed-fixture.ts` и зависящие от него сценарии на два вида карточек. Проверка: `npm test` целиком зелёный.
- [ ] 7.3 Перевести браузерные `tests/e2e/mixed.spec.ts`, `tests/e2e/backup.spec.ts`, `tests/e2e/telegram.spec.ts` и `tests/e2e/helpers.ts` на два вида. Проверка: `npm run test:e2e`.

## 8. Документация

- [ ] 8.1 Убрать пропуски из `docs/lesson-authoring.md`, удалить шаблон `docs/lesson-authoring/cloze.yaml` и упоминания вида в `lesson.yaml` и `word.yaml`. Проверка: в `docs/` не остаётся описаний снятого вида.
- [ ] 8.2 Убрать пропуски из `.agents/skills/prepare-lesson/SKILL.md` и добавить правило отклонять просьбу подготовить задание с пропуском. Проверка: чтение файла.
- [ ] 8.3 Обновить `README.md` и `docs/telegram.md`, `docs/telegram-snapshot.md` под два вида карточек и схему 7. Проверка: чтение файлов.

## 9. Проверка и завершение

- [ ] 9.1 Пройтись по остаткам: `awk '/[Cc]loze/' ` и `ast-grep` по `src`, `content`, `tests`, `docs`; допустимы только упоминания снятого типа проверки в истории и комментарии, объясняющие снятие. Проверка: список оставшихся вхождений просмотрен поимённо.
- [ ] 9.2 Полный прогон: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:e2e`, `npm run spec`. Проверка: все шесть команд зелёные.
- [ ] 9.3 Закрыть PR #60 со ссылкой на новый PR. Проверка: PR #60 в состоянии closed.
- [ ] 9.4 Зафиксировать порядок архивации: при архивации `drop-cloze` после `add-answer-length-hint`, `select-article-in-assembly` или `add-telegram-mini-app` свести вручную требования «Типы упражнений» и «Локальное хранение и офлайн». Проверка: заметка добавлена в описание PR.
