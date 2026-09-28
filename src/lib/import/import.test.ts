// Import pipeline tests. Run: npx tsx --test src/lib/import/import.test.ts
// (also: node --test --experimental-strip-types src/lib/import/import.test.ts)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import type { Trade, TradesFile } from "../types.ts";
import { parseOrdersCsv, readStamp } from "./csv.ts";
import { recompute, sessionDayOf, sessionOf, type AdminTrade } from "./derive.ts";
import { applyTradeEdit, autoValues, parseEdit } from "./edit.ts";
import { signRow } from "./merge.ts";
import { parsePaste } from "./paste.ts";
import { planImport } from "./plan.ts";
import { readRules } from "./util.ts";

const DATA = new URL("../../../data/", import.meta.url);
const FILE_TEXT = fs.readFileSync(new URL("trades.json", DATA), "utf8");
const STORED = (): TradesFile => JSON.parse(FILE_TEXT);

interface RawJson {
  account: string;
  instrument: string;
  open: string;
  close: string;
  side: string;
  qty: number;
  entry: number;
  exit: number;
  net: number;
  fees: number;
  net_pasted_unsigned: number;
}
const RAW: RawJson[] = JSON.parse(fs.readFileSync(new URL("trades-raw-tradesea.json", DATA), "utf8"));

