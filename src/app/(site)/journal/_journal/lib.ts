// Journal helpers: URL contract, filters, labels built from the data.
import { tradeR } from "@/lib/calc";
import { addDays, fmtDayShort, fmtTime, secondsBetween } from "@/lib/dates";
import { fmtGap, fmtHold, fmtValue } from "@/lib/format";
import type { EntryType, Result, Session, Side, Trade, Unit } from "@/lib/types";

/* ------------------------------------------------------------------ URL */

export type View = "calendar" | "cards" | "timeline";
export const VIEWS: View[] = ["calendar", "cards", "timeline"];
export const VIEW_LABEL: Record<View, string> = { calendar: "Calendar", cards: "Cards", timeline: "Timeline" };

export interface JournalQuery {
  view: View;
  day: string | null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `/journal?view=calendar|cards|timeline&day=YYYY-MM-DD`. Anything else falls back to the calendar. */
export function parseQuery(q: string): JournalQuery {
  const p = new URLSearchParams(q);
  const v = p.get("view");
  const d = p.get("day");
  return {
    view: VIEWS.includes(v as View) ? (v as View) : "calendar",
    day: d && DAY_RE.test(d) ? d : null,
  };
}

/** Same query with view and day set; other parameters are kept. The calendar is the default view. */
export function buildQuery(current: string, { view, day }: JournalQuery): string {
  const p = new URLSearchParams(current);
  if (view === "calendar") p.delete("view");
  else p.set("view", view);
  if (day) p.set("day", day);
  else p.delete("day");
  // Keep "view" before "day" so the URL reads naturally.
  const rest = [...p.entries()].filter(([k]) => k !== "view" && k !== "day");
  const out = new URLSearchParams();
  if (p.get("view")) out.set("view", p.get("view")!);
  if (p.get("day")) out.set("day", p.get("day")!);
  for (const [k, v] of rest) out.append(k, v);
  return out.toString();
}

/* -------------------------------------------------------------- filters */

export interface Filters {
  side: "all" | Side;
  result: "all" | Result;
  session: "all" | Session;
  entry: "all" | EntryType;
}

export const NO_FILTERS: Filters = { side: "all", result: "all", session: "all", entry: "all" };

export function activeFilters(f: Filters): number {
  return (Object.keys(f) as (keyof Filters)[]).filter((k) => f[k] !== "all").length;
}

export function applyFilters(trades: Trade[], f: Filters): Trade[] {
  return trades.filter(
    (t) =>
      (f.side === "all" || t.side === f.side) &&
      (f.result === "all" || t.result === f.result) &&
      (f.session === "all" || t.session === f.session) &&
      (f.entry === "all" || t.entry_type === f.entry),
  );
}

export const FILTER_GROUPS: {
  key: keyof Filters;
  label: string;
  options: { value: string; label: string }[];
}[] = [
  {
    key: "side",
    label: "Side",
    options: [
      { value: "all", label: "All" },
      { value: "Long", label: "Long" },
      { value: "Short", label: "Short" },
    ],
  },
  {
    key: "result",
    label: "Result",
    options: [
      { value: "all", label: "All" },
      { value: "win", label: "Win" },
      { value: "loss", label: "Loss" },
      { value: "be", label: "BE" },
    ],
  },
  {
    key: "session",
    label: "Session",
    options: [
      { value: "all", label: "All" },
      { value: "Asia", label: "Asia" },
      { value: "London", label: "London" },
      { value: "New York", label: "New York" },
    ],
  },
  {
    key: "entry",
    label: "Entry",
    options: [
      { value: "all", label: "All" },
      { value: "first", label: "First" },
      { value: "re-entry", label: "Re-entry" },
      { value: "flip", label: "Flip" },
    ],
  },
];

/* --------------------------------------------------------------- labels */

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Sun 18:00 ET": when the CME session of a day opened (the previous evening). */
export function sessionOpenLabel(day: string): string {
  return `${fmtDayShort(addDays(day, -1)).slice(0, 3)} 18:00 ET`;
}

/** "1 win · 3 losses · 1 break-even" (short: "1 BE"); empty parts are left out. */
export function resultCounts(d: { wins: number; losses: number; be: number }, short = false): string {
  const parts: string[] = [];
  if (d.wins) parts.push(plural(d.wins, "win"));
  if (d.losses) parts.push(plural(d.losses, "loss", "losses"));
  if (d.be) parts.push(short ? `${d.be} BE` : plural(d.be, "break-even", "break-even"));
  return parts.join(" · ");
}

/** "2 min" for the 120 s link window. */
export function windowLabel(sec: number): string {
  return sec % 60 === 0 ? `${sec / 60} min` : fmtGap(sec);
}

function listIds(ids: number[]): string {
  if (ids.length === 1) return String(ids[0]);
  return `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}`;
}

/** "↻ re-entry · ⇄ flip · within 2 min · R est. on trades 5 and 9", from the trades listed. */
export function dayLegend(trades: Trade[], linkWindow: number, withR = true): string {
  const parts: string[] = [];
  const re = trades.some((t) => t.entry_type === "re-entry");
  const flip = trades.some((t) => t.entry_type === "flip");
  if (re) parts.push("↻ re-entry");
  if (flip) parts.push("⇄ flip");
  if (re || flip) parts.push(`within ${windowLabel(linkWindow)}`);
  const est = trades.filter((t) => t.r_estimated).map((t) => t.id);
  if (withR && est.length) parts.push(`R est. on ${est.length === 1 ? "trade" : "trades"} ${listIds(est)}`);
  return parts.join(" · ");
}

/** A trade's result in the unit, "BE −$11.42" for break-even trades. */
export function resultText(t: Trade, v: number, unit: Unit, opts: { est?: boolean; compact?: boolean } = {}): string {
  return `${t.result === "be" ? "BE " : ""}${fmtValue(v, unit, opts)}`;
}

/** Second figure of a row: R, or $ when the unit is already R. */
export function sideFigure(t: Trade, unit: Unit): string {
  return unit === "R" ? fmtValue(t.net, "$", { compact: true }) : fmtValue(tradeR(t), "R", { compact: true, decimals: 2 });
}

/** Gap wording: "34 s", "1 min 29 s", then "21 min", "7 h 38" for long pauses. */
export function gapLabel(sec: number): string {
  return sec < 120 ? fmtGap(sec) : fmtHold(sec);
}

/**
 * The line above a timeline entry: how it follows the previous trade of the session.
 * Built from the whole account (not the filtered list), so "previous" is always the real previous trade.
 */
export function followLine(t: Trade, all: Trade[]): { text: string; linked: boolean } | null {
  if (t.entry_type !== "first" && t.linked_to !== null && t.gap_seconds !== null) {
    const prev = all.find((p) => p.id === t.linked_to);
    const icon = t.entry_type === "flip" ? "⇄ Flip" : "↻ Re-entry";
    const what = prev ? `closing a ${prev.side.toLowerCase()}` : "the previous close";
    return { text: `${icon}, ${gapLabel(t.gap_seconds)} after ${what}`, linked: true };
  }
  const before = all
    .filter((p) => p.session_day === t.session_day && p.close <= t.open && p.id !== t.id)
    .sort((a, b) => a.close.localeCompare(b.close));
  const prev = before[before.length - 1];
  if (!prev) return null;
  return {
    text: `First entry, ${gapLabel(secondsBetween(prev.close, t.open))} after closing a ${prev.side.toLowerCase()}`,
    linked: false,
  };
}

/** "19 min", "Flash trade, held 8 s". */
export function holdLabel(t: Trade): string {
  return t.flash ? `Flash trade, held ${fmtHold(t.hold_seconds)}` : fmtHold(t.hold_seconds);
}

export function exitsLabel(t: Trade): string {
  const n = t.exits.length;
  if (n <= 1) return "";
  const words = ["", "", "two", "three", "four", "five"];
  return `, ${words[n] ?? n} exits`;
}

/** Plain first lines of the write-up, without Markdown marks. */
export function excerpt(t: Trade, max = 180): string {
  const s = t.story;
  const src = [s.context, s.scenario, s.why, s.management].find((x) => x && x.trim()) ?? "";
  const plain = src
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max)}…`;
}

/** "19:12" → aria text for a trade row. */
export function rowLabel(t: Trade, value: string): string {
  const kind = t.entry_type === "first" ? "" : `${t.entry_type === "flip" ? "flip" : "re-entry"}, `;
  return `${fmtTime(t.open)}, ${kind}${t.side}, ${plural(t.qty, "contract")}, ${value}`;
}
