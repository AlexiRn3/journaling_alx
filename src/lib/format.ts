// Number formatting. Gains and losses always carry their sign; the minus is U+2212.
import type { Result, Trade, Unit } from "./types";

export const MINUS = "−";

const nf = (min: number, max = min) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });
const nf0 = nf(0);
const nf1 = nf(1);
const nf2 = nf(2);

function sign(v: number, signed: boolean): string {
  if (v < 0) return MINUS;
  if (v > 0 && signed) return "+";
  return "";
}

/**
 * Rounds half away from zero, after absorbing float noise (−169.915 is stored as −169.91499…),
 * so that −0.001 prints as 0.00, not −0.00.
 */
function clean(v: number, decimals: number): number {
  const f = 10 ** decimals;
  const r = Math.round(Number((Math.abs(v) * f).toPrecision(12))) / f;
  return v < 0 && r !== 0 ? -r : r;
}

/** "+$2,145.62", "−$493.38", "$0.00". `signed: false` drops the "+" only. */
export function fmtMoney(v: number, opts: { signed?: boolean; decimals?: number } = {}): string {
  const { signed = true, decimals = 2 } = opts;
  const c = clean(v, decimals);
  return `${sign(c, signed)}$${nf(decimals).format(Math.abs(c))}`;
}

/** Compact money for tight cells: "+$854", "+$1.3k", "−$12k". */
export function fmtMoneyCompact(v: number, signed = true): string {
  const a = Math.abs(v);
  const s = sign(clean(v, 0), signed);
  if (a >= 10000) return `${s}$${nf0.format(Math.round(a / 1000))}k`;
  if (a >= 1000) return `${s}$${nf1.format(Math.round(a / 100) / 10)}k`;
  return `${s}$${nf0.format(Math.round(a))}`;
}

export interface ValueOpts {
  signed?: boolean; // default true
  est?: boolean; // appends " est." (R values built on an estimated stop)
  compact?: boolean; // shorter form for calendar cells and chart labels
  decimals?: number;
}

/** A value in the chosen unit: "+$1,784.80", "+10.85 R", "+90.15 pts", "+3.57 %". */
export function fmtValue(v: number, unit: Unit, opts: ValueOpts = {}): string {
  const { signed = true, est = false, compact = false } = opts;
  let out: string;
  switch (unit) {
    case "$":
      out = compact ? fmtMoneyCompact(v, signed) : fmtMoney(v, { signed, decimals: opts.decimals ?? 2 });
      break;
    case "R": {
      const d = opts.decimals ?? (compact ? 1 : 2);
      const c = clean(v, d);
      out = `${sign(c, signed)}${nf(d).format(Math.abs(c))}${compact ? "R" : " R"}`;
      break;
    }
    case "pts": {
      const d = opts.decimals ?? (compact ? 1 : 2);
      const c = clean(v, d);
      out = `${sign(c, signed)}${nf(d).format(Math.abs(c))}${compact ? "p" : " pts"}`;
      break;
    }
    case "%": {
      const d = opts.decimals ?? 2;
      const c = clean(v, d);
      out = `${sign(c, signed)}${nf(d).format(Math.abs(c))}${compact ? "%" : " %"}`;
      break;
    }
  }
  return est ? `${out} est.` : out;
}

/** Axis labels: "$2,000", "$2k" (compact), "4 R", "50 pts", "2 %". Signed only below zero. */
export function fmtAxis(v: number, unit: Unit, compact = false): string {
  const s = v < 0 ? MINUS : "";
  const a = Math.abs(v);
  const n = (x: number) => (Number.isInteger(x) ? nf0.format(x) : nf1.format(x));
  switch (unit) {
    case "$":
      if (compact && a >= 1000) return `${s}$${n(a / 1000)}k`;
      return `${s}$${n(a)}`;
    case "R":
      return `${s}${n(a)} R`;
    case "pts":
      return `${s}${n(a)} pts`;
    case "%":
      return `${s}${n(a)} %`;
  }
}

/** CSS class for a signed value: "g" gain, "l" loss, "be" neutral. */
export function signClass(v: number): "g" | "l" | "be" {
  const c = clean(v, 2);
  return c > 0 ? "g" : c < 0 ? "l" : "be";
}

/** CSS class for a trade: BE trades stay neutral even when slightly positive or negative. */
export function resultClass(r: Result): "g" | "l" | "be" {
  return r === "win" ? "g" : r === "loss" ? "l" : "be";
}

/** Graphic mark colour for a trade result (points, bars). */
export function resultMark(r: Result): string {
  return r === "win" ? "var(--gm)" : r === "loss" ? "var(--lm)" : "var(--bm)";
}

/** Price: "30,809.47" */
export function fmtPrice(p: number): string {
  return nf2.format(p);
}

/** Plain number with thousands separator: "1,234". */
export function fmtInt(n: number): string {
  return nf0.format(n);
}

/** Win rate and other ratios in percent: "33.3 %". null → "–". */
export function fmtRate(v: number | null, decimals = 1): string {
  if (v === null || !Number.isFinite(v)) return "–";
  return `${nf(decimals).format(v)} %`;
}

/** Profit factor and similar ratios: "4.04", "∞", "–". */
export function fmtRatio(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "–";
  if (!Number.isFinite(v)) return "∞";
  return nf2.format(v);
}

/** Minutes, rounded half to even like the reference figures (6.98 → 7, 48.5 → 48, 1.8 → 2). */
function roundMinutes(sec: number): number {
  const m = sec / 60;
  const r = Math.round(m);
  return Math.abs(m % 1 - 0.5) < 1e-9 && r % 2 === 1 ? r - 1 : r;
}

/** Hold time: "8 s", "7 min", "1 h 05". */
export function fmtHold(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`;
  const min = roundMinutes(sec);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, "0")}`;
}

/** Gap before a linked trade: "34 s", "1 min 29 s". */
export function fmtGap(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

export const ENTRY_LABEL: Record<Trade["entry_type"], string> = {
  first: "First entry",
  "re-entry": "Re-entry",
  flip: "Flip",
};

/** Icons used next to linked trades. */
export const ENTRY_ICON: Record<Trade["entry_type"], string> = {
  first: "",
  "re-entry": "↻",
  flip: "⇄",
};

export const RESULT_LABEL: Record<Result, string> = { win: "Win", loss: "Loss", be: "Break-even" };

export const UNIT_LABEL: Record<Unit, string> = { R: "R", $: "$", pts: "points", "%": "% of the account" };