const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function stamp12(ts: string): string {
  const [d, t] = ts.split("T");
  const [h, m, s] = t.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${d}, ${h12}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** A row as Tradesea Compass pastes it: the net without its sign. */
function pasteRow(r: RawJson, sep = "  "): string {
  const [name, id] = r.account.split(" ");
  return [name, id, r.instrument, stamp12(r.open), stamp12(r.close), r.side, r.qty, money(r.entry), money(r.exit), money(r.net_pasted_unsigned), money(r.fees)].join(sep);
}
const PASTE = RAW.map((r) => pasteRow(r)).join("\n");

const emptyDb = (): TradesFile => {
  const db = STORED();
  return { ...db, trades: [] };
};

/**
 * Stored values that differ from the pipeline on purpose, explained in the admin report.
 * Trade 9's exit is the weighted average of 9 @ 30,900.25 and 1 @ 30,894.00 = 30,899.625 exactly:
 * the file holds 30,899.62 (round half to even), the pipeline rounds half away from zero, 30,899.63,
 * like the plan board (02-donnees-import-calculs.html) and the admin wireframe. Points (+90.15),
 * net, risk and R do not depend on it: points are averaged per contract from the rows.
 */
const KNOWN_SLIPS: Record<string, { stored: unknown; computed: unknown }> = {
  "9.exit": { stored: 30899.62, computed: 30899.63 },
};

test("pasting the 10 raw Tradesea rows reproduces the 9 trades of data/trades.json", () => {
  const stored = STORED();
  const { report, db } = planImport(emptyDb(), { paste: PASTE }, new Date("2026-09-28T14:00:00Z"));

  assert.equal(report.rowsRead, 10);
  assert.deepEqual(report.unreadable, []);
  assert.equal(report.signs.fromPrices, 10);
  assert.deepEqual(report.signs.mismatches, []);
  assert.deepEqual(report.partials, [{ label: "Mon 28, 19:44", parts: [9, 1] }]);
  assert.deepEqual(report.scaleIns, []);
  assert.equal(report.reentries, 3);
  assert.equal(report.flips, 2);
  assert.deepEqual(report.flash, [{ label: "Fri 25, 05:15", hold: 8 }]);
  assert.equal(report.duplicates.length, 0);
  assert.equal(report.newTrades.length, 9);
  assert.equal(report.willWrite, true);
  assert.equal(db.meta.updated_at, "2026-09-28T10:00:00"); // 14:00 UTC = 10:00 EDT
  assert.equal(db.rules.avg_stop_distance_pts, 8.225);
  assert.equal(db.trades.length, 9);

  for (const want of stored.trades) {
    const got = db.trades.find((t) => t.id === want.id);
    assert.ok(got, `trade ${want.id} missing`);
    for (const k of Object.keys(want) as (keyof Trade)[]) {
      const slip = KNOWN_SLIPS[`${want.id}.${k}`];
      if (slip) {
        assert.deepEqual(want[k], slip.stored);
        assert.deepEqual(got[k], slip.computed, `trade ${want.id}.${k}`);
        continue;
      }
      assert.deepEqual(got[k], want[k], `trade ${want.id}.${k}`);
    }
    assert.deepEqual(Object.keys(got), Object.keys(want), `key order of trade ${want.id}`);
  }
});

test("the stored file is a fixed point: recomputing it changes nothing, byte for byte", () => {
  const db = STORED();
  const { trades, avgStop } = recompute(db.trades, readRules(db.rules));
  const out = { ...db, rules: { ...db.rules, avg_stop_distance_pts: avgStop }, trades };
  assert.equal(JSON.stringify(out, null, 2) + "\n", FILE_TEXT);
});

test("re-importing the same rows skips 9 duplicates and writes nothing", () => {
  const db = STORED();
  const { report, db: next } = planImport(db, { paste: PASTE });
  assert.equal(report.duplicates.length, 9);
  assert.ok(report.duplicates.every((d) => d.note === null));
  assert.equal(report.newTrades.length, 0);
  assert.equal(report.willWrite, false);
  assert.equal(JSON.stringify(next, null, 2) + "\n", FILE_TEXT);
});

test("importing in two batches relinks and restops the trades already stored", () => {
  // First only the rows of the last trade (#9 in the file), then everything.
  const last = RAW.filter((r) => r.open === "2026-09-27T19:44:34").map((r) => pasteRow(r)).join("\n");
  const a = planImport(emptyDb(), { paste: last });
  assert.equal(a.db.trades.length, 1);
  assert.equal(a.db.trades[0].entry_type, "first");
  const b = planImport(a.db, { paste: PASTE });
  assert.equal(b.report.duplicates.length, 1);
  assert.equal(b.report.newTrades.length, 8);
  assert.deepEqual(b.report.relinked, [1]);
  const t = b.db.trades.find((x) => x.open === "2026-09-27T19:44:34")!;
  assert.equal(t.id, 1); // keeps its id
  assert.equal(t.entry_type, "flip");
  assert.equal(t.gap_seconds, 34);
  assert.equal(t.r, 10.85);
  // New ids follow in chronological order.
  assert.deepEqual(
    b.db.trades.filter((x) => x.id !== 1).map((x) => x.id),
    [2, 3, 4, 5, 6, 7, 8, 9],
  );
  const flipOf = b.db.trades.find((x) => x.id === t.linked_to)!;
  assert.equal(flipOf.open, "2026-09-27T19:42:43");
});

test("paste parsing is tolerant: tabs, header, blank lines, wrapping, 24 h and US dates", () => {
  const rows = RAW.slice(0, 3);
  const text = [
    "Account\tAccount ID\tInstrument\tOpen Time\tClose Time\tSide\tQty\tEntry Price\tExit Price\tNet P&L\tFees",
    "",
    pasteRow(rows[0], "\t"),
    "Tradeify RTSL50436117908 MNQ 2026-09-27T20:23:31", // cut after the open time
    "",
    "…",
    "Tradeify RTSL50436117908 MNQ 9/27/2026 7:42:43 PM 9/27/2026 7:44:00 PM Short 12 30801.67 30807.69 166.34 21.84",
    "this line is not a trade",
    // one row wrapped over three lines
    "Tradeify RTSL50436117908 MNQ 2026-09-27, 7:44:34 PM",
    "2026-09-27, 8:23:31 PM   Long   9",
    "$30,809.47   $30,900.25   $1,617.57   $16.38",
  ].join("\n");
  const r = parsePaste(text);
  assert.equal(r.headerLines, 1);
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows.map((x) => [x.line, x.lastLine]), [[3, 3], [7, 7], [9, 11]]);
  assert.equal(r.rows[1].open, "2026-09-27T19:42:43");
  assert.equal(r.rows[1].side, "Short");
  assert.equal(r.rows[2].close, "2026-09-27T20:23:31");
  assert.equal(r.rows[2].netAbs, 1617.57);
  assert.equal(r.rows[0].accountId, "RTSL50436117908");
  assert.equal(r.rows[0].account, "Tradeify");
  assert.deepEqual(
    r.unreadable.map((u) => u.line),
    [4, 8],
  );
  assert.match(r.unreadable[0].reason, /close time missing/);
  assert.match(r.unreadable[1].reason, /no open time/);
});

