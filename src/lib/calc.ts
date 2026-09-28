// Stats engine. Every figure on the public site is recomputed here from the trades,
// in the unit and over the period the visitor picked (PLAN.md, section 7).
import { addDays, addMonths, fmtTime, parseNaive, weekday } from "./dates";
import type { EntryType, Period, Result, Session, Side, Trade, Unit } from "./types";

export const ACCOUNT_USD = 50000;

/* ------------------------------------------------------------------ units */

/** R is recomputed from net ÷ risk (not the rounded stored value) so totals match PLAN.md. */
export function tradeR(t: Trade): number {
  return t.risk_usd > 0 ? t.net / t.risk_usd : 0;
}

/** Value of one trade in a unit. pts = per-contract points; % = net ÷ $50,000. */
export function tradeValue(t: Trade, unit: Unit): number {
  switch (unit) {
    case "$":
      return t.net;
    case "R":
      return tradeR(t);
    case "pts":
      return t.points;
    case "%":
      return (t.net / ACCOUNT_USD) * 100;
  }
}

/** R figures are estimates as soon as one trade's stop was estimated. */
export function isEstimated(trades: Trade[], unit: Unit): boolean {
  return unit === "R" && trades.some((t) => t.r_estimated);
}

/* ---------------------------------------------------------------- ordering */

export const byOpen = (a: Trade, b: Trade) => a.open.localeCompare(b.open) || a.id - b.id;
export const byClose = (a: Trade, b: Trade) => a.close.localeCompare(b.close) || a.id - b.id;

export function sortByOpen(trades: Trade[]): Trade[] {
  return [...trades].sort(byOpen);
}

/* ------------------------------------------------------------------ period */

/** First session day included in a period, relative to `today` (ET "YYYY-MM-DD"). null = no limit. */
export function periodStart(period: Period, today: string): string | null {
  switch (period) {
    case "1W":
      return addDays(today, -6);
    case "1M":
      return addMonths(today, -1);
    case "3M":
      return addMonths(today, -3);
    case "YTD":
      return `${today.slice(0, 4)}-01-01`;
    case "All":
      return null;
  }
}

export function filterByPeriod(trades: Trade[], period: Period, today: string): Trade[] {
  const start = periodStart(period, today);
  if (!start) return trades;
  return trades.filter((t) => t.session_day >= start);
}

/** Human label for the period, for sentences like "Net result over the last month". */
export const PERIOD_LABEL: Record<Period, string> = {
  "1W": "the last 7 days",
  "1M": "the last month",
  "3M": "the last 3 months",
  YTD: "this year",
  All: "all time",
};

/* ---------------------------------------------------------------- overview */

export interface Streak {
  count: number;
  from: Trade | null;
  to: Trade | null;
}

export interface Drawdown {
  value: number; // ≤ 0, in the unit
  peakIndex: number; // index in the equity series (0 = start, before the first trade)
  troughIndex: number;
  peak: Trade | null; // trade that set the peak (null = the starting point)
  trough: Trade | null;
}

