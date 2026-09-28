// Date helpers for naive ET wall-clock strings ("2026-09-27T19:44:34") and day keys ("2026-09-28").
// Everything is computed in UTC on purpose so the visitor's time zone never shifts a value.

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Parses "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM[:SS]" as if it were UTC. */
export function parseNaive(s: string): Date {
  const [d, t = "00:00:00"] = s.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm, ss = 0] = t.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, day, hh, mm, ss));
}

/** "YYYY-MM-DD" of a naive timestamp or Date (UTC fields). */
export function dayKey(v: string | Date): string {
  if (typeof v === "string") return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = parseNaive(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dayKey(d);
}

export function addMonths(day: string, n: number): string {
  const d = parseNaive(day);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return dayKey(target);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(v: string): number {
  return parseNaive(v).getUTCDay();
}

export function monthKey(day: string): string {
  return day.slice(0, 7); // "2026-09"
}

/** "HH:MM" of a naive timestamp. */
export function fmtTime(ts: string, seconds = false): string {
  return ts.slice(11, seconds ? 19 : 16);
}

/** "Mon 28" */
export function fmtDayShort(v: string): string {
  const d = parseNaive(v);
  return `${DOW_SHORT[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** "Fri Sep 25" */
export function fmtDayMonth(v: string): string {
  const d = parseNaive(v);
  return `${DOW_SHORT[d.getUTCDay()]} ${MON_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Monday, Sep 28" */
export function fmtDayLong(v: string): string {
  const d = parseNaive(v);
  return `${DOW_LONG[d.getUTCDay()]}, ${MON_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Sep 25, 2026" */
export function fmtDate(v: string): string {
  const d = parseNaive(v);
  return `${MON_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "Sun Sep 27, 2026" */
export function fmtDateFull(v: string): string {
  const d = parseNaive(v);
  return `${DOW_SHORT[d.getUTCDay()]} ${MON_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "September 2026" (month key or day) */
export function fmtMonth(v: string): string {
  const d = parseNaive(v.length === 7 ? `${v}-01` : v);
  return `${MON_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "September" */
export function fmtMonthName(v: string): string {
  const d = parseNaive(v.length === 7 ? `${v}-01` : v);
  return MON_LONG[d.getUTCMonth()];
}

export function dowShort(i: number): string {
  return DOW_SHORT[i];
}
export function dowLong(i: number): string {
  return DOW_LONG[i];
}

/** Seconds between two naive timestamps. */
export function secondsBetween(a: string, b: string): number {
  return Math.round((parseNaive(b).getTime() - parseNaive(a).getTime()) / 1000);
}

/** Today's date in ET ("YYYY-MM-DD"), from the real clock. Client-side only. */
export function todayET(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

/**
 * Weeks of a month, Monday → Friday only (the CME session calendar has no weekend column).
 * Each week is 5 day keys; days outside the month are included so the grid stays rectangular.
 */
export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const firstDow = weekday(first); // 0 Sun … 6 Sat
  // Monday of the week containing the first weekday of the month
  let start = addDays(first, firstDow === 0 ? 1 : firstDow === 6 ? 2 : 1 - firstDow);
  if (monthKey(start) > month) start = addDays(start, -7); // never happens, kept for safety
  const weeks: string[][] = [];
  let cur = start;
  while (true) {
    const week = [0, 1, 2, 3, 4].map((i) => addDays(cur, i));
    if (week.every((d) => monthKey(d) > month)) break;
    if (week.some((d) => monthKey(d) === month)) weeks.push(week);
    cur = addDays(cur, 7);
  }
  return weeks;
}
