# Задачи

Порядок обязателен: задача 6 перегенерирует эталон планировщика, и делать это раньше, чем поведение устоялось, нельзя.

Ветка отребейзена на `main` после PR #44 («понимание на слух»). Тот PR правит `src/domain/learning.ts` только ниже `makePlan` — выбор типа упражнения — и добавляет `comprehension` в `ExerciseType`. С очередью, составом занятия и записью ответа он не пересекается; номера строк ниже указаны уже после ребейза.

## 1. Очередь новых ведёт только ближайшее занятие

**Файлы:** `src/domain/learning.ts:142-166`, тест `tests/plan.test.ts`

- [x] 1.1 Тест в `tests/plan.test.ts`, рядом с блоком «темп принадлежит курсу»

```ts
describe('очередь ведёт ближайшее занятие',()=>{
 const pool=words(60);
 const ids=(from:number,to:number)=>pool.slice(from,to).map(w=>w.id);
 it('карточки следующего занятия не берутся, пока ближайшее впереди',async()=>{
  const data=base({
   words:pool,
   courses:[course('leeke',10)],
   lessons:[
    lesson('l3',ids(0,10),'2026-09-22',{courseId:'leeke'}),
    lesson('l4',ids(10,45),'2026-09-25',{courseId:'leeke'}),
   ],
   // Все карточки 1.3 уже вводили: срок ещё не наступил, но непоказанных у занятия не осталось.
   states:ids(0,10).map(id=>learned(id,'2026-09-30T09:00:00Z')),
  });
  const plan=await planOf(data);
  expect(idsOf(plan.newRefs)).toEqual([]);
 });
});
```

- [x] 1.2 Запустить и убедиться, что тест падает

Команда: `npx vitest run tests/plan.test.ts -t 'карточки следующего занятия'`
Ожидание: FAIL, в `newRefs` десять карточек `l4`

- [x] 1.3 Разделить подсчёт и набор в `src/domain/learning.ts`

`take` получает третьим по счёту смыслом «куда класть», где `null` значит «только посчитать»:

```ts
  const take=async(lesson:Lesson,into:LearningRef[]|null,isPast:boolean)=>{
   let added=0;
   for(const ref of await fresh(await source.lessonRefs(lesson.id))){
    const key=unitKey(ref);
    if(seen.has(key))continue;
    seen.add(key); added++;
    if(!into)continue; // карточка дальнего занятия: считается для срока, но сегодня не показывается
    into.push(ref); origins.set(key,{lessonId:lesson.id,title:lesson.title,past:isPast});
   }
   return added;
  };
```

Цикл по предстоящим занятиям отдаёт очередь только первому:

```ts
  // Очередь ведёт ближайшее занятие; карточки дальних считаются для срока и ждут своей очереди.
  const dated:LearningRef[]=[]; let counted=0;
  for(const [index,lesson] of upcoming.entries()){
   counted+=await take(lesson,index===0?dated:null,false);
   const daysLeft=Math.max(1,daysBetween(today,lesson.targetDate!));
   deadlines.push({lessonId:lesson.id,title:lesson.title,targetDate:lesson.targetDate!,daysLeft:daysBetween(today,lesson.targetDate!),newLeft:counted,requiredPerDay:Math.ceil(counted/daysLeft)});
  }
```

Добор бюджета из уроков курса (`for(const lesson of own)`) не трогаем: карточки дальних занятий уже в `seen`, и `fresh()` их отбросит.

- [x] 1.4 Запустить тест — PASS

Команда: `npx vitest run tests/plan.test.ts -t 'карточки следующего занятия'`

- [x] 1.5 Тест: сроки и темп по-прежнему считаются по всем предстоящим занятиям

```ts
 it('срок дальнего занятия остаётся в плане с требуемым темпом',async()=>{
  const data=base({
   words:pool,
   courses:[course('leeke',10)],
   lessons:[
    lesson('l3',ids(0,10),'2026-09-22',{courseId:'leeke'}),
    lesson('l4',ids(10,45),'2026-09-18',{courseId:'leeke'}),
   ],
   states:ids(0,10).map(id=>learned(id,'2026-09-30T09:00:00Z')),
  });
  const plan=await planOf(data); // сегодня 2026-09-15, до l4 три дня
  expect(plan.deadlines.map(d=>[d.lessonId,d.newLeft,d.requiredPerDay])).toEqual([['l4',35,12],['l3',35,5]]);
  expect(plan.shortfall).toBe(true);
  expect(idsOf(plan.newRefs)).toEqual(ids(10,20)); // ближайшее теперь l4, очередь ведёт оно
 });
```

