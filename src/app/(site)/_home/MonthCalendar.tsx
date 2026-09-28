// Home, bottom left: the current month, Monday → Friday, every trade whatever the period.
// A day with trades is tinted by its net and opens that day in the Journal.
import Link from "next/link";
import { bySessionDay, isEstimated } from "@/lib/calc";
import { fmtDayLong, fmtDayShort, fmtMonthName, monthKey, monthWeeks } from "@/lib/dates";
import { fmtValue, signClass } from "@/lib/format";
import type { Trade, Unit } from "@/lib/types";
import { More, Num } from "./parts";
import s from "./home.module.css";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const TINT = { g: s.tintG, l: s.tintL, be: s.tintBe } as const;

export function MonthCalendar({ trades, unit, today }: { trades: Trade[]; unit: Unit; today: string }) {
  const month = monthKey(today);
  const weeks = monthWeeks(month);
  const monthTrades = trades.filter((t) => monthKey(t.session_day) === month);
  const days = bySessionDay(monthTrades, unit);
  const byDay = new Map(days.map((d) => [d.day, d]));
  const net = days.reduce((a, d) => a + d.net, 0);
  const est = isEstimated(monthTrades, unit);
  const best = days.reduce<(typeof days)[number] | null>((b, d) => (!b || d.net > b.net ? d : b), null);
  const title = fmtMonthName(month);

  return (
    <section className={s.month} aria-labelledby="home-month">
      <div className={s.secHead}>
        <h2 id="home-month" className="h2">
          {title}
        </h2>
        <More href="/journal" className={s.onlyWide}>
          Open the calendar
        </More>
        {days.length > 0 ? (
          <Num v={net} unit={unit} est={est} className={`${s.onlyNarrow} ${s.monthNet}`} />
        ) : (
          <span className={`mono be ${s.onlyNarrow} ${s.monthNet}`}>No trades yet</span>
        )}
      </div>

      <div className={s.cal}>
        {DOW.map((d) => (
          <span key={d} className={`k ${s.dow}`} aria-hidden="true">
            {d}
          </span>
        ))}
        {weeks.flat().map((day) => {
          const inMonth = monthKey(day) === month;
          const d = inMonth ? byDay.get(day) : undefined;
          const isToday = day === today;
          const num = Number(day.slice(8));
          const cls = [s.cell, !inMonth && s.out, d && s.has, d && TINT[signClass(d.net)], isToday && s.today]
            .filter(Boolean)
            .join(" ");
          const label = (
            <span>
              {num}
              {isToday && <span className={s.onlyWide}> · today</span>}
            </span>
          );
          if (!d) {
            return (
              <div key={day} className={cls} aria-hidden="true">
                {label}
              </div>
            );
          }
          const n = d.trades.length;
          return (
            <Link
              key={day}
              href={`/journal?day=${day}`}
              className={`plain ${cls}`}
              aria-label={`${fmtDayLong(day)}${isToday ? ", today" : ""}: ${fmtValue(d.net, unit, { est })} over ${n} trade${
                n > 1 ? "s" : ""
              }. Open in the journal.`}
            >
              {label}
              <span className={signClass(d.net)}>
                <span className={s.onlyWide}>{fmtValue(d.net, unit, unit === "$" ? { decimals: 0 } : { compact: true })}</span>
                <span className={s.onlyNarrow}>{fmtValue(d.net, unit, { compact: true })}</span>
              </span>
            </Link>
          );
        })}
      </div>

      <dl className={s.mstats}>
        <div>
          <dt className="k">Month net</dt>
          <dd>{days.length ? <Num v={net} unit={unit} est={est} /> : <span className="mono be">–</span>}</dd>
        </div>
        <div>
          <dt className="k">Trading days</dt>
          <dd className="mono">{days.length}</dd>
        </div>
        <div>
          <dt className="k">Best day</dt>
          <dd className="mono">{best ? fmtDayShort(best.day) : "–"}</dd>
        </div>
      </dl>

      <More href="/journal" className={`${s.onlyNarrow} ${s.selfStart}`}>
        Open the calendar
      </More>
    </section>
  );
}
