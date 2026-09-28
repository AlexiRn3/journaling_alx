// Editing one trade in the admin: editorial fields, publication, manual stop / target,
// classification overrides. Every derived field is then recomputed for all trades
// (a manual stop on a loser moves the average loser distance, hence the estimated stops).
import type { EntryType, Result, Session, Trade, TradesFile } from "../types.ts";
import { canonical, recompute, sessionDayOf, sessionOf, resultOf, stopSideOk, targetSideOk, changedFields, type AdminTrade, type Overrides } from "./derive.ts";
import { round2, readRules } from "./util.ts";

export interface TradeEdit {
  published?: boolean;
  story?: Partial<Trade["story"]>;
  shots?: Partial<Trade["shots"]>;
  mae?: number | null;
  mfe?: number | null;
  stop?: number | null; // null: back to the automatic stop
  target?: number | null; // null: back to the automatic target
  session?: Session;
  entry_type?: EntryType;
  result?: Result;
  session_day?: string;
}

const SESSIONS: Session[] = ["Asia", "London", "New York"];
const ENTRY_TYPES: EntryType[] = ["first", "re-entry", "flip"];
const RESULTS: Result[] = ["win", "loss", "be"];
const STORY_KEYS = ["context", "scenario", "why", "management"] as const;
const MAX_TEXT = 20000;

export const SHOT_PATH = /^\/shots\/[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpe?g|webp)$/;

/** Validates an edit coming from the network. Unknown keys are ignored. */
export function parseEdit(raw: unknown): { edit: TradeEdit; errors: string[] } {
  const errors: string[] = [];
  const edit: TradeEdit = {};
  if (!raw || typeof raw !== "object") return { edit, errors: ["The request body must be a JSON object."] };
  const r = raw as Record<string, unknown>;
  const numOrNull = (k: string, v: unknown): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
    if (!Number.isFinite(n)) {
      errors.push(`${k}: not a number.`);
      return undefined;
    }
    return n;
  };

  if (r.published !== undefined) {
    if (typeof r.published === "boolean") edit.published = r.published;
    else errors.push("published: true or false.");
  }
  if (r.story !== undefined) {
    const s = r.story as Record<string, unknown>;
    edit.story = {};
    for (const k of STORY_KEYS) {
      if (s?.[k] === undefined) continue;
      if (typeof s[k] !== "string" || (s[k] as string).length > MAX_TEXT) errors.push(`story.${k}: text up to ${MAX_TEXT} characters.`);
      else edit.story[k] = (s[k] as string).replace(/\r\n/g, "\n");
    }
  }
  if (r.shots !== undefined) {
    const s = r.shots as Record<string, unknown>;
    edit.shots = {};
    for (const k of ["before", "after"] as const) {
      if (s?.[k] === undefined) continue;
      if (s[k] === null) edit.shots[k] = null;
      else if (typeof s[k] === "string" && SHOT_PATH.test(s[k] as string)) edit.shots[k] = s[k] as string;
      else errors.push(`shots.${k}: a /shots/… image path or null.`);
    }
  }
  for (const k of ["mae", "mfe"] as const) {
    const v = numOrNull(k, r[k]);
    if (v === undefined) continue;
    if (v !== null && v < 0) errors.push(`${k.toUpperCase()}: points, 0 or more.`);
    else edit[k] = v === null ? null : round2(v);
  }
  for (const k of ["stop", "target"] as const) {
    const v = numOrNull(k, r[k]);
    if (v === undefined) continue;
    if (v !== null && v <= 0) errors.push(`${k}: a price.`);
    else edit[k] = v === null ? null : round2(v);
  }
  if (r.session !== undefined) {
    if (SESSIONS.includes(r.session as Session)) edit.session = r.session as Session;
    else errors.push("session: Asia, London or New York.");
  }
  if (r.entry_type !== undefined) {
    if (ENTRY_TYPES.includes(r.entry_type as EntryType)) edit.entry_type = r.entry_type as EntryType;
    else errors.push("entry_type: first, re-entry or flip.");
  }
  if (r.result !== undefined) {
    if (RESULTS.includes(r.result as Result)) edit.result = r.result as Result;
    else errors.push("result: win, loss or be.");
  }
  if (r.session_day !== undefined) {
    const d = String(r.session_day);
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);
    if (ok) edit.session_day = d;
    else errors.push("session_day: a date, YYYY-MM-DD.");
  }
  return { edit, errors };
}

export interface AutoValues {
  stop: Trade["stop"];
  target: Trade["target"];
  risk_usd: number;
  r: number;
  session: Session;
  entry_type: EntryType;
  gap_seconds: number | null;
  linked_to: number | null;
  result: Result;
  session_day: string;
  avgStop: number;
}

/**
 * What the pipeline computes for a trade without anything the owner set by hand
 * (manual or CSV stop and target, classification overrides). Shown next to the inputs.
 */