test("12 h clock edge cases and unreadable reasons", () => {
  const r = parsePaste(
    [
      "Tradeify RTSL1 MNQ 2026-09-25, 12:05:00 AM 2026-09-25, 12:10:00 PM Long 1 $100.00 $101.00 $0.18 $1.82",
      "Tradeify RTSL1 MNQ 2026-09-25, 1:00:00 PM 2026-09-25, 1:01:00 PM Sideways 1 $100.00 $101.00 $0.18 $1.82",
      "Tradeify RTSL1 MNQ 2026-09-25, 1:00:00 PM 2026-09-25, 1:01:00 PM Long 1 $100.00 $101.00 $0.18",
    ].join("\n"),
  );
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].open, "2026-09-25T00:05:00");
  assert.equal(r.rows[0].close, "2026-09-25T12:10:00");
  assert.equal(r.unreadable.length, 2);
  assert.match(r.unreadable[0].reason, /side/);
  assert.match(r.unreadable[1].reason, /fees/);
});

test("signs are recomputed from side and prices, and a wrong net is flagged", () => {
  const rules = readRules(STORED().rules);
  const base = parsePaste(pasteRow(RAW[2])).rows[0]; // short 12, net −166.34
  assert.equal(signRow(base, rules).net, -166.34);
  assert.equal(signRow(base, rules).mismatch, false);
  const wrong = { ...base, netAbs: 266.34 };
  assert.equal(signRow(wrong, rules).mismatch, true);
  const contradicting = { ...base, netSign: 1 as const };
  assert.equal(signRow(contradicting, rules).net, -166.34);
  assert.equal(signRow(contradicting, rules).mismatch, true);
});

test("scale-in: a second entry while the position is open joins the same trade", () => {
  const text = [
    "Tradeify RTSL50436117908 MNQ 2026-09-29, 10:00:00 AM 2026-09-29, 10:20:00 AM Long 2 $100.00 $110.00 $36.36 $3.64",
    "Tradeify RTSL50436117908 MNQ 2026-09-29, 10:05:00 AM 2026-09-29, 10:20:00 AM Long 2 $104.00 $110.00 $20.36 $3.64",
    "Tradeify RTSL50436117908 MNQ 2026-09-29, 10:21:00 AM 2026-09-29, 10:25:00 AM Short 1 $110.00 $105.00 $8.18 $1.82",
  ].join("\n");
  const { report, db } = planImport(emptyDb(), { paste: text });
  assert.deepEqual(report.scaleIns, [{ label: "Tue 29, 10:00", entries: [2, 2] }]);
  assert.equal(db.trades.length, 2);
  const [a, b] = db.trades;
  assert.equal(a.qty, 4);
  assert.equal(a.entry, 102);
  assert.equal(a.exits.length, 1); // same exit time and price: one exit of 4
  assert.equal(a.exits[0].qty, 4);
  assert.equal(a.points, 8);
  assert.equal(a.net, 56.72);
  assert.equal(a.session, "New York");
  assert.equal(b.entry_type, "flip");
  assert.equal(b.linked_to, a.id);
  assert.equal(b.gap_seconds, 60);
  assert.equal(b.result, "be");
});

test("session day and session boundaries (ET)", () => {
  const rules = readRules(STORED().rules);
  assert.equal(sessionDayOf("2026-09-24T21:30:06", rules), "2026-09-25"); // Thursday evening → Friday
  assert.equal(sessionDayOf("2026-09-27T19:12:07", rules), "2026-09-28"); // Sunday evening → Monday
  assert.equal(sessionDayOf("2026-09-25T16:59:59", rules), "2026-09-25");
  assert.equal(sessionDayOf("2026-09-25T18:00:00", rules), "2026-09-28"); // Friday evening (never traded) → Monday
  assert.equal(sessionOf("2026-09-25T02:59:59", rules), "Asia");
  assert.equal(sessionOf("2026-09-25T03:00:00", rules), "London");
  assert.equal(sessionOf("2026-09-25T09:29:59", rules), "London");
  assert.equal(sessionOf("2026-09-25T09:30:00", rules), "New York");
  assert.equal(sessionOf("2026-09-25T17:30:00", rules), "New York"); // maintenance break
  assert.equal(sessionOf("2026-09-25T18:00:00", rules), "Asia");
});

