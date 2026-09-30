import { Link } from "react-router-dom";
import type { LearningRef } from "../../domain/types";
import { useWordsById } from "../../shared/store";

/** Сколько новых слов показать на «Сегодня»: строка должна читаться целиком, а не списком. */
const SHOWN = 4;

/**
 * Первые новые слова дня — греческим, крупно, со своим ударением. Заголовок называет число,
 * строка показывает, что за ним стоит; каждое слово открывает свою карточку.
 */
export function TodayWords({ refs }: { refs: LearningRef[] }) {
  const ids = refs.filter((ref) => ref.kind === "word").map((ref) => ref.id);
  const words = useWordsById(ids.slice(0, SHOWN));
  if (!words?.length) return null;
  const rest = refs.length - words.length;
  return (
    <div className="-mt-1 mb-5" data-testid="today-words">
      <ul lang="el" aria-label="Первые новые слова" className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {words.map((word) => (
          <li key={word!.id}>
            <Link
              to={`/words/${word!.id}`}
              className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-foreground underline decoration-muted-foreground decoration-dotted decoration-2 underline-offset-[6px] [overflow-wrap:anywhere] hover:decoration-primary"
            >
              {word!.greek}
            </Link>
          </li>
        ))}
      </ul>
      {rest > 0 && <p className="mt-1.5 text-sm text-muted-foreground">и ещё {rest}</p>}
    </div>
  );
}
