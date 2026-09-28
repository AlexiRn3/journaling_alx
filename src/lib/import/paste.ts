// Option A: the "Recent Trades" table pasted from Tradesea Compass.
//
// One row = account, account id, instrument, open, close, side, qty, entry, exit, net, fees:
//   Tradeify  RTSL50436117908  MNQ  2026-09-27, 7:44:34 PM  2026-09-27, 8:23:39 PM  Long  1  $30,809.48  $30,894.00  $167.23  $1.82
//
// Tolerant on purpose: tabs or spaces, a header line or not, blank lines, thousands separators,
// 12 h or 24 h times, ISO or US dates, rows wrapped over several lines. A row starts at the
// beginning of a line and may continue on the next ones. What cannot be read is reported by line.
// The copy loses the sign of the net P&L: it is recomputed later (merge.ts), from side and prices.
import type { Side } from "../types.ts";

export interface RawRow {
  line: number; // first line of the row (1-based)
  lastLine: number;
  account: string; // "Tradeify"
  accountId: string; // "RTSL50436117908", "" when the column is missing
  instrument: string; // "MNQ"
  open: string; // naive ET
  close: string;
  side: Side;
  qty: number;
  entry: number;
  exit: number;
  netAbs: number; // |net| as pasted
  netSign: 1 | -1 | null; // sign written in the paste, null when there was none (the usual case)
  fees: number;
}

export interface LineIssue {
  line: number;
  text: string;
  reason: string;
}

export interface PasteResult {
  rows: RawRow[];
  unreadable: LineIssue[]; // lines that could not be read as a trade row
  notes: LineIssue[]; // readable rows with something ignored (extra columns)
  headerLines: number;
  lines: number; // non-blank lines
}

interface Tok {
  t: string;
  line: number; // 0-based
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const HEADER_WORDS = /\b(account|instrument|symbol|contract|open(ed)?|close(d)?|side|direction|qty|quantity|size|entry|exit|price|net|p&l|pnl|profit|fees?|commissions?|time)\b/gi;

const RE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T_](\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([AaPp][Mm])?)?,?$/;
const RE_US = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}),?$/;
const RE_TIME = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?([AaPp]\.?[Mm]\.?)?,?$/;
const RE_AMPM = /^([AaPp])\.?[Mm]\.?,?$/;
const RE_MONTH = /^([A-Za-z]{3})[a-z]*\.?,?$/;
const RE_DAY = /^(\d{1,2})(?:st|nd|rd|th)?,?$/;
const RE_YEAR = /^(\d{4}),?$/;
const RE_SIDE = /^(long|short|buy|sell|bought|sold)$/i;
const RE_QTY = /^-?\d+(?:\.0+)?$/;
const RE_NUM = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;

const pad = (n: number) => String(n).padStart(2, "0");

/** Normalises the text before splitting it into tokens. */
function normalise(text: string): string {
  return text
    .replace(/ | /g, " ") // non-breaking spaces from HTML tables
    .replace(/[−–—]/g, "-") // − – — → -
    .replace(/(^|\s)(-?)\$\s+(?=\d)/g, "$1$2$") // "$ 30,809.48" → "$30,809.48"
    .replace(/(^|\s)-\s+\$(?=\d)/g, "$1-$") // "- $166.34" → "-$166.34"
    .replace(/\bUSD\s*/g, "");
}

export function parseMoney(tok: string): { v: number; sign: 1 | -1 | null } | null {
  let s = tok.replace(/,$/, "");
  let neg = false;
  let explicit = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    explicit = true;
    s = s.slice(1, -1);
  }
  if (s[0] === "-" || s[0] === "+") {
    explicit = true;
    neg = s[0] === "-";
    s = s.slice(1);
  }
  if (s[0] === "$") s = s.slice(1);
  if (s[0] === "-" || s[0] === "+") {
    explicit = true;
    neg = s[0] === "-";
    s = s.slice(1);
  }
  if (!RE_NUM.test(s)) return null;
  const v = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(v)) return null;
  return { v, sign: explicit ? (neg ? -1 : 1) : null };
}

