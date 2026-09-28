// Rows → trades (PLAN.md §6).
//
// 1. Signs: the paste loses the sign of the net P&L. It is recomputed from side and prices:
//    (exit − entry) × side × qty × $2 − fees must match |net|, give or take the price rounding
//    (prices are shown with 2 decimals: at most 0.01 pt per contract, so $0.02 × qty).
// 2. Merge: rows of the same account and side belong to one trade while the position is open:
//    - same open time, several closes → partial exits (one trade, several exits);
//    - a later open while the position is still open → scale-in (weighted average entry).
//    Re-entries and flips (a new position after the previous one closed) stay separate trades:
//    derive.ts links them.
import type { Exit, Side } from "../types.ts";
import type { RawRow } from "./paste.ts";
import { dirOf, round2, secondsBetween, type PipelineRules } from "./util.ts";

export interface SignedRow extends RawRow {
  net: number; // signed
  computedNet: number; // from prices and fees
  signFromPrices: boolean; // the paste had no sign
  mismatch: boolean; // |computed − net| beyond the price rounding tolerance
}

export function signRow(row: RawRow, rules: PipelineRules): SignedRow {
  const dir = dirOf(row.side);
  const computed = (row.exit - row.entry) * dir * row.qty * rules.pointValue - row.fees;
  // The candidate (+|net| or −|net|) closest to what the prices say.
  const net = Math.abs(computed - row.netAbs) <= Math.abs(computed + row.netAbs) ? row.netAbs : -row.netAbs;
  const tolerance = 0.02 * row.qty + 0.02;
  const conflicting = row.netSign !== null && row.netAbs > 0 && row.netSign !== Math.sign(net);
  return {
    ...row,
    net: round2(net),
    computedNet: round2(computed),
    signFromPrices: row.netSign === null,
    mismatch: conflicting || Math.abs(computed - net) > tolerance,
  };
}

/** A trade built from rows, before ids and derived fields. */
export interface ExecTrade {
  accountId: string;
  side: Side;
  qty: number;
  open: string;
  close: string;
  entry: number;
  exit: number;
  net: number;
  fees: number;
  points: number;
  exits: Exit[];
  rows: SignedRow[];
  partial: boolean; // several exits
  scaleIn: boolean; // several entry times
}

/** Rows pasted twice are identical in every column: keep one. */
export function dedupeRows<T extends RawRow>(rows: T[]): { rows: T[]; identical: T[] } {
  const seen = new Set<string>();
  const out: T[] = [];
  const identical: T[] = [];
  for (const r of rows) {
    const key = [r.accountId, r.instrument, r.open, r.close, r.side, r.qty, r.entry, r.exit, r.netAbs, r.fees].join("|");
    if (seen.has(key)) identical.push(r);
    else {
      seen.add(key);
      out.push(r);
    }
  }
  return { rows: out, identical };
}

function build(rows: SignedRow[]): ExecTrade {
  const side = rows[0].side;
  const dir = dirOf(side);
  const qty = rows.reduce((a, r) => a + r.qty, 0);
  const wavg = (f: (r: SignedRow) => number) => rows.reduce((a, r) => a + f(r) * r.qty, 0) / qty;

  // One exit per fill: rows closed at the same time and price are the same exit order.
  const exitMap = new Map<string, Exit>();
  for (const r of rows) {
    const key = `${r.close}|${r.exit}`;
    const e = exitMap.get(key);
    if (e) {
      e.qty += r.qty;
      e.net = round2(e.net + r.net);
    } else exitMap.set(key, { time: r.close, qty: r.qty, price: r.exit, net: r.net });
  }
  const exits = [...exitMap.values()].sort((a, b) => a.time.localeCompare(b.time) || dir * (a.price - b.price));
  const opens = new Set(rows.map((r) => r.open));

  return {
    accountId: rows[0].accountId,
    side,
    qty,
    open: rows.reduce((a, r) => (r.open < a ? r.open : a), rows[0].open),
    close: rows.reduce((a, r) => (r.close > a ? r.close : a), rows[0].close),
    entry: round2(wavg((r) => r.entry)),
    exit: round2(wavg((r) => r.exit)),
    net: round2(rows.reduce((a, r) => a + r.net, 0)),
    fees: round2(rows.reduce((a, r) => a + r.fees, 0)),
    points: round2(wavg((r) => (r.exit - r.entry) * dir)),
    exits,
    rows,
    partial: exits.length > 1,
    scaleIn: opens.size > 1,
  };
}

/** Groups signed rows into trades, oldest first. */
export function mergeRows(rows: SignedRow[]): ExecTrade[] {
  const sorted = [...rows].sort(
    (a, b) => a.accountId.localeCompare(b.accountId) || a.open.localeCompare(b.open) || a.close.localeCompare(b.close),
  );
  const groups: SignedRow[][] = [];
  let cur: SignedRow[] | null = null;
  let curClose = "";
  for (const r of sorted) {
    const joins =
      cur !== null &&
      r.accountId === cur[0].accountId &&
      r.side === cur[0].side &&
      (r.open === cur[0].open || r.open < curClose);
    if (joins && cur) {
      cur.push(r);
      if (r.close > curClose) curClose = r.close;
    } else {
      cur = [r];
      curClose = r.close;
      groups.push(cur);
    }
  }
  return groups.map(build).sort((a, b) => a.open.localeCompare(b.open) || a.close.localeCompare(b.close));
}

export const holdOf = (t: { open: string; close: string }) => secondsBetween(t.open, t.close);
