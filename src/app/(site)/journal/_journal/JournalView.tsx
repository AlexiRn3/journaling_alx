"use client";

// Journal page: three views of the same trades (Calendar, Cards, Timeline), filters, and the URL
// contract other pages link to: /journal?view=calendar|cards|timeline&day=YYYY-MM-DD.

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePeriodTrades, usePrefs } from "@/components/site/prefs";
import { swap } from "@/components/site/transitions";
import { TradeCard } from "@/components/trade/TradeCard";
import { Seg } from "@/components/ui/Seg";
import { PERIOD_LABEL, bySessionDay } from "@/lib/calc";
import { addMonths, fmtMonth, monthKey } from "@/lib/dates";
import type { Trade } from "@/lib/types";
import { Calendar } from "./Calendar";
import { FilterButton, FilterRows, FilterSheet } from "./Filters";
import { NO_FILTERS, VIEWS, VIEW_LABEL, activeFilters, applyFilters, buildQuery, parseQuery, plural, type Filters, type View } from "./lib";
import { Timeline } from "./Timeline";
import s from "./Journal.module.css";

interface Props {
  trades: Trade[]; // published, oldest first
  slugs: Record<number, string>;
  linkWindow: number; // seconds (re-entry / flip window)
}

/** Reads the query string (needs a Suspense boundary on the static page). */
export function JournalFromUrl(props: Props) {
  const sp = useSearchParams();
  return <JournalView {...props} query={sp.toString()} />;
}

const VIEW_OPTIONS = VIEWS.map((v) => ({ value: v, label: VIEW_LABEL[v] }));