Команда: `npx vitest run tests/plan.test.ts -t 'срок дальнего занятия'`
Ожидание: PASS. `deadlines` в `DailyPlan` отсортированы по дате, поэтому `l4` идёт первым; `newLeft` накопительный, поэтому у `l3` тоже 35.

- [x] 1.6 Тест: добор бюджета не подбирает карточки дальнего занятия

```ts
 it('добор бюджета не заглядывает в дальние занятия',async()=>{
  const data=base({
   words:pool,
   courses:[course('leeke',10)],
   lessons:[
    lesson('l3',ids(0,3),'2026-09-22',{courseId:'leeke'}),
    lesson('l4',ids(10,45),'2026-09-25',{courseId:'leeke'}),
   ],
  });
  const plan=await planOf(data);
  // У ближайшего три непоказанные карточки, бюджет десять — остаток остаётся пустым.
  expect(idsOf(plan.newRefs)).toEqual(ids(0,3));
 });
```

Команда: `npx vitest run tests/plan.test.ts -t 'добор бюджета'`
Ожидание: PASS

- [x] 1.7 Прогнать весь файл и закоммитить

```bash
npx vitest run tests/plan.test.ts
git add src/domain/learning.ts tests/plan.test.ts
git commit -m "Очередь новых карточек ведёт только ближайшее занятие"
```

Ожидание: в `tests/plan.test.ts` могут упасть старые сценарии с двумя предстоящими занятиями одного курса — это ожидаемо, их утверждения надо привести к новому правилу, а не обходить. Сценарии с одним предстоящим занятием на курс меняться не должны.

## 2. Досрочная подготовка в плане

**Файлы:** `src/domain/learning.ts` (интерфейсы `CoursePlan`, `DailyPlan`, тело `makePlan`), тест `tests/plan.test.ts`

- [x] 2.1 Тест состава и порядка подготовки

```ts
describe('досрочная подготовка к ближайшему занятию',()=>{
 const pool=words(60);
 const ids=(from:number,to:number)=>pool.slice(from,to).map(w=>w.id);
 const at=(id:string,due:string,state:State,days:number):LearningState=>wordState(id,{
  introducedAt:'2026-09-14T09:00:00Z',version:1,
  card:{...createEmptyCard(new Date('2026-09-14')),due:new Date(due),state,scheduled_days:days,reps:2},
 });
 it('берёт несозревшие карточки ближайшего занятия от наименее зрелых',async()=>{
  const data=base({
   words:pool,
   courses:[course('leeke',10)],
   lessons:[lesson('l3',ids(0,4),'2026-09-22',{courseId:'leeke'})],
   states:[
    at(pool[0].id,'2026-09-20T09:00:00Z',State.Review,14),
    at(pool[1].id,'2026-09-16T09:00:00Z',State.Relearning,0),
    at(pool[2].id,'2026-09-18T09:00:00Z',State.Review,3),
    at(pool[3].id,'2026-09-16T09:00:00Z',State.Learning,0),
   ],
  });
  const plan=await planOf(data);
  expect(idsOf(plan.preview)).toEqual([pool[1].id,pool[3].id,pool[2].id,pool[0].id]);
 });
 it('срочная карточка идёт в повторения и в подготовку не попадает',async()=>{
  const data=base({
   words:pool,
   courses:[course('leeke',10)],
   lessons:[lesson('l3',ids(0,2),'2026-09-22',{courseId:'leeke'})],
   states:[at(pool[0].id,'2026-09-14T09:00:00Z',State.Review,3),at(pool[1].id,'2026-09-20T09:00:00Z',State.Review,3)],
  });
  const plan=await planOf(data);
  expect(plan.reviews.map(r=>r.ref.id)).toEqual([pool[0].id]);
  expect(idsOf(plan.preview)).toEqual([pool[1].id]);
 });
 it('курс без предстоящих занятий подготовки не даёт',async()=>{
  const data=base({
   words:pool,
   courses:[course('leeke',10)],
   lessons:[lesson('l1',ids(0,2),'2026-09-10',{courseId:'leeke'})],
   states:[at(pool[0].id,'2026-09-20T09:00:00Z',State.Review,3)],
  });
  const plan=await planOf(data);
  expect(plan.preview).toEqual([]);
 });
});
```

