import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Info, Pencil, Share2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Screen } from "../../app/Screen";
import { useNow } from "../../shared/clock";
import { wordRef } from "../../domain/refs";
import { shortTitle } from "../../shared/format";
import { useShippedWord, useWord, useWordLesson, useWordLessons } from "../../shared/store";
import { shareWord } from "../../platform/share";
import { ExampleBox, ReadingNotes, WordSummary } from "./WordCardView";
import { startSession } from "../learning/session-actions";
import ui from "../../shared/ui.module.css";

export function WordScreen() {
  const { id } = useParams();
  const word = useWord(id);
  const lessons = useWordLessons(word?.id);
  // Делиться можно только словом курса: ссылка открывает его версию из каталога, а не локальную запись.
  const shipped = useWordLesson(word?.id);
  const original = useShippedWord(word?.id);
  const now = useNow();
  const navigate = useNavigate();
  const [problem, setProblem] = useState("");
  if (!word)
    return (
      <Screen back="Слово">
        <p className={ui.muted}>Слово не найдено.</p>
      </Screen>
    );
  const practice = async () => {
    const session = await startSession(now, { refs: [wordRef(word.id)], mode: "practice" });
    if (!session) return setProblem("Не удалось собрать тренировку для этого слова.");
    void navigate("/session");
  };
  return (
    <Screen
      back={lessons[0] ? lessons[0].title : "Слово"}
      right={
        <div className="flex items-center">
          {shipped && !word.deletedAt && (
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-11"
              aria-label="Поделиться словом"
              onClick={() => void shareWord(original ?? word)}
            >
              <Share2 />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-11"
            aria-label="Редактировать слово"
            render={<Link to={`/words/${word.id}/edit`} />}
          >
            <Pencil />
          </Button>
        </div>
      }
    >
      <WordSummary word={word} />
      {!word.verified && <p className={ui.note}>Фонетика не проверена — её можно уточнить в редакторе.</p>}
      <ReadingNotes word={word} />
      {word.examples.length ? (
        word.examples.map((example, index) => <ExampleBox key={index} example={example} />)
      ) : (
        <Alert className="mb-3">
          <Info />
          <AlertDescription>
            Примера употребления пока нет. <Link to={`/words/${word.id}/edit`}>Добавить пример</Link>
          </AlertDescription>
        </Alert>
      )}
      <p>
        {lessons.map((lesson) => (
          <Link key={lesson.id} to={`/lessons/${lesson.id}`} style={{ textDecoration: "none", marginRight: 8 }}>
            <Badge variant="soft" className="h-7 px-3 text-sm">
              {shortTitle(lesson.title)}
            </Badge>
          </Link>
        ))}
      </p>
      <Button variant="soft" size="xl" onClick={practice}>
        Потренировать слово
      </Button>
      {problem && <p className={ui.error}>{problem}</p>}
    </Screen>
  );
}
