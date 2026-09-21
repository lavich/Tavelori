import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Info, Pencil } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Screen } from "../../app/Screen";
import { useNow } from "../../shared/clock";
import { wordRef } from "../../domain/refs";
import { shortTitle } from "../../shared/format";
import { useWord, useWordLessons } from "../../shared/store";
import { ExampleBox, ReadingNotes, SpeakButton, WordArt } from "./WordCardView";
import { startSession } from "../learning/session-actions";
import ui from "../../shared/ui.module.css";
import wordCss from "../../shared/word.module.css";
import { cx } from "../../shared/cx";

export function WordScreen() {
  const { id } = useParams();
  const word = useWord(id);
  const lessons = useWordLessons(word?.id);
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
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-11"
          aria-label="Редактировать слово"
          render={<Link to={`/words/${word.id}/edit`} />}
        >
          <Pencil />
        </Button>
      }
    >
      <WordArt word={word} />
      <div className={cx(ui.row, ui.between)} style={{ margin: "16px 0 2px", gap: 12 }}>
        <div className={ui.grow} style={{ minWidth: 0 }}>
          <p className={wordCss.greek} style={{ margin: 0 }}>
            {word.greek}
          </p>
          {word.ipa && (
            <p className={wordCss.ipa} style={{ margin: 0 }}>
              {word.ipa}
            </p>
          )}
        </div>
        <SpeakButton word={word} />
      </div>
      <p style={{ fontSize: 19, margin: "8px 0 14px" }}>{word.russian}</p>
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