- [x] 2.2 Запустить — падает на отсутствии `plan.preview`

Команда: `npx vitest run tests/plan.test.ts -t 'досрочная подготовка'`
Ожидание: FAIL, TypeScript и рантайм на `plan.preview`

- [x] 2.3 Вынести ранг состояния на уровень модуля в `src/domain/learning.ts`

Рядом с `export const scheduler=...`:

```ts
/** Зрелость состояния для очередей: сперва то, что переучивается, потом разучиваемое, потом повторяемое. */
const stateRank=(card:Card)=>card.state===State.Relearning?0:card.state===State.Learning?1:2;
```

В `makePlan` локальный `const rank=(state:LearningState)=>...` (`learning.ts:196`) удалить, а сортировку повторений переписать на общий ранг:

```ts
 const reviews=due
  .filter(s=>!deleted.has(s.unitKey))
  .sort((a,b)=>stateRank(a.card)-stateRank(b.card)||new Date(a.card.due).getTime()-new Date(b.card.due).getTime()||a.unitKey.localeCompare(b.unitKey))
  .map(s=>({ref:s.ref,state:s}));
```

- [x] 2.4 Добавить `preview` в интерфейсы плана

```ts
export interface CoursePlan {
 courseId:string; title:string; newItemsPerDay:number; budget:number; introducedToday:number;
 newRefs:LearningRef[]; requiredPerDay:number; shortfall:boolean; deadlines:DeadlinePlan[]; backlog:Backlog;
 origins:Map<string,WordOrigin>; unavailable:LearningRef[];
 /** Карточки ближайшего занятия, которые уже вводили, а срок ещё не наступил: подготовка к уроку. */
 preview:LearningRef[];
}
```

То же поле `preview:LearningRef[]` добавить в `DailyPlan` рядом с `unavailable`.

- [x] 2.5 Собрать подготовку в теле `makePlan`

Внутри цикла по курсам, после `const requiredPerDay=...`:

```ts
  // Подготовка к ближайшему занятию: карточка уже введена, срок ещё не наступил, повторением она сегодня не станет.
  const nearest=upcoming[0];
  const preview:LearningRef[]=[];
  if(nearest){
   const refs=await source.lessonRefs(nearest.id);
   const [live,states]=await Promise.all([source.liveKeys(refs),source.statesOf(refs)]);
   const ready=refs.flatMap(ref=>{
    const state=states.get(unitKey(ref));
    return live.has(unitKey(ref))&&state&&new Date(state.card.due).getTime()>now.getTime()?[state]:[];
   });
   ready.sort((a,b)=>stateRank(a.card)-stateRank(b.card)||a.card.scheduled_days-b.card.scheduled_days
    ||new Date(a.card.due).getTime()-new Date(b.card.due).getTime()||a.unitKey.localeCompare(b.unitKey));
   preview.push(...ready.map(state=>state.ref));
  }
```

Добавить `preview` в объект, который уходит в `plans.push({...})`, и в возвращаемый `DailyPlan`:

```ts
  preview:uniqueRefs(plans.flatMap(plan=>plan.preview)),
```

- [x] 2.6 Запустить тесты — PASS

Команда: `npx vitest run tests/plan.test.ts -t 'досрочная подготовка'`

- [x] 2.7 Коммит

```bash
git add src/domain/learning.ts tests/plan.test.ts
git commit -m "План собирает досрочную подготовку к ближайшему занятию"
```

## 3. Подготовка занимает свободные места в занятии

**Файлы:** `src/domain/learning.ts:312-345` (`makeSession`), `src/domain/types.ts:78` и `:81`, тест `tests/plan.test.ts`

- [x] 3.1 Расширить режим в `src/domain/types.ts`

В `ReviewEvent` (`types.ts:78`) и в `SessionItem` (`types.ts:81`) заменить `mode:'scheduled'|'practice'` на `mode:'scheduled'|'practice'|'preview'`. Комментарий над `SessionItem`:

```ts
/** `mode` — `scheduled` очередное упражнение дня, `preview` досрочная подготовка к занятию, `practice` ручная тренировка и дополнительная попытка. */
```

