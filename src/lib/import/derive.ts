// Derived fields of every trade (PLAN.md §6 and §7). Recomputed for all trades after each import
// or edit, because some depend on other trades: links (re-entry / flip), the average loser
// distance and the stops estimated from it, the stop kept from a previous attempt.
//
// Never recomputed: execution data (prices, exits, net…), editorial fields, a stop or target
// read from the orders CSV or typed in the admin, and classification the owner overrode.
import type { EntryType, Result, Session, Trade } from "../types.ts";
import { dirOf, round, round2, secondsBetween, type PipelineRules } from "./util.ts";

/** Classification the owner set by hand in the admin; wins over the computed value. */
export interface Overrides {
  session?: Session;
  entry_type?: EntryType;
  result?: Result;
  session_day?: string;
}

/**
 * A stored trade, as the admin handles it. `overrides` is an optional extra field in
 * data/trades.json (not in lib/types.ts yet): it keeps manual classification across imports.
 */
export type AdminTrade = Trade & { overrides?: Overrides };

const pad = (n: number) => String(n).padStart(2, "0");

function dayPlus(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const minuteOf = (ts: string) => Number(ts.slice(11, 13)) * 60 + Number(ts.slice(14, 16));

/**
 * CME session day: 18:00 → 17:00 ET. From 18:00 the trade belongs to the next day;
 * Sunday evening counts for Monday. A weekend day (never expected) is moved to Monday.
 */
export function sessionDayOf(open: string, rules: PipelineRules): string {
  let day = open.slice(0, 10);
  if (minuteOf(open) >= rules.sessionDayStart) day = dayPlus(day, 1);
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  if (dow === 6) day = dayPlus(day, 2);
  if (dow === 0) day = dayPlus(day, 1);
  return day;
}

/**
 * Session by entry time (ET): Asia 18:00 → 03:00, London 03:00 → 09:30, New York 09:30 → 17:00.
 * The 17:00 → 18:00 maintenance break belongs to the session that just ended (New York).
 */
export function sessionOf(open: string, rules: PipelineRules): Session {
  const m = minuteOf(open);
  const inside = (s: { start: number; end: number }) => (s.start < s.end ? m >= s.start && m < s.end : m >= s.start || m < s.end);
  const hit = rules.sessions.find(inside);
  if (hit) return hit.name;
  // Outside every range: the session whose end is the most recent.
  let best = rules.sessions[0];
  let bestAgo = Infinity;
  for (const s of rules.sessions) {
    const ago = (m - s.end + 1440) % 1440;
    if (ago < bestAgo) {
      bestAgo = ago;
      best = s;
    }
  }
  return best?.name ?? "New York";
}

export function resultOf(net: number, rules: PipelineRules): Result {
  if (Math.abs(net) <= rules.beBand) return "be";
  return net > 0 ? "win" : "loss";
}

/** Key order of a trade in data/trades.json (kept so diffs stay small). */
const KEYS = [
  "side", "qty", "open", "close", "entry", "exit", "net", "fees", "points", "exits", "id",
  "session_day", "session", "hold_seconds", "result", "flash", "entry_type", "gap_seconds", "linked_to",
  "stop", "target", "risk_usd", "r", "r_estimated", "pct_of_account",
  "published", "shots", "story", "mae", "mfe",
] as const;

export function canonical(t: AdminTrade): AdminTrade {
  const src = t as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of KEYS) out[k] = src[k];
  out.exits = t.exits.map((e) => ({ time: e.time, qty: e.qty, price: e.price, net: e.net }));
  out.stop = { price: t.stop.price, source: t.stop.source };
  out.target = t.target ? { price: t.target.price, source: t.target.source } : null;
  out.shots = { before: t.shots?.before ?? null, after: t.shots?.after ?? null };
  out.story = {
    context: t.story?.context ?? "",
    scenario: t.story?.scenario ?? "",
    why: t.story?.why ?? "",
    management: t.story?.management ?? "",
  };
  for (const k of Object.keys(src)) if (!(k in out) && k !== "overrides") out[k] = src[k]; // unknown fields survive
  if (t.overrides && Object.keys(t.overrides).length) out.overrides = { ...t.overrides };
  return out as unknown as AdminTrade;
}

const byOpen = (a: Trade, b: Trade) => a.open.localeCompare(b.open) || a.id - b.id;

const KEPT = new Set(["csv", "manual"]);

/** The target when several exits: the biggest part closed at one price, on the profit side. */
function partialFillTarget(t: Trade): number | null {
  if (t.exits.length < 2) return null;
  const dir = dirOf(t.side);
  const byPrice = new Map<number, number>();
  for (const e of t.exits) byPrice.set(e.price, (byPrice.get(e.price) ?? 0) + e.qty);
  let best: { price: number; qty: number } | null = null;
  for (const [price, qty] of byPrice) {
    if ((price - t.entry) * dir <= 0) continue;
    if (!best || qty > best.qty || (qty === best.qty && (price - best.price) * dir > 0)) best = { price, qty };
  }
  return best?.price ?? null;
}

