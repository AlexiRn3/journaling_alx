// Wording of the trade sheet: labels, notes and short sentences built from the data.
// Pure functions, shared by the server page (metadata) and the client view.
import { ACCOUNT_USD, tradeR, tradeValue } from "@/lib/calc";
import { dayKey, dowLong, fmtDateFull, fmtDayMonth, fmtDayShort, fmtTime, secondsBetween, weekday } from "@/lib/dates";
import { ENTRY_ICON, fmtGap, fmtHold, fmtPrice, fmtValue } from "@/lib/format";
import { isEstimatedStop } from "@/components/trade/MiniSchema";
import type { Exit, Result, Trade, Unit } from "@/lib/types";

/** Two spellings of the same label: desktop and mobile (390 px). */
export interface Label {
  long: string;
  short: string;
}

const same = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** +1 for a long, −1 for a short: turns price moves into points for the trade. */
export const sideSign = (t: Trade) => (t.side === "Long" ? 1 : -1);

/* ------------------------------------------------------------------ header */

/** "Mon 28 session · Sun Sep 27, 2026 · 19:44 → 20:23 ET" (desktop), "Mon 28 session · Sun 19:44 → 20:23 ET". */
export function kicker(t: Trade): Label {
  const session = `${fmtDayShort(t.session_day)} session`;
  // A trade held over midnight names the closing day too.
  const close = dayKey(t.close) === dayKey(t.open) ? fmtTime(t.close) : `${fmtDayShort(t.close).slice(0, 3)} ${fmtTime(t.close)}`;
  const span = `${fmtTime(t.open)} → ${close} ET`;
  return {
    long: `${session} · ${fmtDateFull(t.open)} · ${span}`,
    short: `${session} · ${fmtDayShort(t.open).slice(0, 3)} ${span}`,
  };
}

/** "Long MNQ, Asia session" */
export function title(t: Trade, instrument: string): string {
  return `${t.side} ${instrument}, ${t.session} session`;
}

/** Browser tab title: "Long MNQ, Sep 27 19:44" */
export function metaTitle(t: Trade, instrument: string): string {
  return `${t.side} ${instrument}, ${fmtDayMonth(t.open).slice(4)} ${fmtTime(t.open)}`;
}

const RESULT_WORD: Record<Result, string> = { win: "a win", loss: "a stop", be: "a break-even" };

/** Blue chip of a linked trade: "⇄ Flip, 34 s after a short", "↻ Re-entry, 7 s after a stop". */
export function linkChip(t: Trade, linked: Trade | null): Label | null {
  if (t.entry_type === "first") return null;
  const icon = ENTRY_ICON[t.entry_type];
  const name = t.entry_type === "flip" ? "Flip" : "Re-entry";
  const gap = t.gap_seconds !== null ? `${fmtGap(t.gap_seconds)} after ` : "after ";
  const what = !linked ? "" : t.entry_type === "flip" ? `a ${linked.side.toLowerCase()}` : RESULT_WORD[linked.result];
  return { long: what ? `${icon} ${name}, ${gap}${what}` : `${icon} ${name}`, short: `${icon} ${name}` };
}

/** "est." applies to R figures built on an estimated stop. */
export const isEst = (t: Trade, unit: Unit) => unit === "R" && t.r_estimated;

/** The trade's result in a unit, "BE " in front of break-even trades: "+$1,784.80", "BE −$13.66". */
export function resultText(t: Trade, unit: Unit, opts: { compact?: boolean } = {}): string {
  const v = fmtValue(tradeValue(t, unit), unit, { est: isEst(t, unit), compact: opts.compact });
  return t.result === "be" ? `BE ${v}` : v;
}

const UNIT_ORDER: Unit[] = ["$", "pts", "%", "R"];

/** The other units, small under the result: "+90.15 pts · +3.57 % · +10.85 R est." */
export function otherUnits(t: Trade, unit: Unit): string {
  return UNIT_ORDER.filter((u) => u !== unit)
    .map((u) => fmtValue(tradeValue(t, u), u, { est: isEst(t, u) }))
    .join(" · ");
}

/** "The Monday session" */
export function sessionName(day: string): string {
  return `The ${dowLong(weekday(day))} session`;
}

/* --------------------------------------------------------------- execution */

/** Suffix of the "Stop" label, by where the stop comes from. */
export function stopSuffix(t: Trade): Label | null {
  switch (t.stop.source) {
    case "estimated_avg_loser_distance":
      return { long: "estimated", short: "est." };
    case "csv":
      return { long: "from order", short: "from order" };
    case "previous_attempt_stop":
      return { long: "previous attempt", short: "prev. attempt" };
    case "exit_of_stopped_trade":
      return { long: "exit", short: "exit" };
    case "manual":
      return null;
  }
}

