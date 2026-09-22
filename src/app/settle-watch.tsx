import { useEffect, useRef } from "react";
import { localDay, localHour } from "../domain/learning";

/**
 * Сторож рубежа подготовки в открытом приложении. Закрепление зависит не только от календарного дня,
 * но и от часа занятия курса, поэтому наблюдаемое значение — пара «день и местный час». Часы приложения
 * тикают раз в минуту, так что рубеж ловится с минутной точностью, а запусков за сутки не больше 24.
 * Первый рендер пропускается: закрепление при старте уже сделал `main.tsx`.
 */
export function useSettleWatch(now: Date, timezone: string, settle: () => void) {
  const stamp = `${localDay(now, timezone)}T${localHour(now, timezone)}`;
  const seen = useRef(stamp);
  const run = useRef(settle);
  run.current = settle;
  useEffect(() => {
    if (seen.current === stamp) return;
    seen.current = stamp;
    run.current();
  }, [stamp]);
}
