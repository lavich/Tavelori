import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Плитка с числом в сетке `ui.tiles`: «Сегодня», результат занятия и статистика считают одинаково.
 * `size='md'` нужен одной плитке «Повторение» на «Сегодня» — у неё число на 26px против 30px у соседей.
 * Расхождение перенесено как есть; свести обе к 'lg' — правка одного слова.
 */
export function StatTile({
  head,
  value,
  label,
  note,
  size = "lg",
  testId,
}: {
  head?: ReactNode;
  value: ReactNode;
  label?: ReactNode;
  note?: ReactNode;
  size?: "lg" | "md";
  testId?: string;
}) {
  return (
    <Card size="sm">
      <CardContent>
        {head && <div className="flex items-center gap-2 text-sm text-muted-foreground">{head}</div>}
        <div className={`${size === "lg" ? "text-[30px]" : "text-[26px]"} leading-tight font-bold text-primary`}>
          {value}
        </div>
        {label && <div className="text-sm text-muted-foreground">{label}</div>}
        {note && (
          <div className="mt-1 text-sm text-muted-foreground" data-testid={testId}>
            {note}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