export function JournalView({ trades, slugs, linkWindow, query }: Props & { query: string }) {
  const { unit, period, today } = usePrefs();
  const inPeriod = usePeriodTrades(trades);

  const [init] = useState(() => parseQuery(query));
  const [view, setView] = useState<View>(init.view);
  const [picked, setPicked] = useState<string | null>(init.day);
  const [month, setMonth] = useState<string | null>(init.day ? monthKey(init.day) : null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [scrollTo, setScrollTo] = useState<string | null>(init.view === "timeline" ? init.day : null);
  const [filterSheet, setFilterSheet] = useState(false);

  const shown = useMemo(() => applyFilters(inPeriod, filters), [inPeriod, filters]);
  const days = useMemo(() => bySessionDay(shown, unit), [shown, unit]);

  /* ---------------------------------------------------------- calendar */

  const latestDay = inPeriod.length ? inPeriod[inPeriod.length - 1].session_day : today;
  const shownMonth = month ?? monthKey(latestDay);
  const firstDay = trades.length ? trades[0].session_day : today;
  const lastDay = trades.length ? trades[trades.length - 1].session_day : today;
  const minMonth = monthKey(firstDay < today ? firstDay : today);
  const maxMonth = monthKey(lastDay > today ? lastDay : today);

  const monthDays = days.filter((d) => monthKey(d.day) === shownMonth);
  const pickedOk = !!picked && monthKey(picked) === shownMonth && days.some((d) => d.day === picked);
  // Default selection: the latest session day of the month in view.
  const selected = pickedOk ? picked : (monthDays[monthDays.length - 1]?.day ?? null);

  const goMonth = (m: string) => swap(() => setMonth(m));
  const onMonth = (delta: 1 | -1) => goMonth(addMonths(`${shownMonth}-01`, delta).slice(0, 7));
  const onPick = (day: string) => {
    if (monthKey(day) !== shownMonth) {
      swap(() => {
        setMonth(monthKey(day));
        setPicked(day);
      });
    } else {
      setPicked(day);
    }
  };
  const onTimeline = (day: string) => {
    swap(() => {
      setView("timeline");
      setPicked(day);
      setScrollTo(day);
    });
  };

  /* --------------------------------------------------------------- URL */

  // The URL keeps the view and an explicitly picked day, without adding history entries.
  const urlDay = pickedOk ? picked : null;
  const lastQuery = useRef(query);

  useEffect(() => {
    const current = window.location.search.replace(/^\?/, "");
    const next = buildQuery(current, { view, day: urlDay });
    if (next === current) return;
    lastQuery.current = next;
    window.history.replaceState(null, "", next ? `?${next}` : window.location.pathname);
  }, [view, urlDay]);

  // A link to /journal?… while the page is open (or back / forward): follow it.
  useEffect(() => {
    if (query === lastQuery.current) return;
    lastQuery.current = query;
    const q = parseQuery(query);
    swap(() => {
      setView(q.view);
      if (q.day) {
        setPicked(q.day);
        setMonth(monthKey(q.day));
        if (q.view === "timeline") setScrollTo(q.day);
      }
    });
  }, [query]);

  // Timeline opened on a day: bring that day under the top bar.
  useEffect(() => {
    if (view !== "timeline" || !scrollTo) return;
    const raf = requestAnimationFrame(() => {
      document.getElementById(`day-${scrollTo}`)?.scrollIntoView({ block: "start" });
      setScrollTo(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [view, scrollTo]);

  /* ------------------------------------------------------------ header */

  const nFilters = activeFilters(filters);
  const sessions = new Set(shown.map((t) => t.session_day)).size;
  const count =
    nFilters && shown.length !== inPeriod.length ? `${shown.length} of ${plural(inPeriod.length, "trade")}` : plural(shown.length, "trade");
  const sub =
    inPeriod.length === 0
      ? `No trades in ${PERIOD_LABEL[period]}`
      : shown.length === 0
        ? count
        : view === "calendar"
          ? `${count} · ${plural(sessions, "session")}`
          : view === "cards"
            ? `${count} · newest first`
            : `${count} · read like a logbook`;

  const changeView = (v: View) => swap(() => setView(v));
  const clearFilters = () => swap(() => setFilters(NO_FILTERS));

  /* ------------------------------------------------------------- empty */

  const empty: ReactNode =
    inPeriod.length === 0 ? (
      <Empty title={`No trades in ${PERIOD_LABEL[period]}.`}>
        <p className={s.emptyText}>Pick a longer period at the top of the page.</p>
      </Empty>
    ) : shown.length === 0 ? (
      <Empty title="No trades match these filters.">
        <button type="button" className="btn" onClick={clearFilters}>
          Clear filters
        </button>
      </Empty>
    ) : null;

  const lastShownMonth = days.length ? monthKey(days[days.length - 1].day) : null;
  const calendarNote: ReactNode =
    empty ??
    (monthDays.length === 0 ? (
      <Empty title={`No trades in ${fmtMonth(shownMonth)}.`}>
        {lastShownMonth && lastShownMonth !== shownMonth && (
          <button type="button" className="btn" onClick={() => goMonth(lastShownMonth)}>
            Go to {fmtMonth(lastShownMonth)}
          </button>
        )}
      </Empty>
    ) : null);

  return (
    <div className={`wrap ${s.page}`}>
      <div className={s.head}>
        <div className={s.titleRow}>
          <h1 className={`h1 ${s.h1}`}>Journal</h1>
          <span className={`mono ${s.sub}`}>{sub}</span>
        </div>
        <Seg size="lg" label="View" options={VIEW_OPTIONS} value={view} onChange={changeView} className={s.viewSeg} />
        <FilterButton filters={filters} onOpen={() => setFilterSheet(true)} />
      </div>
      <Seg size="lg" stretch label="View" options={VIEW_OPTIONS} value={view} onChange={changeView} className={s.viewTabs} />

      <FilterRows filters={filters} onChange={(f) => swap(() => setFilters(f))} />
      <FilterSheet
        open={filterSheet}
        onClose={() => setFilterSheet(false)}
        filters={filters}
        onChange={setFilters}
        count={shown.length}
      />

      {view === "calendar" && (
        <Calendar
          month={shownMonth}
          days={days}
          selected={selected}
          onPick={onPick}
          onMonth={onMonth}
          canPrev={shownMonth > minMonth}
          canNext={shownMonth < maxMonth}
          onTimeline={onTimeline}
          today={today}
          unit={unit}
          slugs={slugs}
          linkWindow={linkWindow}
          autoOpen={init.view === "calendar" && !!init.day}
          note={calendarNote}
        />
      )}

      {view === "cards" &&
        (empty ? (
          <div className={s.emptyWrap}>{empty}</div>
        ) : (
          <ul className={s.cards}>
            {[...shown].reverse().map((t) => (
              <li key={t.id}>
                <TradeCard trade={t} unit={unit} href={`/journal/${slugs[t.id]}`} shotHeight={200} />
              </li>
            ))}
          </ul>
        ))}

      {view === "timeline" &&
        (empty ? <div className={s.emptyWrap}>{empty}</div> : <Timeline days={days} all={trades} unit={unit} slugs={slugs} />)}
    </div>
  );
}

function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={`${s.empty} fade-in`} role="status">
      <p className={s.emptyTitle}>{title}</p>
      {children}
    </div>
  );
}
