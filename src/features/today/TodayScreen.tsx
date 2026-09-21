import { ArrowRight, BookOpen, CalendarDays, History, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ItemGroup } from "@/components/ui/item";
import { Screen } from "../../app/Screen";
import { localDay } from "../../domain/learning";
import { byTargetDate } from "../../domain/schedule";
import { useAction } from "../../shared/action";
import { useNow } from "../../shared/clock";
import { capitalize, CARDS, dativeWeekday, dayMonth, DAYS, LESSONS, shortTitle, withCount } from "../../shared/format";
import { StatTile } from "../../shared/StatTile";
import { useActiveSession, useCatalog, useLessons, usePlan, useSettings } from "../../shared/store";
import { startSession } from "../learning/session-actions";
import { LessonRow } from "../lessons/LessonRow";
import { nextLessonIds } from "../lessons/courses";
import ui from "../../shared/ui.module.css";

export function TodayScreen() {
  const { settings } = useSettings();
  const now = useNow();
  const navigate = useNavigate();
  const { busy, problem, setProblem, run } = useAction("Не удалось начать занятие");
  const plan = usePlan(now);
  const installed = useLessons(true);
  const unfinished = useActiveSession();
  const catalog = useCatalog();
  const ready = !!plan && !!installed && unfinished !== undefined;
  const next = plan?.deadlines[0];
  const lesson = next && installed?.find((item) => item.id === next.lessonId);
  const today = localDay(now, settings.timezone);
  const nextIds = nextLessonIds(installed ?? [], today);
  const lessons = [...(installed ?? [])].sort(byTargetDate);
  const available = (catalog?.entries ?? []).filter(
    (entry) => !catalog?.packages.some((pack) => pack.lessonId === entry.id),
  ).length;

  const begin = () =>
    run(async () => {
      if (unfinished) return navigate("/session");
      const session = await startSession(now);
      if (!session)
        return setProblem(
          "На сегодня очередь пуста. Можно потренировать карточки вручную на экране урока или слово в разделе «Слова».",
        );
      navigate("/session");
    });

  return (
    <Screen>
      <p className={ui.eyebrow}>
        {capitalize(new Date(`${today}T12:00:00Z`).toLocaleDateString("ru-RU", { weekday: "long", timeZone: "UTC" }))},{" "}
        {dayMonth(today)}
      </p>
      <h1>Немного каждый день</h1>

      <Card className="mb-3 bg-soft ring-0">
        <CardHeader>
          {next && lesson ? (
            <>
              <CardDescription className="flex items-center gap-2 text-[15px] text-accent-foreground">
                <CalendarDays />
                {next.daysLeft === 0
                  ? "Занятие сегодня"
                  : `К ${dativeWeekday(next.targetDate)}, ${dayMonth(next.targetDate)}`}
              </CardDescription>
              <CardTitle className="text-2xl font-bold">{lesson.title}</CardTitle>
              <CardDescription>
                {withCount(next.newLeft, CARDS)} ·{" "}
                {next.daysLeft === 0 ? "сегодня день занятия" : `${withCount(next.daysLeft, DAYS)} на подготовку`}
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-xl font-bold">Занятие не назначено</CardTitle>
              <CardDescription>
                Задайте расписание или дату набора на экране «Уроки», чтобы Lexi распределила карточки по дням.
              </CardDescription>
            </>
          )}
        </CardHeader>
      </Card>

      <div className={ui.tiles}>
        <StatTile
          value={plan?.newRefs.length ?? 0}
          label={plan?.budget ? "новых сегодня" : "новых на сегодня нет"}
          testId="new-by-course"
          note={
            (plan?.courses ?? []).filter((item) => item.newRefs.length).length > 1 &&
            plan!.courses
              .filter((item) => item.newRefs.length)
              .map((item) => `${shortTitle(item.title)}: ${item.newRefs.length}`)
              .join(" · ")
          }
        />
        <StatTile
          size="md"
          head={
            <>
              <RefreshCw className="size-[18px]" />
              Повторение
            </>
          }
          value={plan?.reviews.length ?? 0}
          testId="preview-count"
          note={
            !!plan?.preview.length &&
            `Подготовка: ${plan.courses
              .filter((item) => item.preview.length)
              .map((item) => `${item.deadlines[0]!.title} — ${item.preview.length}`)
              .join(" · ")}`
          }
        />
      </div>

      {!!plan?.backlog.lessons && (
        <Alert className="mb-3" data-testid="backlog">
          <History />
          <AlertTitle>Хвост прошедших занятий</AlertTitle>
          <AlertDescription>
            {withCount(plan.backlog.refs.length, CARDS)} из {withCount(plan.backlog.lessons, LESSONS)} ещё ни разу не
            показывали. Lexi добирает их в «Новые» после карточек ближайшего занятия: подготовка к нему важнее долгов.
          </AlertDescription>
        </Alert>
      )}

      {!!plan?.unavailable.length && (
        <Alert className="mb-3" data-testid="unavailable">
          <History />
          <AlertTitle>Нет доступного упражнения</AlertTitle>
          <AlertDescription>
            {withCount(plan.unavailable.length, CARDS)} без перевода и озвучки: они доступны для просмотра на экране
            урока, но не расходуют дневную квоту и не входят в темп.
          </AlertDescription>
        </Alert>
      )}

      {(plan?.courses ?? [])
        .filter((item) => item.shortfall)
        .map((item) => (
          <Alert key={item.courseId} variant="warning" className="mb-3">
            <TriangleAlert />
            <AlertTitle>«{item.title}»: дневного предела не хватает</AlertTitle>
            <AlertDescription>
              Чтобы успеть к сроку, нужно {withCount(item.requiredPerDay, CARDS)} в день, а предел курса —{" "}
              {item.newItemsPerDay}. Увеличьте предел в группе курса на экране «Уроки» или перенесите дату.
            </AlertDescription>
          </Alert>
        ))}

      <Button size="xl" onClick={begin} disabled={busy || !ready}>
        {unfinished ? "Продолжить занятие" : "Начать занятие"}
        <ArrowRight data-icon="inline-end" />
      </Button>
      {problem && <p className={ui.error}>{problem}</p>}

      <h2>Мои занятия</h2>
      {installed && !installed.length && (
        <Card className="mb-3">
          <CardHeader>
            <CardTitle className="text-lg">Уроков на устройстве пока нет</CardTitle>
            <CardDescription>
              {available
                ? `В каталоге ${withCount(available, ["урок", "урока", "уроков"])}: откройте урок, и его слова загрузятся на устройство.`
                : "Каталог ещё не загружен. Проверьте сеть или импортируйте свои слова."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="md" variant="soft" render={<Link to="/lessons" />}>
              <BookOpen data-icon="inline-start" />
              Открыть каталог
            </Button>
          </CardContent>
        </Card>
      )}
      <ItemGroup className="gap-2.5">
        {lessons.map((item) => (
          <LessonRow key={item.id} lesson={item} next={nextIds.has(item.id)} />
        ))}
      </ItemGroup>
      <Button size="xl" variant="soft" className="mt-2.5" render={<Link to="/lessons?new=1" />}>
        <Plus data-icon="inline-start" />
        Добавить занятие
      </Button>
    </Screen>
  );
}