export function autoValues(db: TradesFile, id: number): AutoValues | null {
  const rules = readRules(db.rules);
  const trades = (db.trades as AdminTrade[]).map((t) => {
    if (t.id !== id) return t;
    const { overrides: _drop, ...rest } = t;
    void _drop;
    return {
      ...rest,
      stop: { price: 0, source: "estimated_avg_loser_distance" as const },
      target: null,
    };
  });
  const { trades: out, avgStop } = recompute(trades, rules);
  const t = out.find((x) => x.id === id);
  if (!t) return null;
  return {
    stop: t.stop,
    target: t.target,
    risk_usd: t.risk_usd,
    r: t.r,
    session: t.session,
    entry_type: t.entry_type,
    gap_seconds: t.gap_seconds,
    linked_to: t.linked_to,
    result: t.result,
    session_day: t.session_day,
    avgStop,
  };
}

export interface EditOutcome {
  db: TradesFile;
  trade: AdminTrade;
  others: number[]; // other trades whose derived fields changed (average loser distance, links)
  errors: string[];
}

export function applyTradeEdit(db: TradesFile, id: number, edit: TradeEdit): EditOutcome {
  const rules = readRules(db.rules);
  const current = (db.trades as AdminTrade[]).find((t) => t.id === id);
  if (!current) return { db, trade: undefined as unknown as AdminTrade, others: [], errors: [`Trade ${id} not found.`] };
  const errors: string[] = [];
  const t: AdminTrade = {
    ...current,
    stop: { ...current.stop },
    target: current.target ? { ...current.target } : null,
    shots: { ...current.shots },
    story: { ...current.story },
    overrides: { ...(current.overrides ?? {}) },
  };

  if (edit.published !== undefined) t.published = edit.published;
  if (edit.story) Object.assign(t.story, edit.story);
  if (edit.shots) Object.assign(t.shots, edit.shots);
  if (edit.mae !== undefined) t.mae = edit.mae;
  if (edit.mfe !== undefined) t.mfe = edit.mfe;

  // Stop and target: a typed value becomes "manual"; an empty field goes back to automatic.
  const manualDir = t.side === "Long" ? "below" : "above";
  const entry = t.entry.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (edit.stop !== undefined) {
    if (edit.stop === null) {
      if (t.stop.source === "manual" || t.stop.source === "csv") t.stop = { price: 0, source: "estimated_avg_loser_distance" };
    } else if (!stopSideOk(t, edit.stop)) {
      errors.push(`The stop of a ${t.side.toLowerCase()} must be ${manualDir} the entry (${entry}).`);
    } else if (edit.stop !== t.stop.price || t.stop.source === "manual") {
      t.stop = { price: edit.stop, source: "manual" };
    }
  }
  if (edit.target !== undefined) {
    if (edit.target === null) {
      if (t.target && (t.target.source === "manual" || t.target.source === "csv")) t.target = null;
    } else if (!targetSideOk(t, edit.target)) {
      errors.push(`The target of a ${t.side.toLowerCase()} must be ${t.side === "Long" ? "above" : "below"} the entry (${entry}).`);
    } else if (!t.target || edit.target !== t.target.price || t.target.source === "manual") {
      t.target = { price: edit.target, source: "manual" };
    }
  }
  if (errors.length) return { db, trade: current, others: [], errors };

  // Classification: a value equal to the computed one clears the override.
  const auto = autoValues(db, id);
  const ov: Overrides = t.overrides ?? {};
  const setOv = <K extends keyof Overrides>(k: K, v: Overrides[K] | undefined, computed: Overrides[K]) => {
    if (v === undefined) return;
    if (v === computed) delete ov[k];
    else ov[k] = v;
  };
  setOv("session", edit.session, auto?.session ?? sessionOf(t.open, rules));
  setOv("entry_type", edit.entry_type, auto?.entry_type ?? "first");
  setOv("result", edit.result, auto?.result ?? resultOf(t.net, rules));
  setOv("session_day", edit.session_day, auto?.session_day ?? sessionDayOf(t.open, rules));
  t.overrides = ov;
  if (!Object.keys(ov).length) delete t.overrides;

  const { trades, avgStop } = recompute(
    (db.trades as AdminTrade[]).map((x) => (x.id === id ? t : x)),
    rules,
  );
  const before = new Map((db.trades as AdminTrade[]).map((x) => [x.id, x]));
  const others = trades.filter((x) => x.id !== id && changedFields(before.get(x.id)!, x).length > 0).map((x) => x.id);
  const next: TradesFile = { meta: db.meta, rules: { ...db.rules, avg_stop_distance_pts: avgStop }, trades };
  return { db: next, trade: canonical(trades.find((x) => x.id === id)!), others, errors: [] };
}