test("re-entry window: under 2 min links, 2 min or more is a first entry", () => {
  const row = (open: string, close: string, side = "Long") =>
    `Tradeify RTSL50436117908 MNQ ${open} ${close} ${side} 1 $100.00 $90.00 $21.82 $1.82`;
  const text = [
    row("2026-09-29T10:00:00", "2026-09-29T10:01:00"),
    row("2026-09-29T10:02:59", "2026-09-29T10:04:00"), // 119 s → re-entry
    row("2026-09-29T10:06:00", "2026-09-29T10:07:00"), // 120 s → first
  ].join("\n");
  const { db } = planImport(emptyDb(), { paste: text });
  assert.deepEqual(db.trades.map((t) => t.entry_type), ["first", "re-entry", "first"]);
  assert.deepEqual(db.trades.map((t) => t.gap_seconds), [null, 119, null]);
});

test("a manual stop is kept across imports; estimated stops follow new losers", () => {
  const edited = applyTradeEdit(STORED(), 9, { stop: 30803.5 });
  assert.deepEqual(edited.errors, []);
  const t9 = edited.trade;
  assert.deepEqual(t9.stop, { price: 30803.5, source: "manual" });
  assert.equal(t9.risk_usd, 119.4); // 5.97 pts × 10 × $2
  assert.equal(t9.r, 14.95);
  assert.equal(t9.r_estimated, false);
  assert.deepEqual(edited.others, []); // a winner's stop does not move the loser average

  // A new loser of 20 pts changes the average, hence the estimated stops, not the manual one.
  const loser = "Tradeify RTSL50436117908 MNQ 2026-09-29, 10:00:00 AM 2026-09-29, 10:05:00 AM Long 1 $30,900.00 $30,880.00 $41.82 $1.82";
  const { report, db } = planImport(edited.db, { paste: loser });
  assert.equal(report.newTrades.length, 1);
  assert.equal(db.rules.avg_stop_distance_pts, 10.58); // (8.97 + 10.16 + 7.75 + 6.02 + 20) / 5
  assert.deepEqual(report.restopped.sort((a, b) => a - b), [1, 2, 5]);
  const again9 = db.trades.find((t) => t.id === 9)!;
  assert.deepEqual(again9.stop, { price: 30803.5, source: "manual" });
  const t1 = db.trades.find((t) => t.id === 1)!;
  assert.deepEqual(t1.stop, { price: 30783.12, source: "estimated_avg_loser_distance" });
  assert.equal(t1.risk_usd, 126.96);
});

test("edits: validation, back to automatic, classification overrides", () => {
  const db = STORED();
  assert.deepEqual(applyTradeEdit(db, 9, { stop: 30900 }).errors.length, 1); // above a long's entry
  assert.deepEqual(applyTradeEdit(db, 9, { target: 30700 }).errors.length, 1);
  assert.deepEqual(parseEdit({ stop: "abc", session: "Tokyo", shots: { before: "../x.png" } }).errors.length, 3);

  // Same value as the estimate: nothing becomes manual.
  const same = applyTradeEdit(db, 9, { stop: 30801.25 });
  assert.equal(same.trade.stop.source, "estimated_avg_loser_distance");

  const manual = applyTradeEdit(db, 3, { stop: 30962.5, story: { context: "Range high" }, published: false, mae: 9, mfe: 2.5 });
  assert.equal(manual.trade.stop.source, "manual");
  assert.equal(manual.trade.risk_usd, 209.4);
  assert.equal(manual.trade.story.context, "Range high");
  assert.equal(manual.trade.published, false);
  assert.equal(manual.trade.mae, 9);
  // Loser 3 now risks 10.47 pts: the average and the estimated stops move; winner 4 keeps 3's stop.
  assert.equal(manual.db.rules.avg_stop_distance_pts, 8.6);
  assert.deepEqual(manual.db.trades.find((t) => t.id === 4)!.stop, { price: 30962.5, source: "previous_attempt_stop" });
  assert.deepEqual(manual.others.sort((a, b) => a - b), [1, 2, 4, 5, 9]);

  const back = applyTradeEdit(manual.db, 3, { stop: null });
  assert.deepEqual(back.trade.stop, { price: 30961, source: "exit_of_stopped_trade" });
  assert.equal(back.db.rules.avg_stop_distance_pts, 8.225);

  const ov = applyTradeEdit(db, 5, { session: "London", entry_type: "re-entry", result: "loss", session_day: "2026-09-28" });
  const t5 = ov.trade as AdminTrade;
  assert.equal(t5.session, "London");
  assert.equal(t5.entry_type, "re-entry");
  assert.equal(t5.linked_to, 4);
  assert.equal(t5.result, "loss");
  assert.deepEqual(t5.stop, { price: 30811.83, source: "exit_of_stopped_trade" });
  assert.deepEqual(t5.overrides, { session: "London", entry_type: "re-entry", result: "loss" }); // same day: no override
  // Overrides survive a re-import.
  const re = planImport(ov.db, { paste: PASTE });
  assert.equal(re.db.trades.find((t) => t.id === 5)!.session, "London");
  // Back to the computed values clears them.
  const clear = applyTradeEdit(ov.db, 5, { session: "Asia", entry_type: "first", result: "be" });
  assert.equal((clear.trade as AdminTrade).overrides, undefined);
  assert.equal(JSON.stringify(clear.db.trades), JSON.stringify(db.trades));

  const auto = autoValues(manual.db, 3)!;
  assert.deepEqual(auto.stop, { price: 30961, source: "exit_of_stopped_trade" });
});

