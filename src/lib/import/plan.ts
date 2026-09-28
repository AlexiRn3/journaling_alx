// An import, from the pasted text (and / or the orders CSV) to the next data/trades.json.
// Pure: the API routes load the file, call planImport and, on commit, save `db`.
import type { Trade, TradesFile } from "../types.ts";
import { fmtDayShort } from "../dates.ts";
import { matchOrders, parseOrdersCsv, type CsvMatch, type CsvResult } from "./csv.ts";
import { changedFields, recompute, type AdminTrade } from "./derive.ts";
import { dedupeRows, mergeRows, signRow, type ExecTrade } from "./merge.ts";
import { parsePaste, type LineIssue } from "./paste.ts";
import { naiveET, readRules } from "./util.ts";

export interface ImportInput {
  paste?: string;
  csv?: string;
}

export interface TradeLine {
  id: number;
  open: string;
  side: Trade["side"];
  qty: number;
  net: number;
  result: Trade["result"];
  entry_type: Trade["entry_type"];
  session_day: string;
  label: string; // "Mon 28, 19:44"
}

export interface ImportReport {
  // Paste
  lines: number;
  headerLines: number;
  rowsRead: number;
  unreadable: LineIssue[];
  notes: LineIssue[];
  skipped: LineIssue[]; // other account or instrument
  identicalRows: number[]; // lines of rows pasted twice
  signs: { fromPrices: number; mismatches: { line: number; pasted: number; computed: number }[] };
  partials: { label: string; parts: number[] }[];
  scaleIns: { label: string; entries: number[] }[];
  reentries: number;
  flips: number;
  flash: { label: string; hold: number }[];
  duplicates: { label: string; id: number; note: string | null }[];
  newTrades: TradeLine[];
  // Effect on the trades already stored
  relinked: number[]; // existing trades whose link changed
  restopped: number[]; // existing trades whose stop, risk or R changed
  avgStop: { before: number; after: number };
  // Orders CSV
  csv: null | {
    orders: number;
    columns: CsvResult["columns"];
    unreadable: LineIssue[];
    error: string | null;
    matches: (CsvMatch & { label: string; applied: { stop: boolean; target: boolean } })[];
    keptManual: number[]; // trades whose manual stop / target was kept over the CSV
  };
  // Totals
  willWrite: boolean;
  summary: string; // "9 trades" / "stops for 2 trades"
}

const emptyEditorial = (): Pick<Trade, "published" | "shots" | "story" | "mae" | "mfe"> => ({
  published: true, // PLAN.md §5: every imported trade is published at once as a short sheet
  shots: { before: null, after: null },
  story: { context: "", scenario: "", why: "", management: "" },
  mae: null,
  mfe: null,
});

function toTrade(e: ExecTrade, id: number): AdminTrade {
  return {
    side: e.side,
    qty: e.qty,
    open: e.open,
    close: e.close,
    entry: e.entry,
    exit: e.exit,
    net: e.net,
    fees: e.fees,
    points: e.points,
    exits: e.exits,
    id,
    // Derived fields: filled by recompute()
    session_day: "",
    session: "Asia",
    hold_seconds: 0,
    result: "be",
    flash: false,
    entry_type: "first",
    gap_seconds: null,
    linked_to: null,
    stop: { price: 0, source: "estimated_avg_loser_distance" },
    target: null,
    risk_usd: 0,
    r: 0,
    r_estimated: true,
    pct_of_account: 0,
    ...emptyEditorial(),
  };
}

const label = (t: { session_day: string; open: string }) => `${fmtDayShort(t.session_day)}, ${t.open.slice(11, 16)}`;

function line(t: Trade): TradeLine {
  return {
    id: t.id,
    open: t.open,
    side: t.side,
    qty: t.qty,
    net: t.net,
    result: t.result,
    entry_type: t.entry_type,
    session_day: t.session_day,
    label: label(t),
  };
}

