import { ArrowRight, BookOpen, CalendarDays, ChevronRight, History, TriangleAlert } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ItemGroup } from "@/components/ui/item";
import { Screen } from "../../app/Screen";
import { localDay } from "../../domain/learning";
import { byTargetDate, preparedByCourse } from "../../domain/schedule";
import { useAction } from "../../shared/action";
import { useNow } from "../../shared/clock";
import { CARDS, dativeWeekday, dayMonth, DAYS, LESSONS, shortTitle, withCount } from "../../shared/format";
import { useActiveSession, useCatalog, useCourses, useLessons, usePlan, useSettings } from "../../shared/store";
import { startSession } from "../learning/session-actions";
import { LessonProgressBar, LessonRow } from "../lessons/LessonRow";
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
  const courses = useCourses();
  const ready = !!plan && !!installed && unfinished !== undefined;
  const next = plan?.deadlines[0];
  const lesson = next && installed?.find((item) => item.id === next.lessonId);
  const today = localDay(now, settings.timezone);
  const nextIds = nextLessonIds(installed ?? [], preparedByCourse(courses ?? [], now, settings.timezone));
  const lessons = [...(installed ?? [])].sort(byTargetDate);
  // Полный список живёт на «Уроках»; здесь — последнее проведённое занятие и ближайшие других курсов.
  // Ближайшее занятие плана показано панелью выше и строкой не повторяется.
  const last = lessons
    .filter((item) => item.status === "completed" && item.targetDate && item.targetDate <= today)
    .at(-1);
  const around = [...(last ? [last] : []), ...lessons.filter((item) => nextIds.has(item.id) && item.id !== lesson?.id)];
  const available = (catalog?.entries ?? []).filter(
    (entry) => !catalog?.packages.some((pack) => pack.lessonId === entry.id),
  ).length;

  const multi = (plan?.courses ?? []).filter((item) => item.newRefs.length);
  const split =
    multi.length > 1 && multi.map((item) => `${shortTitle(item.title)}: ${item.newRefs.length}`).join(" · ");

  /** Заголовок называет объём дня, а не девиз: что ждёт в занятии, если начать его сейчас. */
  const headline = () => {
    if (!plan || !installed || unfinished === undefined) return "Сегодня";
    if (unfinished) return "Занятие не закончено";
    // Без уроков объём дня называть нечем; что делать, объясняет карточка каталога ниже.
    if (!installed.length) return "Сегодня";
    const fresh = plan.newRefs.length;
    const reviews = plan.reviews.length;
    if (fresh && reviews)
      return `${withCount(fresh, ["новая", "новые", "новых"])} и ${withCount(reviews, ["повторение", "повторения", "повторений"])}`;
    if (fresh) return withCount(fresh, ["новая карточка", "новые карточки", "новых карточек"]);
    if (reviews) return withCount(reviews, ["повторение", "повторения", "повторений"]);
    if (plan.preview.length)
      return withCount(plan.preview.length, [
        "карточка для подготовки",
        "карточки для подготовки",
        "карточек для подготовки",
      ]);
    return "На сегодня всё";
  };

  const begin = () =>
    run(async () => {
      if (unfinished) return navigate("/session");
      const session = await startSession(now);
      if (!session)
        return setProblem(
          "На сегодня очередь пуста. Можно потренировать карточки вручную на экране урока или слово в разделе «Слова».",
        );
      void navigate("/session");
    });

  return (
    <Screen>
      <h1 data-testid="today-title">{headline()}</h1>
      {plan && (split || !!plan.preview.length) && (
        <p className={`${ui.note} -mt-3 mb-4`}>
          {split && <span data-testid="new-by-course">{split}</span>}
          {split && !!plan.preview.length && " · "}
          {!!plan.preview.length && (
            <span data-testid="preview-count">
              Подготовка:{" "}
              {plan.courses
                .filter((item) => item.preview.length)
                .map((item) => `${item.deadlines[0]!.title} — ${item.preview.length}`)
                .join(" · ")}
            </span>
          )}
        </p>
      )}

      {next && lesson ? (
        <Link to={`/lessons/${lesson.id}`} className="mb-3 block rounded-[var(--radius-card)] no-underline">
          <Card className="bg-soft ring-0 transition-colors hover:bg-[color-mix(in_srgb,var(--soft),var(--primary)_6%)]">
            {/* Стрелка стоит рядом с текстом явно, а не авторасстановкой сетки: WebKit в Telegram клал её отдельной строкой. */}
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="grid min-w-0 flex-1 gap-1">
                  <CardDescription className="flex items-center gap-2 text-accent-foreground">
                    <CalendarDays />
                    {next.daysLeft === 0
                      ? "Занятие сегодня"
                      : `К ${dativeWeekday(next.targetDate)}, ${dayMonth(next.targetDate)}`}
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold">{lesson.title}</CardTitle>
                  <CardDescription className="text-foreground/75">
                    {withCount(next.newLeft, CARDS)} ·{" "}
                    {next.daysLeft === 0 ? "сегодня день занятия" : `${withCount(next.daysLeft, DAYS)} на подготовку`}
                  </CardDescription>
                </div>
                <ChevronRight className="shrink-0 text-accent-foreground" />
              </div>
              {!!lesson.cardCount && lesson.progress && <LessonProgressBar progress={lesson.progress} />}
            </CardHeader>
          </Card>
        </Link>
      ) : (
        <Card className="mb-3 bg-soft ring-0">
          <CardHeader>
            <CardTitle className="text-xl font-bold">Занятие не назначено</CardTitle>
            <CardDescription className="text-foreground/75">
              Задайте расписание или дату набора на экране «Уроки», чтобы Lexi распределила карточки по дням.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

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

      {(!!around.length || (installed && !installed.length)) && <h2>Мои занятия</h2>}
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
      {!!around.length && (
        <ItemGroup className="gap-2.5">
          {around.map((item) => (
            <LessonRow key={item.id} lesson={item} next={nextIds.has(item.id)} />
          ))}
        </ItemGroup>
      )}
      {!!lessons.length && (
        <Button size="md" variant="soft" className="mt-2.5" render={<Link to="/lessons" />}>
          Все уроки · {lessons.length}
          <ChevronRight data-icon="inline-end" />
        </Button>
      )}
    </Screen>
  );
}