test("orders CSV (synthetic sample, NOT a real Tradesea export): stops and targets are read", () => {
  const csv = [
    "Order ID,Account,Symbol,Side,Type,Qty,Limit Price,Stop Price,Status,Created Time,Filled Time",
    // Trade 1 (short 6 @ 30,772.54, 21:30:06 → 21:37:06)
    "1,RTSL50436117908,MNQZ6,Sell,Market,6,,,Filled,2026-09-24 21:30:06,2026-09-24 21:30:06",
    "2,RTSL50436117908,MNQZ6,Buy,Stop,6,,30784.00,Cancelled,2026-09-24 21:30:07,",
    "3,RTSL50436117908,MNQZ6,Buy,Stop,6,,30779.00,Cancelled,2026-09-24 21:33:00,", // moved later: ignored
    "4,RTSL50436117908,MNQZ6,Buy,Limit,6,30740.25,,Cancelled,2026-09-24 21:30:07,",
    // Trade 9 (long 10 @ 30,809.47, 19:44:34 → 20:23:39): stop and limit, 12 h times
    "5,RTSL50436117908,MNQZ6,Sell,Stop Market,10,,\"30,800.00\",Cancelled,9/27/2026 7:44:35 PM,",
    "6,RTSL50436117908,MNQZ6,Sell,Limit,10,\"30,900.25\",,Filled,9/27/2026 7:44:35 PM,9/27/2026 8:23:31 PM",
    "7,RTSL50436117908,MNQZ6,Sell,Limit,10,abc,,Filled,,",
  ].join("\n");
  const parsed = parseOrdersCsv(csv);
  assert.equal(parsed.error, null);
  assert.equal(parsed.orders.length, 6);
  assert.equal(parsed.columns.time, "Created Time");
  assert.equal(parsed.unreadable.length, 1);

  const db = STORED();
  const { report, db: next } = planImport(db, { csv });
  assert.equal(report.csv?.matches.length, 2);
  const t1 = next.trades.find((t) => t.id === 1)!;
  assert.deepEqual(t1.stop, { price: 30784, source: "csv" });
  assert.deepEqual(t1.target, { price: 30740.25, source: "csv" });
  assert.equal(t1.risk_usd, 137.52); // 11.46 pts × 6 × $2
  assert.equal(t1.r_estimated, false);
  const t9 = next.trades.find((t) => t.id === 9)!;
  assert.deepEqual(t9.stop, { price: 30800, source: "csv" });
  assert.deepEqual(t9.target, { price: 30900.25, source: "csv" });
  assert.equal(report.willWrite, true);

  // A manual stop is never replaced by the CSV.
  const manual = applyTradeEdit(db, 9, { stop: 30803.5 }).db;
  const again = planImport(manual, { csv });
  assert.deepEqual(again.db.trades.find((t) => t.id === 9)!.stop, { price: 30803.5, source: "manual" });
  assert.deepEqual(again.report.csv?.keptManual, [9]);

  // Stamps with an explicit zone are converted to ET.
  assert.deepEqual(readStamp("2026-09-27T23:44:35Z"), { time: "2026-09-27T19:44:35", clock: null });
  assert.equal(parseOrdersCsv("hello,world\n1,2").error !== null, true);
});