`SessionInput.mode` (`learning.ts:311`) и `startSession` (`src/features/learning/session-actions.ts:8`) остаются `'scheduled'|'practice'`: подготовку не заказывают снаружи, её выдаёт план.

- [x] 3.2 Тест состава занятия

```ts
 it('подготовка добирает места, не тронув квоту новых',async()=>{
  const pool=words(60);
  const ids=(from:number,to:number)=>pool.slice(from,to).map(w=>w.id);
  const data=base({
   words:pool,
   courses:[course('leeke',10)],
   lessons:[lesson('l3',ids(0,30),'2026-09-22',{courseId:'leeke'})],
   states:ids(0,30).map(id=>learned(id,'2026-09-30T09:00:00Z')),
   settings:{...defaultSettings,sessionSize:20},
  });
  const session=await sessionOf({data,now});
  expect(session.items).toHaveLength(20);
  expect(session.items.every(item=>item.mode==='preview')).toBe(true);
  expect(session.items.every(item=>!item.isNew)).toBe(true);
 });
```

Команда: `npx vitest run tests/plan.test.ts -t 'подготовка добирает места'`
Ожидание: FAIL — сейчас занятие пустое, `items` длины 0

- [x] 3.3 Добавить четвёртую категорию в `makeSession`

Ветку `else` (`learning.ts:322-329`) переписать так, чтобы категория ехала вместе со ссылкой:

```ts
 let chosen:{ref:LearningRef;isNew:boolean;preview?:boolean}[];
 if(refs){
  const live=await source.liveKeys(refs);
  const kept=refs.filter(ref=>live.has(unitKey(ref)));
  const states=await source.statesOf(kept);
  chosen=kept.map(ref=>({ref,isNew:!states.has(unitKey(ref))}));
 }else{
  const reserve=Math.min(plan.budget,Math.ceil(size/2));
  const newOnes=plan.newRefs.slice(0,reserve);
  const reviews=plan.reviews.slice(0,Math.max(size-newOnes.length,plan.reviews.length?1:0));
  const extraNew=plan.newRefs.slice(newOnes.length,Math.min(plan.newRefs.length,newOnes.length+Math.max(0,size-newOnes.length-reviews.length)));
  const taken=[
   ...newOnes.concat(extraNew).map(ref=>({ref,isNew:true})),
   ...reviews.slice(0,Math.max(0,size-newOnes.length-extraNew.length)).map(r=>({ref:r.ref,isNew:false})),
  ];
  // Подготовка добирает то, что осталось: она не новый материал и квоту не тратит.
  const preview=plan.preview.slice(0,Math.max(0,size-taken.length)).map(ref=>({ref,isNew:false,preview:true}));
  chosen=shuffle([...taken,...preview],random).slice(0,size);
 }
```

В сборке `items` (`learning.ts:344`) режим берётся из категории:

```ts
  items.push({id:`${id}-${items.length}`,ref:entry.ref,unitKey:key,card,...exercise,isNew:entry.isNew,mode:entry.preview?'preview':mode,expectedVersion:states.get(key)?.version??0,...(origin?{lessonTitle:origin.title,lessonPast:origin.past}:{})});
```

- [x] 3.4 Запустить — PASS

Команда: `npx vitest run tests/plan.test.ts -t 'подготовка добирает места'`

- [x] 3.5 Тест: новые и повторения имеют приоритет над подготовкой

```ts
 it('подготовка не вытесняет новые карточки и повторения',async()=>{
  const pool=words(60);
  const ids=(from:number,to:number)=>pool.slice(from,to).map(w=>w.id);
  const data=base({
   words:pool,
   courses:[course('leeke',10)],
   lessons:[lesson('l3',ids(0,40),'2026-09-22',{courseId:'leeke'})],
   states:[
    ...ids(0,4).map(id=>learned(id,'2026-09-14T09:00:00Z')), // срочные
    ...ids(4,20).map(id=>learned(id,'2026-09-30T09:00:00Z')), // подготовка
   ],
   settings:{...defaultSettings,sessionSize:20},
  });
  const session=await sessionOf({data,now});
  const byMode=(value:string)=>session.items.filter(item=>item.mode===value).length;
  expect(session.items.filter(item=>item.isNew)).toHaveLength(10);
  expect(byMode('scheduled')).toBe(14); // 10 новых и 4 повторения
  expect(byMode('preview')).toBe(6);
 });
```

