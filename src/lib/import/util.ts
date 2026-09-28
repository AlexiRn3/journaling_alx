// Small helpers shared by the import pipeline (pure, no Node or browser APIs).
// Imports carry the .ts extension so the tests also run with `node --test --experimental-strip-types`.
import type { Rules, Session, Side } from "../types.ts";

/**
 * Rounds the exact binary value to `d` decimals, exact ties away from zero (Number#toFixed).
 * This reproduces the stored figures: 30,772.54 + 8.225 is 30,780.76499… in binary, so it gives 30,780.76.
 */
export function round(x: number, d = 2): number {
  const r = Number(x.toFixed(d));
  return r === 0 ? 0 : r; // never −0
}
export const round2 = (x: number) => round(x, 2);

export const dirOf = (side: Side): 1 | -1 => (side === "Long" ? 1 : -1);

/** "2026-09-27T19:44:34" + n seconds, computed in UTC fields so no time zone shifts it. */
export function addSeconds(ts: string, n: number): string {
  const d = new Date(Date.parse(`${ts}Z`) + n * 1000);
  return d.toISOString().slice(0, 19);
}

export function secondsBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}Z`) - Date.parse(`${a}Z`)) / 1000);
}

const ET_ZONE = "America/Toronto";

/** Wall-clock time in ET of an instant, as a naive string ("2026-09-28T09:58:00"). */
export function naiveET(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

/* ------------------------------------------------------------------ rules */

export interface PipelineRules {
  pointValue: number; // $ per point per contract (MNQ: 2)
  account: number; // starting balance, for % of the account
  beBand: number; // |net| ≤ band → break-even
  linkWindow: number; // seconds: re-entry / flip window
  flashSeconds: number; // held < this → flash trade
  sessionDayStart: number; // minutes after midnight ET (18:00 → 1080)
  sessions: { name: Session; start: number; end: number }[]; // minutes, end exclusive, may wrap midnight
  avgStopFallback: number; // used while no trade is a loser
}

export const FLASH_SECONDS = 30;

function minutes(hhmm: string): number {
  const m = /(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** Reads the `rules` block of data/trades.json, with the PLAN.md values as defaults. */
export function readRules(r: Partial<Rules> | undefined): PipelineRules {
  const sessionsEt = r?.sessions_et ?? { Asia: "18:00-03:00", London: "03:00-09:30", "New York": "09:30-17:00" };
  const sessions = (Object.entries(sessionsEt) as [Session, string][])
    .map(([name, span]) => {
      const [a, b] = span.split(/\s*(?:-|–|→)\s*/);
      return { name, start: minutes(a), end: minutes(b) };
    })
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end));
  const start = minutes(r?.session_day ?? "18:00");
  return {
    pointValue: r?.point_value_usd ?? 2,
    account: r?.account_start_usd ?? 50000,
    beBand: r?.breakeven_band_usd ?? 30,
    linkWindow: r?.link_window_seconds ?? 120,
    flashSeconds: FLASH_SECONDS,
    sessionDayStart: Number.isFinite(start) ? start : 18 * 60,
    sessions,
    avgStopFallback: r?.avg_stop_distance_pts ?? 0,
  };
}
