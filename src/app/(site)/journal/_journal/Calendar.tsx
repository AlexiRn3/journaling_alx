"use client";

// Calendar view: a month of CME session days (Mon → Fri) + a week column, and the selected day
// in a sticky side panel (wide screens) or in a bottom sheet (below 960 px).

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Val } from "@/components/ui/Val";
import type { DaySummary } from "@/lib/calc";
import { dowLong, fmtDayLong, fmtDayMonth, fmtDayShort, fmtMonth, monthKey, monthWeeks, weekday } from "@/lib/dates";
import { fmtValue, resultMark, signClass } from "@/lib/format";
import type { Unit } from "@/lib/types";
import { DayTrades } from "./DayTrades";
import { dayLegend, plural, resultCounts, sessionOpenLabel } from "./lib";
import { Sheet } from "./Sheet";
import { NARROW, useMedia } from "./useMedia";
import s from "./Calendar.module.css";

interface Props {
  month: string; // "2026-09"
  days: DaySummary[]; // filtered trades by session day, every month
  selected: string | null;
  onPick: (day: string) => void;
  onMonth: (delta: 1 | -1) => void;
  canPrev: boolean;
  canNext: boolean;
  onTimeline: (day: string) => void;
  today: string;
  unit: Unit;
  slugs: Record<number, string>;
  linkWindow: number;
  /** Open the selected day's sheet on arrival (the URL named a day). */
  autoOpen: boolean;
  /** Shown instead of the day when the month has nothing to select. */
  note: ReactNode;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function Calendar(p: Props) {
  const { month, days, selected, unit, today } = p;
  const narrow = useMedia(NARROW);
  const [sheet, setSheet] = useState(false);

  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const inMonth = days.filter((d) => monthKey(d.day) === month);
  const net = inMonth.reduce((a, d) => a + d.net, 0);
  const est = unit === "R" && inMonth.some((d) => d.trades.some((t) => t.r_estimated));
  const best = inMonth.reduce<DaySummary | null>((b, d) => (!b || d.net > b.net ? d : b), null);
  const sel = selected ? byDay.get(selected) ?? null : null;

  // Arriving with ?day=… on a narrow screen: show that day's trades straight away.
  const auto = useRef(p.autoOpen);
  useEffect(() => {
    if (auto.current && sel && window.matchMedia(NARROW).matches) setSheet(true);
    auto.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (day: string) => {
    p.onPick(day);
    if (window.matchMedia(NARROW).matches) setSheet(true);
  };

  // Arrow keys move between the days that have trades.
  const onGridKey = (e: React.KeyboardEvent<HTMLTableElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const btns = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-day]")];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    const next = e.key === "Home" ? 0 : e.key === "End" ? btns.length - 1 : Math.min(btns.length - 1, Math.max(0, i + (back ? -1 : 1)));
    btns[next]?.focus();
  };

  const summary =
    inMonth.length > 0 ? (
      <>
        <Val v={net} unit={unit} est={est} /> · {plural(inMonth.length, "day")}
      </>
    ) : (
      <>No trades in {fmtMonth(month).split(" ")[0]}</>
    );

  return (
    <div className={s.layout}>
      <section className={s.main} aria-label="Calendar">
        <div className={s.monthBar}>
          <div className={s.nav}>
            <button type="button" className={`ib ${s.arrow}`} aria-label="Previous month" disabled={!p.canPrev} onClick={() => p.onMonth(-1)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <div className={s.monthTitle}>
              <h2 className={s.monthName} aria-live="polite">
                {fmtMonth(month)}
              </h2>
              <span className={`mono ${s.summaryPhone} ${inMonth.length ? signClass(net) : "pencil"}`}>
                {inMonth.length ? `${fmtValue(net, unit, { est })} · ${plural(inMonth.length, "day")}` : summary}
              </span>
            </div>
            <button type="button" className={`ib ${s.arrow}`} aria-label="Next month" disabled={!p.canNext} onClick={() => p.onMonth(1)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <span className={`mono ${s.summary}`}>
            {inMonth.length > 0 && <>Net </>}
            {summary}
            {best && best.net > 0 && inMonth.length > 1 && <> · best {fmtDayShort(best.day)}</>}
          </span>
        </div>

        <div className={s.gridWrap}>
          <table className={s.cal} onKeyDown={onGridKey}>
            <caption className="sr-only">
              {fmtMonth(month)}: one cell per CME session day, Monday to Friday, with the week total
            </caption>
            <thead>
              <tr>
                {DOW.map((d, i) => (
                  <th key={d} scope="col" className="k" aria-label={dowLong(i + 1)}>
                    {d}
                  </th>
                ))}
                <th scope="col" className={`k ${s.wkHead}`}>
                  Week
                </th>
              </tr>
            </thead>
            <tbody key={month} className={s.body}>
              {weeks.map((week) => {
                const wk = week.map((d) => byDay.get(d)).filter((d): d is DaySummary => !!d);
                const wkNet = wk.reduce((a, d) => a + d.net, 0);
                const wkCount = wk.reduce((a, d) => a + d.trades.length, 0);
                return (
                  <tr key={week[0]}>
                    {week.map((key) => {
                      const d = byDay.get(key);
                      const out = monthKey(key) !== month;
                      const isToday = key === today;
                      const isSel = key === selected;
                      const n = Number(key.slice(8));
                      const label = (
                        <span className={`${s.dn} ${isToday ? s.today : ""}`}>
                          {n}
                          {isToday && <span className={s.todayTag}> · today</span>}
                        </span>
                      );
                      if (!d) {
                        return (
                          <td key={key}>
                            <div className={`${s.day} ${out ? s.out : ""}`}>
                              {label}
                              {isToday && <span className="sr-only">today, no trades</span>}
                            </div>
                          </td>
                        );
                      }
                      const tone = signClass(d.net);
                      const aria = `${dowLong(weekday(key))} ${fmtDayMonth(key).slice(4)}, ${fmtValue(d.net, unit)}, ${plural(d.trades.length, "trade")}${isToday ? ", today" : ""}`;
                      return (
                        <td key={key}>
                          <button
                            type="button"
                            data-day={key}
                            className={`${s.day} ${s.has} ${s[tone]} ${isSel ? s.sel : ""} ${out ? s.out : ""}`}
                            aria-pressed={isSel}
                            aria-haspopup={narrow ? "dialog" : undefined}
                            aria-label={aria}
                            onClick={() => pick(key)}
                          >
                            {label}
                            <span className={`mono ${s.dv} ${tone}`}>
                              <span className={s.full}>{fmtValue(d.net, unit)}</span>
                              <span className={s.short}>{fmtValue(d.net, unit, { compact: true })}</span>
                            </span>
                            <span className={s.dt}>{plural(d.trades.length, "trade")}</span>
                            <span className={s.dots} aria-hidden="true">
                              {d.trades.map((t) => (
                                <i key={t.id} style={{ background: resultMark(t.result) }} />
                              ))}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                    <td className={s.wk}>
                      {wkCount ? (
                        <>
                          <Val v={wkNet} unit={unit} className={s.wkv} />
                          <span className={s.dt}>{plural(wkCount, "trade")}</span>
                        </>
                      ) : (
                        <span className={`mono ${s.dash}`} aria-label="No trades">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={s.legend}>
          <span>
            <i style={{ background: "var(--gm)" }} />
            win
          </span>
          <span>
            <i style={{ background: "var(--lm)" }} />
            loss
          </span>
          <span>
            <i style={{ background: "var(--bm)" }} />
            break-even
          </span>
          <span className={s.cme}>A day is a CME session, 18:00 → 17:00 ET</span>
        </div>

        {!sel && p.note && <div className={`${s.noteNarrow} fade-in`}>{p.note}</div>}
      </section>

      <aside className={s.panel} aria-label="Selected day">
        <span className="k">Selected day</span>
        {sel ? (
          <div key={sel.day} className={`${s.panelBody} fade-in`}>
            <h2 className={s.pTitle}>{fmtDayLong(sel.day)}</h2>
            <span className={`mono ${s.pOpen}`}>Session opened {sessionOpenLabel(sel.day)}</span>
            <Val v={sel.net} unit={unit} est={unit === "R" && sel.trades.some((t) => t.r_estimated)} className={s.pNet} />
            <span className={s.pCounts}>
              {plural(sel.trades.length, "trade")}
              {resultCounts(sel) && ` · ${resultCounts(sel)}`}
            </span>
            <DayTrades day={sel} unit={unit} slugs={p.slugs} variant="panel" />
            {dayLegend(sel.trades, p.linkWindow) && <span className={`mono ${s.pLegend}`}>{dayLegend(sel.trades, p.linkWindow)}</span>}
            <TimelineLink day={sel.day} onTimeline={p.onTimeline} />
          </div>
        ) : (
          <div className={`${s.panelBody} fade-in`}>{p.note}</div>
        )}
      </aside>

      <Sheet
        open={sheet && !!sel}
        onClose={() => setSheet(false)}
        title={sel ? fmtDayLong(sel.day) : ""}
        aside={sel && <Val v={sel.net} unit={unit} className={s.sNet} />}
        sub={
          sel && (
            <span className={`mono ${s.sSub}`}>
              Session from {sessionOpenLabel(sel.day)} · {plural(sel.trades.length, "trade")}
            </span>
          )
        }
      >
        {sel && (
          <>
            <DayTrades day={sel} unit={unit} slugs={p.slugs} variant="sheet" />
            {dayLegend(sel.trades, p.linkWindow, false) && (
              <span className={`mono ${s.sLegend}`}>{dayLegend(sel.trades, p.linkWindow, false)}</span>
            )}
            <TimelineLink
              day={sel.day}
              className={s.sheetLink}
              onTimeline={(d) => {
                setSheet(false);
                p.onTimeline(d);
              }}
            />
          </>
        )}
      </Sheet>
    </div>
  );
}

function TimelineLink({ day, onTimeline, className = "" }: { day: string; onTimeline: (day: string) => void; className?: string }) {
  return (
    <a
      href={`/journal?view=timeline&day=${day}`}
      className={`${s.tlLink} ${className}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onTimeline(day);
      }}
    >
      Read this day in the timeline →
    </a>
  );
}