Команда: `npx vitest run tests/plan.test.ts -t 'подготовка не вытесняет'`
Ожидание: PASS

- [x] 3.6 Коммит

```bash
npx vitest run tests/plan.test.ts
git add src/domain/learning.ts src/domain/types.ts tests/plan.test.ts
git commit -m "Занятие добирает свободные места подготовкой к ближайшему уроку"
```

## 4. Асимметричное правило расписания для подготовки

**Файлы:** `src/storage/ops.ts:44-47`, тест `tests/storage.test.ts`

Тесты пишутся внутри существующего `describe('запись ответа')` и пользуются его хелперами `prepare()` и `answer(session,item,extra)`. В шапке файла к импорту из `ts-fsrs` добавить `createEmptyCard` и `State`: сейчас оттуда берётся только `Rating`.

```ts
import {createEmptyCard, Rating, State} from 'ts-fsrs';
```

- [x] 4.1 Тест верного ответа в подготовке

```ts
 /** Карточка уже введена, срок через неделю: в занятии она была бы подготовкой, а не повторением. */
 const asPreview=async(item:Awaited<ReturnType<typeof makeSession>>['items'][number],due:Date)=>{
  await db.cardStates.put({unitKey:item.unitKey,ref:item.ref,introducedAt:'2026-09-14T09:00:00Z',version:1,
   card:{...createEmptyCard(new Date('2026-09-14')),due,state:State.Review,scheduled_days:5,reps:2}});
  return {...item,mode:'preview' as const,isNew:false,expectedVersion:1};
 };
 it('верный ответ в подготовке не двигает срок',async()=>{
  const {session}=await prepare();
  const due=new Date('2026-09-22T09:00:00Z');
  const item=await asPreview(session.items[0],due);
  await answer(session,item,{correct:true});
  const after=await db.cardStates.get(item.unitKey);
  expect(after!.card.due).toEqual(due);
  expect(after!.version).toBe(1);
  const event=await db.events.get(`e-${item.id}`);
  expect(event!.mode).toBe('preview');
  expect(event!.after).toBeUndefined();
 });
```

- [x] 4.2 Тест ошибки в подготовке

```ts
 it('ошибка в подготовке возвращает карточку в переучивание',async()=>{
  const {session}=await prepare();
  const due=new Date('2026-09-22T09:00:00Z');
  const item=await asPreview(session.items[1],due);
  await answer(session,item,{correct:false});
  const after=await db.cardStates.get(item.unitKey);
  expect(after!.card.state).toBe(State.Relearning);
  expect(after!.card.due.getTime()).toBeLessThan(due.getTime());
  expect(after!.version).toBe(2);
  expect((await db.events.get(`e-${item.id}`))!.rating).toBe(Rating.Again);
 });
```

- [x] 4.3 Запустить — оба падают

Команда: `npx vitest run tests/storage.test.ts -t 'подготовк'`
Ожидание: FAIL. Первый падает на типе `'preview'` (задача 3.1 уже расширила объединение, поэтому тип пройдёт — тогда он падает на `event.mode`), второй — на том, что срок не пересчитан и версия осталась единицей.

- [x] 4.4 Правка `src/storage/ops.ts`

Строку 45 заменить:

```ts
  // Досрочный верный ответ — слабое свидетельство памяти: карточку недавно показывали. Ошибка достоверна всегда.
  const movesSchedule=item.mode==='scheduled'||(item.mode==='preview'&&!correct);
  const updated=movesSchedule?nextState(state,item.ref,rating,now):undefined;
```

Вставку дополнительной попытки (`ops.ts:61`) не трогать: она остаётся `mode:'practice'`.

- [x] 4.5 Запустить — PASS

Команда: `npx vitest run tests/storage.test.ts -t 'подготовк'`

- [x] 4.6 Тест: дополнительная попытка второй раз карточку не наказывает

```ts
 it('провал дополнительной попытки расписание не двигает',async()=>{
  const {session}=await prepare();
  const item=session.items[0];
  await answer(session,item,{correct:false});
  const afterFirst=await db.cardStates.get(item.unitKey);
  const stored=(await db.sessions.get(session.id))!;
  const retry=stored.items.find(entry=>entry.retryOf===item.id)!;
  expect(retry.mode).toBe('practice');
  await answer(stored,retry,{correct:false});
  const afterRetry=await db.cardStates.get(item.unitKey);
  expect(afterRetry!.version).toBe(afterFirst!.version);
  expect(afterRetry!.card.due).toEqual(afterFirst!.card.due);
 });
```

