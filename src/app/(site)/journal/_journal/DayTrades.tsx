// The trades of one session day, one row each (side panel and bottom sheet).
import Link from "next/link";
import { tradeValue, type DaySummary } from "@/lib/calc";
import { fmtTime } from "@/lib/dates";
import { resultClass } from "@/lib/format";
import type { Unit } from "@/lib/types";
import { resultText, rowLabel, sideFigure } from "./lib";
import s from "./Calendar.module.css";

interface Props {
  day: DaySummary;
  unit: Unit;
  slugs: Record<number, string>;
  variant: "panel" | "sheet";
}

export function DayTrades({ day, unit, slugs, variant }: Props) {
  return (
    <ul className={`${s.rows} ${variant === "sheet" ? s.sheetRows : ""}`}>
      {day.trades.map((t) => {
        const value = resultText(t, tradeValue(t, unit), unit);
        const second = sideFigure(t, unit);
        return (
          <li key={t.id}>
            <Link
              href={`/journal/${slugs[t.id]}`}
              className={`plain ${s.row}`}
              aria-label={`${rowLabel(t, value)}, ${second.replace("R", " R")}`}
            >
              <span className={s.icon} aria-hidden="true">
                {t.entry_type === "re-entry" ? "↻" : t.entry_type === "flip" ? "⇄" : ""}
              </span>
              <span>{fmtTime(t.open)}</span>
              <span>{t.side}</span>
              <span>{t.qty}</span>
              <span className={`${resultClass(t.result)} ${s.num}`}>{value}</span>
              <span className={`${s.num} ${s.second}`}>{second}</span>
              <span className={s.chev} aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