export function targetSuffix(t: Trade): Label | null {
  switch (t.target?.source) {
    case "partial_fill":
      return { long: "from fill", short: "from fill" };
    case "csv":
      return { long: "from order", short: "from order" };
    default:
      return null;
  }
}

/** Distance entry → stop in points, as used for the risk (risk = distance × contracts × point value). */
export function stopDistance(t: Trade, pointValue: number): number {
  return t.qty > 0 && pointValue > 0 ? t.risk_usd / (t.qty * pointValue) : Math.abs(t.entry - t.stop.price);
}

/** Note under the execution grid, when a figure is not read from the orders. */
export function executionNote(t: Trade, linked: Trade | null, avgStopPts: number): string | null {
  if (isEstimatedStop(t)) {
    return `Estimated values: no order export for this day, so the stop uses the average distance of stopped trades (${fmtValue(avgStopPts, "pts", { signed: false })}).`;
  }
  if (t.stop.source === "previous_attempt_stop" && linked) {
    return `The stop is the one of the previous attempt, stopped out ${fmtGap(t.gap_seconds ?? secondsBetween(linked.close, t.open))} before this entry.`;
  }
  return null;
}

/** MAE / MFE cell, in points: "3.25 / 12.50". null = not tracked. */
export function maeMfe(t: Trade): string | null {
  if (t.mae === null && t.mfe === null) return null;
  const f = (v: number | null) => (v === null ? "–" : fmtPrice(v));
  return `${f(t.mae)} / ${f(t.mfe)}`;
}

/* ------------------------------------------------------------------- exits */

/** One exit in the visitor's unit. pts = points per contract of that exit; R and % share the trade's risk and account. */
export function exitValue(t: Trade, e: Exit, unit: Unit): number {
  switch (unit) {
    case "$":
      return e.net;
    case "%":
      return (e.net / ACCOUNT_USD) * 100;
    case "R":
      return t.risk_usd > 0 ? e.net / t.risk_usd : 0;
    case "pts":
      return (e.price - t.entry) * sideSign(t);
  }
}

/** Why each exit happened: "Target, filled on 9 of 10 contracts", "Closed by hand, 8 s later", "Stopped". */
export function exitNotes(t: Trade): Label[] {
  const known = (src: string) => src !== "estimated_avg_loser_distance";
  return t.exits.map((e, i) => {
    const later = i > 0 ? `, ${fmtGap(secondsBetween(t.exits[i - 1].time, e.time))} later` : "";
    if (t.target && same(e.price, t.target.price)) {
      if (e.qty === t.qty) return { long: "Target", short: "Target" };
      return {
        long: `Target, filled on ${e.qty} of ${t.qty} contracts${later}`,
        short: `Target, filled on ${e.qty} of ${t.qty}${later}`,
      };
    }
    const atStop = known(t.stop.source) && same(e.price, t.stop.price);
    // A single losing exit at the stop, or any exit at a known stop, was stopped out.
    if (atStop || (t.exits.length === 1 && t.result === "loss" && t.stop.source === "exit_of_stopped_trade")) {
      return { long: `Stopped${later}`, short: `Stopped${later}` };
    }
    return { long: `Closed by hand${later}`, short: `Closed by hand${later}` };
  });
}

/* ---------------------------------------------------------- previous / next */

/**
 * How far the neighbour is: "34 s before", "12 min after", or its day when it belongs to another session.
 * `a` is the earlier trade, `b` the later one.
 */
export function neighbourGap(a: Trade, b: Trade, dir: "before" | "after"): string {
  const other = dir === "before" ? a : b;
  if (a.session_day !== b.session_day) return fmtDayMonth(other.open);
  const sec = secondsBetween(a.close, b.open);
  if (sec < 0) return fmtDayMonth(other.open);
  return `${sec < 120 ? fmtGap(sec) : fmtHold(sec)} ${dir}`;
}

/** "Short, Asia · 19:42" */
export function neighbourTitle(t: Trade): string {
  return `${t.side}, ${t.session} · ${fmtTime(t.open)}`;
}

/** Page description for search engines and link previews. */
export function metaDescription(t: Trade, instrument: string): string {
  const r = fmtValue(tradeR(t), "R", { est: t.r_estimated });
  const res = t.result === "be" ? "break-even" : t.result === "win" ? "win" : "loss";
  return `${t.side} ${instrument} in the ${t.session} session, ${fmtDateFull(t.open)} at ${fmtTime(t.open)} ET: ${res}, ${fmtValue(t.net, "$")} (${r}), ${t.qty} contracts, held ${fmtHold(t.hold_seconds)}.`;
}
