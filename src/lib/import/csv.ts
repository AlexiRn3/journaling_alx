// Option B: the CSV of the day's orders (Tradesea › Orders › Export).
//
// UNTESTED AGAINST A REAL EXPORT: no sample file was available. The parser guesses the columns
// from their names (symbol, side, type, qty, price / stop price / limit price, status, time) and
// stays tolerant (comma, semicolon or tab; quotes; 12 h or 24 h times; ISO or US dates).
// Timestamps without a zone are read as ET, like the rest of Tradesea; with "Z" or an offset
// they are converted to ET.
//
// For each trade, the stop is the first stop order on the other side placed while the position
// was open, on the losing side of the entry; the target is the first limit order on the other
// side, on the winning side. Cancelled orders count: they show the plan.
import type { Trade } from "../types.ts";
import type { LineIssue } from "./paste.ts";
import { dirOf, naiveET, round2 } from "./util.ts";

export type OrderType = "stop" | "stop-limit" | "limit" | "market" | "other";

export interface Order {
  line: number;
  symbol: string;
  side: "Buy" | "Sell" | null;
  type: OrderType;
  qty: number | null;
  price: number | null; // trigger price for a stop, limit price for a limit
  status: string;
  time: string | null; // naive ET "YYYY-MM-DDTHH:MM:SS"
  clock: string | null; // "HH:MM:SS" when the file gives a time without a date
}

export type Column = "symbol" | "side" | "type" | "qty" | "price" | "stop" | "limit" | "avg" | "status" | "time" | "date";

export interface CsvResult {
  orders: Order[];
  columns: Partial<Record<Column, string>>; // our name → header found in the file
  unreadable: LineIssue[];
  error: string | null; // the file as a whole could not be read
}