export interface Overview {
  count: number;
  wins: number;
  losses: number;
  be: number;
  net: number;
  winRate: number | null; // % of wins among wins + losses, BE excluded
  expectancy: number | null; // mean result per trade
  profitFactor: number | null; // gross win ÷ gross loss, every trade by the sign of its net (BE included)
  avgWin: number | null;
  avgLoss: number | null;
  winLossRatio: number | null;
  maxDrawdown: Drawdown;
  fees: number; // always $
  largestWin: Trade | null;
  largestLoss: Trade | null;
  longestLosingStreak: Streak; // consecutive losses in closing order; BE trades neither extend nor break it
  medianHold: number | null; // seconds
  longestHold: number | null;
  firstDay: string | null;
  lastDay: string | null;
  sessionDays: number;
  estimated: boolean; // R built on at least one estimated stop
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function overview(trades: Trade[], unit: Unit): Overview {
  const ts = [...trades].sort(byClose);
  const v = (t: Trade) => tradeValue(t, unit);
  const wins = ts.filter((t) => t.result === "win");
  const losses = ts.filter((t) => t.result === "loss");
  const bes = ts.filter((t) => t.result === "be");
  const decisive = wins.length + losses.length;

  // Profit factor in the chosen unit. With $, it matches PLAN.md (4.04).
  const grossWin = sum(ts.map(v).filter((x) => x > 0));
  const grossLoss = -sum(ts.map(v).filter((x) => x < 0));
  const avgWin = mean(wins.map(v));
  const avgLoss = mean(losses.map(v));

  let streak: Streak = { count: 0, from: null, to: null };
  let cur: Streak = { count: 0, from: null, to: null };
  for (const t of ts) {
    if (t.result === "loss") {
      cur = { count: cur.count + 1, from: cur.from ?? t, to: t };
      if (cur.count > streak.count) streak = cur;
    } else if (t.result === "win") {
      cur = { count: 0, from: null, to: null };
    }
  }

  const largest = (list: Trade[], dir: 1 | -1) =>
    list.reduce<Trade | null>((best, t) => (!best || dir * t.net > dir * best.net ? t : best), null);

  const holds = ts.map((t) => t.hold_seconds);
  const days = [...new Set(ts.map((t) => t.session_day))].sort();

  return {
    count: ts.length,
    wins: wins.length,
    losses: losses.length,
    be: bes.length,
    net: sum(ts.map(v)),
    winRate: decisive ? (wins.length / decisive) * 100 : null,
    expectancy: mean(ts.map(v)),
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    avgWin,
    avgLoss,
    winLossRatio: avgWin !== null && avgLoss ? avgWin / Math.abs(avgLoss) : null,
    maxDrawdown: maxDrawdown(ts, unit),
    fees: sum(ts.map((t) => t.fees)),
    largestWin: largest(wins, 1),
    largestLoss: largest(losses, -1),
    longestLosingStreak: streak,
    medianHold: median(holds),
    longestHold: holds.length ? Math.max(...holds) : null,
    firstDay: days[0] ?? null,
    lastDay: days[days.length - 1] ?? null,
    sessionDays: days.length,
    estimated: isEstimated(ts, unit),
  };
}

/* ------------------------------------------------------------------ equity */

export interface EquityPoint {
  index: number; // 0 = starting point, then one per trade
  trade: Trade | null;
  value: number; // this trade's result in the unit (0 for the start)
  cum: number; // cumulative result after this trade
  peak: number; // running peak of cum (starts at 0)
  dd: number; // cum − peak, ≤ 0
}

/** Cumulative series in closing order, starting at 0 before the first trade. */
export function equity(trades: Trade[], unit: Unit): EquityPoint[] {
  const ts = [...trades].sort(byClose);
  const out: EquityPoint[] = [{ index: 0, trade: null, value: 0, cum: 0, peak: 0, dd: 0 }];
  let cum = 0;
  let peak = 0;
  ts.forEach((t, i) => {
    const value = tradeValue(t, unit);
    cum += value;
    peak = Math.max(peak, cum);
    out.push({ index: i + 1, trade: t, value, cum, peak, dd: cum - peak });
  });
  return out;
}

/** Largest fall from a running peak, on closed trades. */
export function maxDrawdown(trades: Trade[], unit: Unit): Drawdown {
  const pts = equity(trades, unit);
  let best: Drawdown = { value: 0, peakIndex: 0, troughIndex: 0, peak: null, trough: null };
  let peakIdx = 0;
  for (const p of pts) {
    if (p.cum >= pts[peakIdx].cum && p.dd === 0) peakIdx = p.index;
    if (p.dd < best.value - 1e-9) {
      best = { value: p.dd, peakIndex: peakIdx, troughIndex: p.index, peak: pts[peakIdx].trade, trough: p.trade };
    }
  }
  return best;
}

/* --------------------------------------------------------------- breakdowns */

export interface BreakdownRow {
  key: string;
  label: string;
  count: number;
  wins: number;
  losses: number;
  be: number;
  winRate: number | null;
  net: number; // in the unit
  trades: Trade[];
}

/** Groups trades by a key, keeping the given order (and showing empty groups when `keys` lists them). */
export function breakdown(
  trades: Trade[],
  unit: Unit,
  keyOf: (t: Trade) => string,
  keys: { key: string; label: string }[],
): BreakdownRow[] {
  return keys.map(({ key, label }) => {
    const ts = trades.filter((t) => keyOf(t) === key);
    const wins = ts.filter((t) => t.result === "win").length;
    const losses = ts.filter((t) => t.result === "loss").length;
    return {
      key,
      label,
      count: ts.length,
      wins,
      losses,
      be: ts.length - wins - losses,
      winRate: wins + losses ? (wins / (wins + losses)) * 100 : null,
      net: sum(ts.map((t) => tradeValue(t, unit))),
      trades: ts,
    };
  });
}

export const SESSIONS: Session[] = ["Asia", "London", "New York"];
export const SIDES: Side[] = ["Long", "Short"];
export const ENTRY_TYPES: EntryType[] = ["first", "re-entry", "flip"];
export const RESULTS: Result[] = ["win", "loss", "be"];

export const HOLD_BUCKETS = [
  { key: "<5", label: "< 5 min", max: 5 * 60 },
  { key: "5-30", label: "5 → 30 min", max: 30 * 60 },
  { key: "30-60", label: "30 → 60 min", max: 60 * 60 },
  { key: ">60", label: "> 60 min", max: Infinity },
];

export function holdBucket(t: Trade): string {
  return HOLD_BUCKETS.find((b) => t.hold_seconds < b.max)!.key;
}

/** Entry hour, "05:00". */
export function entryHour(t: Trade): string {
  return `${fmtTime(t.open).slice(0, 2)}:00`;
}

/** Weekday of the session day (1 = Monday … 5 = Friday). */
export function sessionWeekday(t: Trade): number {
  return weekday(t.session_day);
}

export function bySession(trades: Trade[], unit: Unit) {
  return breakdown(trades, unit, (t) => t.session, SESSIONS.map((s) => ({ key: s, label: s })));
}

/** Only the hours that have trades, in clock order. */
export function byHour(trades: Trade[], unit: Unit) {
  const hours = [...new Set(trades.map(entryHour))].sort();
  return breakdown(trades, unit, entryHour, hours.map((h) => ({ key: h, label: h })));
}

export function byWeekday(trades: Trade[], unit: Unit) {
  const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  return breakdown(
    trades,
    unit,
    (t) => String(sessionWeekday(t)),
    names.map((n, i) => ({ key: String(i + 1), label: n })),
  );
}

export function bySide(trades: Trade[], unit: Unit) {
  return breakdown(trades, unit, (t) => t.side, SIDES.map((s) => ({ key: s, label: s })));
}

export function byHold(trades: Trade[], unit: Unit) {
  return breakdown(trades, unit, holdBucket, HOLD_BUCKETS.map(({ key, label }) => ({ key, label })));
}

export function byEntryType(trades: Trade[], unit: Unit) {
  const labels: Record<EntryType, string> = { first: "First entry", "re-entry": "↻ Re-entry", flip: "⇄ Flip" };
  return breakdown(trades, unit, (t) => t.entry_type, ENTRY_TYPES.map((e) => ({ key: e, label: labels[e] })));
}

/* ------------------------------------------------------------- session days */

export interface DaySummary {
  day: string; // session day
  trades: Trade[]; // by open time
  net: number; // in the unit
  wins: number;
  losses: number;
  be: number;
}

/** Trades grouped by CME session day, oldest first. */
export function bySessionDay(trades: Trade[], unit: Unit): DaySummary[] {
  const map = new Map<string, Trade[]>();
  for (const t of sortByOpen(trades)) {
    const list = map.get(t.session_day) ?? [];
    list.push(t);
    map.set(t.session_day, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, ts]) => ({
      day,
      trades: ts,
      net: sum(ts.map((t) => tradeValue(t, unit))),
      wins: ts.filter((t) => t.result === "win").length,
      losses: ts.filter((t) => t.result === "loss").length,
      be: ts.filter((t) => t.result === "be").length,
    }));
}