export function planImport(db: TradesFile, input: ImportInput, now: Date = new Date()): { report: ImportReport; db: TradesFile } {
  const rules = readRules(db.rules);
  const existing = db.trades as AdminTrade[];
  const accountId = db.meta.account_id;
  const instrument = db.meta.instrument || "MNQ";

  // 1. Read the paste
  const paste = parsePaste(input.paste ?? "");
  const skipped: LineIssue[] = [];
  const accepted = paste.rows.filter((r) => {
    const text = `${r.account} ${r.accountId} ${r.instrument}`.trim();
    if (accountId && r.accountId && r.accountId !== accountId) {
      skipped.push({ line: r.line, text, reason: `account ${r.accountId}, this log tracks ${accountId}` });
      return false;
    }
    if (!r.instrument.toUpperCase().startsWith(instrument.toUpperCase())) {
      skipped.push({ line: r.line, text, reason: `${r.instrument}: only ${instrument} is tracked ($${rules.pointValue} per point)` });
      return false;
    }
    return true;
  });
  const { rows, identical } = dedupeRows(accepted);
  const signed = rows.map((r) => signRow({ ...r, accountId: r.accountId || accountId }, rules));
  const merged = mergeRows(signed);

  // 2. Duplicates: same account + open time + side as a stored trade
  const key = (t: { open: string; side: string }) => `${t.open}|${t.side}`;
  const stored = new Map(existing.map((t) => [key(t), t]));
  const duplicates: ImportReport["duplicates"] = [];
  const fresh: ExecTrade[] = [];
  for (const e of merged) {
    const hit = stored.get(key(e));
    if (!hit) {
      fresh.push(e);
      continue;
    }
    const note =
      hit.qty !== e.qty || hit.exits.length !== e.exits.length
        ? `stored with ${hit.qty} contracts and ${hit.exits.length} exit${hit.exits.length > 1 ? "s" : ""}, the paste has ${e.qty} and ${e.exits.length}: kept as stored`
        : null;
    duplicates.push({ label: label(hit), id: hit.id, note });
  }
  // Same open and side twice in the paste itself cannot happen after the merge.

  // 3. New ids, in chronological order
  let nextId = existing.reduce((m, t) => Math.max(m, t.id), 0);
  const added = fresh.map((e) => toTrade(e, ++nextId));
  let all: AdminTrade[] = [...existing, ...added];

  // 4. Orders CSV: stops and targets read, not estimated (never over a manual value)
  let csvReport: ImportReport["csv"] = null;
  if (input.csv && input.csv.trim()) {
    const parsed = parseOrdersCsv(input.csv);
    const matches = parsed.error ? [] : matchOrders(all, parsed.orders, instrument);
    const keptManual: number[] = [];
    const byId = new Map(all.map((t) => [t.id, t]));
    const applied = matches.map((m) => {
      const t = byId.get(m.tradeId)!;
      const res = { stop: false, target: false };
      const next: AdminTrade = { ...t };
      if (m.stop) {
        if (t.stop.source === "manual") keptManual.push(t.id);
        else if (t.stop.source !== "csv" || t.stop.price !== m.stop.price) {
          next.stop = { price: m.stop.price, source: "csv" };
          res.stop = true;
        }
      }
      if (m.target) {
        if (t.target?.source === "manual") keptManual.push(t.id);
        else if (t.target?.source !== "csv" || t.target.price !== m.target.price) {
          next.target = { price: m.target.price, source: "csv" };
          res.target = true;
        }
      }
      byId.set(t.id, next);
      return { ...m, label: "", applied: res };
    });
    all = all.map((t) => byId.get(t.id)!);
    csvReport = {
      orders: parsed.orders.length,
      columns: parsed.columns,
      unreadable: parsed.unreadable,
      error: parsed.error,
      matches: applied,
      keptManual: [...new Set(keptManual)],
    };
  }

  // 5. Derived fields, for every trade
  const { trades, avgStop } = recompute(all, rules);
  const final = new Map(trades.map((t) => [t.id, t]));
  if (csvReport) for (const m of csvReport.matches) m.label = label(final.get(m.tradeId)!);
  const before = new Map(existing.map((t) => [t.id, t]));
  const relinked: number[] = [];
  const restopped: number[] = [];
  for (const t of trades) {
    const b = before.get(t.id);
    if (!b) continue;
    const f = changedFields(b, t);
    if (f.some((k) => k === "entry_type" || k === "linked_to" || k === "gap_seconds")) relinked.push(t.id);
    if (f.some((k) => k === "stop" || k === "risk_usd" || k === "r" || k === "target")) restopped.push(t.id);
  }

  const newIds = new Set(added.map((t) => t.id));
  const newTrades = trades.filter((t) => newIds.has(t.id));
  const linkedNew = trades.filter((t) => newIds.has(t.id) || relinked.includes(t.id));
  const csvApplied = csvReport ? csvReport.matches.filter((m) => m.applied.stop || m.applied.target).length : 0;
  const willWrite = newTrades.length > 0 || csvApplied > 0 || relinked.length > 0 || restopped.length > 0;

  const summaryParts: string[] = [];
  if (newTrades.length) summaryParts.push(`${newTrades.length} trade${newTrades.length > 1 ? "s" : ""}`);
  if (csvApplied) summaryParts.push(`CSV stops for ${csvApplied} trade${csvApplied > 1 ? "s" : ""}`);

  const report: ImportReport = {
    lines: paste.lines,
    headerLines: paste.headerLines,
    rowsRead: paste.rows.length,
    unreadable: paste.unreadable,
    notes: paste.notes,
    skipped,
    identicalRows: identical.map((r) => r.line),
    signs: {
      fromPrices: signed.filter((r) => r.signFromPrices).length,
      mismatches: signed.filter((r) => r.mismatch).map((r) => ({ line: r.line, pasted: r.net, computed: r.computedNet })),
    },
    partials: fresh
      .filter((e) => e.partial)
      .map((e) => {
        const t = trades.find((x) => x.open === e.open && x.side === e.side)!;
        return { label: label(t), parts: e.exits.map((x) => x.qty) };
      }),
    scaleIns: fresh
      .filter((e) => e.scaleIn)
      .map((e) => {
        const t = trades.find((x) => x.open === e.open && x.side === e.side)!;
        const byOpen = new Map<string, number>();
        for (const r of e.rows) byOpen.set(r.open, (byOpen.get(r.open) ?? 0) + r.qty);
        return { label: label(t), entries: [...byOpen.entries()].sort().map(([, q]) => q) };
      }),
    reentries: linkedNew.filter((t) => t.entry_type === "re-entry").length,
    flips: linkedNew.filter((t) => t.entry_type === "flip").length,
    flash: newTrades.filter((t) => t.flash).map((t) => ({ label: label(t), hold: t.hold_seconds })),
    duplicates,
    newTrades: newTrades.map(line),
    relinked,
    restopped,
    avgStop: { before: db.rules?.avg_stop_distance_pts ?? avgStop, after: avgStop },
    csv: csvReport,
    willWrite,
    summary: summaryParts.join(" · "),
  };

  const next: TradesFile = {
    meta: willWrite ? { ...db.meta, updated_at: naiveET(now) } : db.meta,
    rules: { ...db.rules, avg_stop_distance_pts: avgStop },
    trades,
  };
  return { report, db: next };
}
