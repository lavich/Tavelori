import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import type { DailyPlan } from "../../domain/learning";
import { CARDS, LESSONS, lessonIn, withCount } from "../../shared/format";
import { saveCourseTempo } from "../../storage/ops";
import ui from "../../shared/ui.module.css";

/** Предел курса задаётся на «Уроках» от 0 до 100; кнопка на «Сегодня» не выходит за те же границы. */
const MAX_PER_DAY = 100;
const GENITIVE_CARDS: [string, string, string] = ["карточки", "карточек", "карточек"];

/**
 * Всё, что уточняет план дня, идёт под кнопкой тренировки, а не перед ней. Нехватка предела — решение
 * с действием на месте; хвост прошлых занятий и карточки без упражнения — справка, свёрнутая в одну строку.
 */
/** Последнее изменение предела с «Сегодня»: подтверждение с отменой переживает исчезновение строки нехватки. */
interface Raised {
  courseId: string;
  courseTitle: string;
  from: number;
  to: number;
}

export function DayNotes({ plan, now }: { plan: DailyPlan; now: Date }) {
  const [raised, setRaised] = useState<Raised | null>(null);
  const short = plan.courses.filter((item) => item.shortfall);
  if (!raised && !short.length && !plan.backlog.lessons && !plan.unavailable.length) return null;
  const undo = async () => {
    if (!raised) return;
    await saveCourseTempo(raised.courseId, { newItemsPerDay: raised.from }, now);
    setRaised(null);
  };
  return (
    <div className="mt-4 grid gap-1">
      {raised && (
        <p className={`${ui.note} flex flex-wrap items-center gap-x-3`} role="status" data-testid="limit-raised">
          <span>
            Дневной предел «{raised.courseTitle}»: {raised.from} → {raised.to}
          </span>
          <Button variant="link" className="h-11 px-0 text-sm" onClick={undo}>
            Отменить
          </Button>
        </p>
      )}
      {short.map((item) => {
        const tight = item.deadlines.reduce((max, deadline) =>
          deadline.requiredPerDay > max.requiredPerDay ? deadline : max,
        );
        return (
          <Shortfall
            key={item.courseId}
            courseId={item.courseId}
            courseTitle={item.title}
            limit={item.newItemsPerDay}
            required={item.requiredPerDay}
            lessonId={tight.lessonId}
            lessonTitle={tight.title}
            now={now}
            onRaised={setRaised}
          />
        );
      })}
      {!!plan.backlog.lessons && (
        <Note
          testId="backlog"
          summary={`${withCount(plan.backlog.refs.length, CARDS)} из ${withCount(plan.backlog.lessons, LESSONS)} ещё не показаны`}
        >
          Они придут в новых карточках после карточек ближайшего занятия: подготовка к нему идёт первой.
        </Note>
      )}
      {!!plan.unavailable.length && (
        <Note
          testId="unavailable"
          summary={`У ${withCount(plan.unavailable.length, GENITIVE_CARDS)} нет доступного упражнения`}
        >
          У них нет перевода и озвучки. Их можно посмотреть на экране урока; дневной предел они не занимают.
        </Note>
      )}
    </div>
  );
}

/**
 * Нехватка предела — строка того же веса, что справка ниже, но чернилами: это решение, а не пояснение.
 * Действия — тихие ссылки, чтобы не спорить с главной кнопкой тренировки.
 */
function Shortfall(props: {
  courseId: string;
  courseTitle: string;
  limit: number;
  required: number;
  lessonId: string;
  lessonTitle: string;
  now: Date;
  onRaised: (raised: Raised) => void;
}) {
  const [saving, setSaving] = useState(false);
  const target = Math.min(props.required, MAX_PER_DAY);
  const raise = async () => {
    setSaving(true);
    try {
      await saveCourseTempo(props.courseId, { newItemsPerDay: target }, props.now);
      props.onRaised({ courseId: props.courseId, courseTitle: props.courseTitle, from: props.limit, to: target });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div data-testid="shortfall">
      <p className="text-sm text-foreground">
        Чтобы успеть к сроку, нужно {withCount(props.required, CARDS)} в день, а дневной предел курса «
        {props.courseTitle}» — {props.limit}.
      </p>
      <div className="flex flex-wrap gap-x-5">
        {target > props.limit && (
          <Button variant="link" className="h-11 px-0 text-sm" onClick={raise} disabled={saving}>
            {saving ? "Сохраняем…" : `Поднять предел до ${target}`}
          </Button>
        )}
        <Link
          to={`/lessons/${props.lessonId}`}
          className={cn(buttonVariants({ variant: "link" }), "h-11 px-0 text-sm")}
        >
          Перенести дату {lessonIn(props.lessonTitle, "урока")}
        </Link>
      </div>
    </div>
  );
}

/** Справка в одну строку: подробность раскрывается по нажатию, как в `<details>`, и остаётся доступной с клавиатуры. */
function Note({ testId, summary, children }: { testId: string; summary: string; children: React.ReactNode }) {
  return (
    <details className="group" data-testid={testId}>
      <summary
        className={`${ui.note} flex min-h-11 cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden`}
      >
        {summary}
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <p className={`${ui.note} mb-2`}>{children}</p>
    </details>
  );
}