/** Session opening time of a session day: the previous calendar day at 18:00 ET. */
export function sessionOpen(day: string): string {
  return `${addDays(day, -1)}T18:00:00`;
}

/* ------------------------------------------------------------- trade links */

/** URL slug: "2026-09-27-1944" (open date and time, ET). A second trade in the same minute gets "-2". */
export function tradeSlugs(trades: Trade[]): Map<number, string> {
  const out = new Map<number, string>();
  const seen = new Map<string, number>();
  for (const t of sortByOpen(trades)) {
    const base = `${t.open.slice(0, 10)}-${t.open.slice(11, 13)}${t.open.slice(14, 16)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.set(t.id, n === 1 ? base : `${base}-${n}`);
  }
  return out;
}

export function tradeHref(slugs: Map<number, string>, t: Trade): string {
  return `/journal/${slugs.get(t.id)}`;
}

/** Seconds between two naive timestamps (re-exported for pages). */
export function elapsed(a: string, b: string): number {
  return Math.round((parseNaive(b).getTime() - parseNaive(a).getTime()) / 1000);
}

/** The stop was not read nor typed: it comes from the average distance of stopped trades. */
export function isEstimatedStop(t: Trade): boolean {
  return t.stop.source === "estimated_avg_loser_distance";
}

/** A trade has a full sheet once it has a "before" screenshot and some explanation. */
export function hasFullSheet(t: Trade): boolean {
  const s = t.story;
  return Boolean(t.shots.before) && Boolean(s.context || s.scenario || s.why || s.management);
}