// Header names, normalised (lowercase, letters and digits only), by column. First match wins.
const HEADERS: [Column, RegExp][] = [
  ["symbol", /^(symbol|instrument|contract|ticker|market|product|sym|contractname|symbolname)$/],
  ["side", /^(side|action|buysell|bs|direction|orderside|buyorsell)$/],
  ["type", /^(type|ordertype|ordtype|kind|orderkind)$/],
  ["qty", /^(qty|quantity|size|orderqty|orderquantity|contracts|lots|amount|totalqty|origqty|filledqty|qtyfilled|filled)$/],
  ["stop", /^(stopprice|stop|trigger|triggerprice|auxprice|stoplimitprice|stoppx)$/],
  ["limit", /^(limitprice|limit|lmtprice|limitpx)$/],
  ["price", /^(price|orderprice|px)$/],
  ["avg", /^(avgprice|averageprice|avgfillprice|fillprice|filledprice|executionprice|avgpx)$/],
  ["status", /^(status|state|orderstatus)$/],
  ["time", /^(time|datetime|timestamp|created|createdat|createdtime|creationtime|submitted|submittedat|submittime|placed|placedat|placedtime|ordertime|entrytime|date|updated|updatedat|lastupdate|filledtime|filltime)$/],
];
// When several headers could be the time, prefer the moment the order was placed.
const TIME_PREFERENCE = /^(created|createdat|createdtime|creationtime|submitted|submittedat|submittime|placed|placedat|placedtime|ordertime|entrytime|time|datetime|timestamp)$/;

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(line: string): string {
  const counts = [",", ";", "\t", "|"].map((d) => [d, splitLine(line, d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.replace(/[$\s]/g, "").replace(/[−–]/g, "-");
  if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(t)) return null;
  const v = Number(t.replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Hours from UTC of the zone abbreviations a browser may print. ET ones are left as they are. */
const ZONES: Record<string, number> = {
  UTC: 0, GMT: 0, Z: 0, WET: 0, WEST: 1, BST: 1, CET: 1, CEST: 2, EET: 2, EEST: 3,
  CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7,
};
const ET_ZONES = new Set(["ET", "EST", "EDT"]);

/** Wall time in another zone → naive ET. */
function toET(day: string, clock: string, offsetHours: number): string {
  const [y, mo, d] = day.split("-").map(Number);
  const [h, mi, se] = clock.split(":").map(Number);
  return naiveET(new Date(Date.UTC(y, mo - 1, d, h, mi, se) - offsetHours * 3600_000));
}

/** Offset in hours of a trailing zone ("EDT", "CEST", "GMT+2", "UTC-04:00"); null = ET or none. */
function zoneOffset(rest: string): number | null {
  const g = /\b(?:GMT|UTC)\s*([+-])(\d{1,2})(?::?(\d{2}))?\b/i.exec(rest);
  if (g) return (g[1] === "-" ? -1 : 1) * (+g[2] + (g[3] ? +g[3] / 60 : 0));
  const a = /\b([A-Z]{1,5})\s*$/.exec(rest.trim());
  if (!a || ET_ZONES.has(a[1]) || /^[AP]M$/.test(a[1])) return null;
  return a[1] in ZONES ? ZONES[a[1]] : null;
}

/**
 * Reads a date-time cell. Returns a naive ET timestamp, or only a clock time.
 * Tradesea writes "28.9.2026, 19:44:34 EDT" (day first, zone of the browser): other zones are converted to ET.
 */
export function readStamp(s: string): { time: string | null; clock: string | null } {
  const v = s.trim();
  if (!v) return { time: null, clock: null };
  // Explicit zone: convert the instant to ET.
  if (/\d(Z|[+-]\d{2}:?\d{2})$/i.test(v) && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const ms = Date.parse(v.replace(" ", "T"));
    if (Number.isFinite(ms)) return { time: naiveET(new Date(ms)), clock: null };
  }
  const clockRe = /(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([AaPp]\.?[Mm]\.?)?/;
  let day: string | null = null;
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) day = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  else if ((m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(v))) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    day = `${y}-${pad(+m[1])}-${pad(+m[2])}`;
  } else if ((m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(v))) {
    day = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`; // DD.M.YYYY (Tradesea)
  }
  const rest = m ? v.slice(m.index + m[0].length) : v;
  const c = clockRe.exec(rest);
  if (!c) return { time: day ? `${day}T00:00:00` : null, clock: null };
  let h = +c[1];
  if (c[4]) h = (h % 12) + (c[4][0].toLowerCase() === "p" ? 12 : 0);
  const clock = `${pad(h)}:${pad(+c[2])}:${pad(+(c[3] ?? 0))}`;
  if (!day) return { time: null, clock };
  const offset = zoneOffset(rest.slice(c.index + c[0].length));
  return { time: offset === null ? `${day}T${clock}` : toET(day, clock, offset), clock: null };
}

function orderType(raw: string, hasStop: boolean, hasLimit: boolean): OrderType {
  const t = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (t) {
    if (t.includes("stop") && t.includes("limit")) return "stop-limit";
    if (t.includes("stop") || t === "stp" || t === "sl" || t.includes("trail")) return "stop";
    if (t.includes("limit") || t === "lmt" || t === "tp" || t.includes("takeprofit")) return "limit";
    if (t.includes("market") || t === "mkt") return "market";
    return "other";
  }
  if (hasStop && !hasLimit) return "stop";
  if (hasLimit && !hasStop) return "limit";
  if (hasStop && hasLimit) return "stop-limit";
  return "other";
}

export function parseOrdersCsv(text: string): CsvResult {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const unreadable: LineIssue[] = [];
  // Header: the first line where at least 3 known column names are found.
  let headerIdx = -1;
  let delim = ",";
  let cells: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    if (!lines[i].trim()) continue;
    const d = detectDelimiter(lines[i]);
    const c = splitLine(lines[i], d).map(norm);
    const known = c.filter((h) => HEADERS.some(([, re]) => re.test(h))).length;
    if (known >= 3) {
      headerIdx = i;
      delim = d;
      cells = splitLine(lines[i], d);
      break;
    }
  }
  if (headerIdx < 0) return { orders: [], columns: {}, unreadable, error: "No header row with order columns (symbol, side, type, price, time…) was found." };

  const columns: Partial<Record<Column, string>> = {};
  const index: Partial<Record<Column, number>> = {};
  cells.forEach((h, i) => {
    const n = norm(h);
    for (const [col, re] of HEADERS) {
      if (!re.test(n)) continue;
      const better = col === "time" && index.time !== undefined && TIME_PREFERENCE.test(n) && !TIME_PREFERENCE.test(norm(cells[index.time]));
      if (index[col] === undefined || better) {
        index[col] = i;
        columns[col] = h;
      }
      break;
    }
  });
  // A separate "Date" column next to a "Time" column holding only the clock.
  const dateIdx = cells.findIndex((h) => norm(h) === "date");
  if (dateIdx >= 0 && index.time !== dateIdx) columns.date = cells[dateIdx];

  if (index.side === undefined || (index.price === undefined && index.stop === undefined && index.limit === undefined)) {
    return { orders: [], columns, unreadable, error: "The file has no side or price column, so stops and targets cannot be read." };
  }

  const orders: Order[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const row = splitLine(line, delim);
    const cell = (c: Column) => (index[c] !== undefined ? row[index[c]!] ?? "" : "");
    const sideRaw = cell("side").toLowerCase();
    const side = /^(b|buy|bot|bought|long)/.test(sideRaw) ? "Buy" : /^(s|sell|sld|sold|short)/.test(sideRaw) ? "Sell" : null;
    const stop = num(cell("stop"));
    const limit = num(cell("limit"));
    const price = num(cell("price"));
    const type = orderType(cell("type"), stop !== null && stop !== 0, limit !== null && limit !== 0);
    const trigger = type === "stop" || type === "stop-limit" ? (stop || price || limit) : type === "limit" ? (limit || price) : (price ?? num(cell("avg")));
    let stamp = readStamp(cell("time"));
    if (dateIdx >= 0 && index.time !== dateIdx && stamp.clock) stamp = readStamp(`${row[dateIdx]} ${stamp.clock}`);
    if (!side || (trigger === null && type !== "market") || (!stamp.time && !stamp.clock)) {
      unreadable.push({
        line: i + 1,
        text: line.trim().slice(0, 160),
        reason: !side ? "side not recognised" : trigger === null ? "no price" : "no time",
      });
      continue;
    }
    orders.push({
      line: i + 1,
      symbol: cell("symbol"),
      side,
      type,
      qty: num(cell("qty")),
      price: trigger,
      status: cell("status"),
      time: stamp.time,
      clock: stamp.clock,
    });
  }
  return { orders, columns, unreadable, error: null };
}

export interface CsvPick {
  price: number;
  status: string;
  line: number;
  time: string;
}

export interface CsvMatch {
  tradeId: number;
  stop: CsvPick | null;
  target: CsvPick | null;
}

const BEFORE_OPEN_SECONDS = 60; // bracket orders may be placed with (or just before) the entry
const AFTER_CLOSE_SECONDS = 5;

function within(order: Order, t: Trade): string | null {
  const shift = (ts: string, s: number) => new Date(Date.parse(`${ts}Z`) + s * 1000).toISOString().slice(0, 19);
  const from = shift(t.open, -BEFORE_OPEN_SECONDS);
  const to = shift(t.close, AFTER_CLOSE_SECONDS);
  if (order.time) return order.time >= from && order.time <= to ? order.time : null;
  if (order.clock) {
    // Time without a date: try the open day and the close day.
    for (const day of new Set([t.open.slice(0, 10), t.close.slice(0, 10)])) {
      const ts = `${day}T${order.clock}`;
      if (ts >= from && ts <= to) return ts;
    }
  }
  return null;
}

/** Finds, for each trade, its stop order and its limit (target) order. */
export function matchOrders(trades: Trade[], orders: Order[], instrument = "MNQ"): CsvMatch[] {
  const out: CsvMatch[] = [];
  for (const t of trades) {
    const closing = t.side === "Long" ? "Sell" : "Buy";
    const dir = dirOf(t.side);
    const stops: CsvPick[] = [];
    const targets: CsvPick[] = [];
    for (const o of orders) {
      if (o.side !== closing || o.price === null) continue;
      // "CME:MNQ", "MNQZ6", "/MNQ": compare what follows the exchange prefix.
      if (o.symbol && !o.symbol.toUpperCase().split(":").pop()!.replace(/[^A-Z]/g, "").startsWith(instrument.toUpperCase())) continue;
      const when = within(o, t);
      if (!when) continue;
      const pick = { price: round2(o.price), status: o.status, line: o.line, time: when };
      if ((o.type === "stop" || o.type === "stop-limit") && (t.entry - o.price) * dir > 0) stops.push(pick);
      if (o.type === "limit" && (o.price - t.entry) * dir > 0) targets.push(pick);
    }
    const first = (xs: CsvPick[]) => xs.sort((a, b) => a.time.localeCompare(b.time) || a.line - b.line)[0] ?? null;
    const stop = first(stops);
    const target = first(targets);
    if (stop || target) out.push({ tradeId: t.id, stop, target });
  }
  return out;
}