function clock(h: number, m: number, s: number, ampm: string | undefined): string | null {
  if (ampm) {
    if (h < 1 || h > 12) return null;
    const pm = ampm[0].toLowerCase() === "p";
    h = (h % 12) + (pm ? 12 : 0);
  }
  if (h > 23 || m > 59 || s > 59) return null;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function validDay(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** A date may take up to 5 tokens ("Sep 27, 2026 7:44:34 PM"). Returns the timestamp and the next index. */
function readDate(toks: Tok[], i: number): { ts: string; next: number } | { error: string } | null {
  const t = toks[i]?.t;
  if (!t) return null;
  let day: string | null = null;
  let j = i + 1;
  let inlineTime: string | undefined;
  let inlineAmPm: string | undefined;

  let m = RE_ISO.exec(t);
  if (m) {
    day = validDay(Number(m[1]), Number(m[2]), Number(m[3]));
    inlineTime = m[4];
    inlineAmPm = m[5];
  } else if ((m = RE_US.exec(t))) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    day = validDay(y, Number(m[1]), Number(m[2]));
  } else if ((m = RE_MONTH.exec(t)) && MONTHS.includes(m[1].toLowerCase())) {
    const d = RE_DAY.exec(toks[i + 1]?.t ?? "");
    const y = RE_YEAR.exec(toks[i + 2]?.t ?? "");
    if (!d || !y) return null;
    day = validDay(Number(y[1]), MONTHS.indexOf(m[1].toLowerCase()) + 1, Number(d[1]));
    j = i + 3;
  } else {
    return null;
  }
  if (!day) return { error: `"${t}" is not a valid date` };

  let time: string | null = null;
  if (inlineTime) {
    const [h, mi, s = "0"] = inlineTime.split(":");
    const amp = inlineAmPm ?? (RE_AMPM.test(toks[j]?.t ?? "") ? toks[j++].t : undefined);
    time = clock(Number(h), Number(mi), Math.floor(Number(s)), amp);
  } else {
    const tm = RE_TIME.exec(toks[j]?.t ?? "");
    if (!tm) return { error: `no time after the date ${t.replace(/,$/, "")}` };
    j++;
    let amp = tm[4];
    if (!amp && RE_AMPM.test(toks[j]?.t ?? "")) amp = toks[j++].t;
    time = clock(Number(tm[1]), Number(tm[2]), Number(tm[3] ?? 0), amp);
  }
  if (!time) return { error: `unreadable time after ${day}` };
  return { ts: `${day}T${time}`, next: j };
}

const isDateStart = (toks: Tok[], i: number) => {
  const r = readDate(toks, i);
  return r !== null;
};

type Attempt = { ok: true; row: RawRow; end: number } | { ok: false; reason: string };

/** Reads one row starting at token i. */
function readRow(toks: Tok[], i: number): Attempt {
  // Account name, account id, instrument: everything before the open time (at most 6 tokens).
  const prefix: Tok[] = [];
  let j = i;
  while (j < toks.length && !isDateStart(toks, j)) {
    prefix.push(toks[j]);
    j++;
    if (prefix.length > 6) return { ok: false, reason: "no open time found" };
  }
  if (j >= toks.length) return { ok: false, reason: "no open time found" };
  if (prefix.length === 0) return { ok: false, reason: "instrument missing before the open time" };

  const instrument = prefix[prefix.length - 1].t;
  if (!/^[A-Za-z][A-Za-z0-9.]{0,11}$/.test(instrument)) return { ok: false, reason: `"${instrument}" is not an instrument` };
  let accountId = "";
  let nameToks = prefix.slice(0, -1);
  const last = nameToks[nameToks.length - 1];
  if (last && /\d{4,}/.test(last.t)) {
    accountId = last.t;
    nameToks = nameToks.slice(0, -1);
  }
  if (nameToks.some((x) => /^\$?[\d.,]+$/.test(x.t))) return { ok: false, reason: "unexpected numbers before the open time" };

  const open = readDate(toks, j);
  if (!open || "error" in open) return { ok: false, reason: open && "error" in open ? open.error : "open time missing" };
  j = open.next;
  const close = readDate(toks, j);
  if (!close) return { ok: false, reason: "close time missing" };
  if ("error" in close) return { ok: false, reason: close.error };
  j = close.next;

  const sideTok = toks[j]?.t ?? "";
  if (!RE_SIDE.test(sideTok)) return { ok: false, reason: `side (Long / Short) expected after the close time, found "${sideTok || "nothing"}"` };
  const side: Side = /^(long|buy|bought)$/i.test(sideTok) ? "Long" : "Short";
  j++;

  const qtyTok = toks[j]?.t ?? "";
  if (!RE_QTY.test(qtyTok) || Number(qtyTok) === 0) return { ok: false, reason: `quantity expected after the side, found "${qtyTok || "nothing"}"` };
  const qty = Math.abs(Number(qtyTok));
  j++;

  const amounts: { v: number; sign: 1 | -1 | null }[] = [];
  while (amounts.length < 4) {
    const tok = toks[j]?.t;
    const money = tok === undefined ? null : parseMoney(tok);
    if (!money) {
      const names = ["entry price", "exit price", "net P&L", "fees"];
      return { ok: false, reason: `${names[amounts.length]} expected, found "${tok ?? "nothing"}"` };
    }
    amounts.push(money);
    j++;
  }
  const [entry, exit, net, fees] = amounts;
  if (entry.v <= 0 || exit.v <= 0) return { ok: false, reason: "entry and exit prices must be positive" };
  if (close.ts < open.ts) return { ok: false, reason: "close time is before the open time" };

  return {
    ok: true,
    end: j,
    row: {
      line: toks[i].line + 1,
      lastLine: toks[j - 1].line + 1,
      account: nameToks.map((x) => x.t).join(" "),
      accountId,
      instrument,
      open: open.ts,
      close: close.ts,
      side,
      qty,
      entry: entry.v,
      exit: exit.v,
      netAbs: net.v,
      netSign: net.sign,
      fees: fees.v,
    },
  };
}

function isHeader(line: string): boolean {
  if (/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\$\d/.test(line)) return false;
  const words = new Set((line.match(HEADER_WORDS) ?? []).map((w) => w.toLowerCase()));
  return words.size >= 2;
}

export function parsePaste(text: string): PasteResult {
  const lines = normalise(text).split(/\r\n|\r|\n/);
  const toks: Tok[] = [];
  const firstTok: number[] = []; // index of the first token of each line (-1: none)
  const unreadable: LineIssue[] = [];
  const notes: LineIssue[] = [];
  let headerLines = 0;
  let nonBlank = 0;

  lines.forEach((raw, n) => {
    const line = raw.trim();
    firstTok[n] = -1;
    if (!line) return;
    nonBlank++;
    if (!/[A-Za-z0-9]/.test(line)) return; // "…", "---": ignored
    if (isHeader(line)) {
      headerLines++;
      return;
    }
    firstTok[n] = toks.length;
    for (const t of line.split(/\s+/)) toks.push({ t, line: n });
  });

  const rows: RawRow[] = [];
  let i = 0;
  while (i < toks.length) {
    const atLineStart = firstTok[toks[i].line] === i;
    const attempt = readRow(toks, i);
    if (attempt.ok) {
      rows.push(attempt.row);
      i = attempt.end;
      continue;
    }
    const n = toks[i].line;
    let next = i;
    while (next < toks.length && toks[next].line === n) next++;
    if (atLineStart) {
      unreadable.push({ line: n + 1, text: lines[n].trim(), reason: attempt.reason });
    } else {
      const extra = toks.slice(i, next).map((x) => x.t).join(" ");
      notes.push({ line: n + 1, text: lines[n].trim(), reason: `ignored after the fees: "${extra}"` });
    }
    i = next;
  }

  return { rows, unreadable, notes, headerLines, lines: nonBlank };
}