Команда: `npx vitest run tests/storage.test.ts -t 'дополнительной попытки'`
Ожидание: PASS без правок кода. Тест страхует от того, что правило потом случайно расширят на `practice`.

- [x] 4.7 Проверить, что режим больше нигде не читается

```bash
grep -rn "\.mode\b" src | grep -v "src/storage/ops.ts"
```

Ожидание: ни одного попадания в кодеке синхронизации, статистике и сводке навыков. Спек требует, чтобы режим не влиял ни на статистику, ни на выбор упражнения; это держится тем, что читателя у поля ровно один. Если попадание появилось — разобраться до коммита.

- [x] 4.8 Коммит

```bash
npx vitest run tests/storage.test.ts
git add src/storage/ops.ts tests/storage.test.ts
git commit -m "Ошибка в досрочной подготовке возвращает карточку в переучивание"
```

## 5. Экран дня показывает подготовку

**Файлы:** `src/features/today/TodayScreen.tsx:89-94`

- [x] 5.1 Добавить строку под плиткой повторения

```tsx
     <Card size="sm">
      <CardContent>
       <div className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="size-[18px]"/>Повторение</div>
       <div className="text-[26px] leading-tight font-bold text-primary">{plan?.reviews.length??0}</div>
       {!!plan?.preview.length&&(
        <div className="mt-1 text-sm text-muted-foreground" data-testid="preview-count">
         Подготовка: {plan.courses.filter(item=>item.preview.length).map(item=>`${item.deadlines[0]!.title} — ${item.preview.length}`).join(' · ')}
        </div>
       )}
      </CardContent>
     </Card>
```

`deadlines[0]` — ближайшее занятие курса: `deadlines` наполняются в порядке обхода `upcoming`, отсортированного по дате. Курс без предстоящих занятий подготовки не даёт, поэтому обращение безопасно.

- [x] 5.2 Проверить типом и глазами

```bash
npm run typecheck
npm run dev
```

Ожидание: на экране дня под числом повторений строка «Подготовка: Урок 1.3 — 16».

- [x] 5.3 Коммит

```bash
git add src/features/today/TodayScreen.tsx
git commit -m "Экран дня показывает число карточек подготовки"
```

## 6. Эталон и полная проверка

- [x] 6.1 Посмотреть, как изменится эталон, до перезаписи

```bash
npx vitest run tests/plan-golden.test.ts
```

Ожидание: FAIL по сценарию с курсом `far` (два предстоящих занятия `f0` и `f1`). Прочитать diff и убедиться, что расхождение именно то, которого мы добивались: очередь новых сократилась до карточек `f0`, свободные места заняла подготовка с `mode:'preview'`. Любое другое расхождение — повод вернуться к задачам 1-3, а не перезаписывать эталон.

- [x] 6.2 Перезаписать эталон

```bash
UPDATE_GOLDEN=1 npx vitest run tests/plan-golden.test.ts
npx vitest run tests/plan-golden.test.ts
git diff --stat tests/fixtures/plan-golden.json
```

- [x] 6.3 Полный прогон

```bash
npm test
npm run typecheck
npm run spec
npm run build
npm run test:e2e
```

Ожидание: всё зелёное. Если падает e2e про состав занятия — разобраться, а не подгонять ожидания под вывод.

- [x] 6.4 Коммит

```bash
git add tests/fixtures/plan-golden.json
git commit -m "Перегенерировать эталон планировщика под новую очередь"
```

## 7. Проверка на живых данных

- [ ] 7.1 Собрать и обновить дев-бота по `docs/telegram-dev.md`
- [ ] 7.2 Открыть экран дня и убедиться: подпись у новых карточек — «К уроку 1.3», карточек 1.4 в занятии нет, строка подготовки показывает 1.3
- [ ] 7.3 Ответить верно на карточку подготовки, вернуться на экран дня и убедиться, что число повторений на завтра не изменилось
- [ ] 7.4 Ответить неверно на карточку подготовки и убедиться, что она вернулась в ближайшие повторения