/** Is `stop` on the losing side of the entry (below for a long, above for a short)? */
export function stopSideOk(t: Pick<Trade, "side" | "entry">, stop: number): boolean {
  return (t.entry - stop) * dirOf(t.side) > 0;
}
export function targetSideOk(t: Pick<Trade, "side" | "entry">, target: number): boolean {
  return (target - t.entry) * dirOf(t.side) > 0;
}

export interface Recomputed {
  trades: AdminTrade[]; // oldest first
  avgStop: number; // average loser distance, points (rules.avg_stop_distance_pts)
}

/** Recomputes the derived fields of every trade. Pure: returns new objects. */
export function recompute(input: AdminTrade[], rules: PipelineRules): Recomputed {
  const trades = [...input].sort(byOpen).map((t) => ({ ...t, stop: { ...t.stop }, target: t.target ? { ...t.target } : null }));
  const byId = new Map(trades.map((t) => [t.id, t]));

  // 1. Per trade: session day, session, result, hold, flash.
  for (const t of trades) {
    const ov = t.overrides ?? {};
    t.session_day = ov.session_day ?? sessionDayOf(t.open, rules);
    t.session = ov.session ?? sessionOf(t.open, rules);
    t.result = ov.result ?? resultOf(t.net, rules);
    t.hold_seconds = secondsBetween(t.open, t.close);
    t.flash = t.hold_seconds < rules.flashSeconds;
  }

  // 2. Links: the last trade closed before this one opened, within the window.
  trades.forEach((t, i) => {
    let prev: AdminTrade | null = null;
    for (let j = 0; j < i; j++) {
      const p = trades[j];
      if (p.close <= t.open && (!prev || p.close > prev.close || (p.close === prev.close && p.id > prev.id))) prev = p;
    }
    const gap = prev ? secondsBetween(prev.close, t.open) : null;
    const auto: EntryType = prev && gap !== null && gap < rules.linkWindow ? (prev.side === t.side ? "re-entry" : "flip") : "first";
    t.entry_type = t.overrides?.entry_type ?? auto;
    t.linked_to = t.entry_type !== "first" && prev ? prev.id : null;
    t.gap_seconds = t.linked_to !== null && gap !== null ? gap : null;
  });

  // 3. Losers: the exit price is the stop (unless read from the CSV or typed).
  for (const t of trades) {
    if (t.result === "loss" && !KEPT.has(t.stop.source)) t.stop = { price: t.exit, source: "exit_of_stopped_trade" };
  }
  const losers = trades.filter((t) => t.result === "loss");
  const distances = losers.map((t) => round2(Math.abs(t.entry - t.stop.price))).filter((d) => d > 0);
  const avgStop = distances.length
    ? round(distances.reduce((a, b) => a + b, 0) / distances.length, 4)
    : rules.avgStopFallback;

  // 4. Everything else: a winning re-entry keeps the stop of the stopped attempt before it;
  //    other winners and BE trades get the average loser distance, marked as estimated.
  for (const t of trades) {
    if (t.result === "loss" || KEPT.has(t.stop.source)) continue;
    const prev = t.linked_to !== null ? byId.get(t.linked_to) : undefined;
    if (
      t.result === "win" &&
      t.entry_type === "re-entry" &&
      prev &&
      prev.result === "loss" &&
      stopSideOk(t, prev.stop.price)
    ) {
      t.stop = { price: prev.stop.price, source: "previous_attempt_stop" };
    } else {
      t.stop = { price: round2(t.entry - dirOf(t.side) * avgStop), source: "estimated_avg_loser_distance" };
    }
  }

  // 5. Target, risk, R, % of the account.
  for (const t of trades) {
    if (!t.target || !KEPT.has(t.target.source)) {
      const p = partialFillTarget(t);
      t.target = p === null ? null : { price: p, source: "partial_fill" };
    }
    const estimated = t.stop.source === "estimated_avg_loser_distance";
    const distance = estimated ? avgStop : Math.abs(t.entry - t.stop.price);
    t.risk_usd = round2(distance * t.qty * rules.pointValue);
    t.r = t.risk_usd > 0 ? round2(t.net / t.risk_usd) : 0;
    t.r_estimated = estimated;
    t.pct_of_account = round2((t.net / rules.account) * 100);
  }

  return { trades: trades.map(canonical), avgStop };
}

/** Fields that recompute() may change, for "what changed" reports. */
export const DERIVED_FIELDS = [
  "session_day", "session", "result", "flash", "hold_seconds", "entry_type", "gap_seconds", "linked_to",
  "stop", "target", "risk_usd", "r", "r_estimated", "pct_of_account",
] as const;

export function changedFields(a: Trade, b: Trade): string[] {
  const A = a as unknown as Record<string, unknown>;
  const B = b as unknown as Record<string, unknown>;
  return DERIVED_FIELDS.filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
}
