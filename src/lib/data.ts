// Server-only access to the JSON files in /data.
// Read on every call: in `next dev` the admin writes to these files and pages pick the change up;
// in `next build` they are read once, at build time, and the public pages are static.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { sortByOpen, tradeSlugs } from "./calc";
import type { Strategy, Trade, TradesFile } from "./types";

// ALX_DATA_DIR lets a dev server work on a copy of the data (tests of the admin).
const DATA_DIR = process.env.ALX_DATA_DIR || path.join(process.cwd(), "data");
export const TRADES_FILE = path.join(DATA_DIR, "trades.json");
export const STRATEGY_FILE = path.join(DATA_DIR, "strategy.json");

export function loadDb(): TradesFile {
  return JSON.parse(fs.readFileSync(TRADES_FILE, "utf8")) as TradesFile;
}

/** Writes the whole file, pretty-printed, so diffs stay readable in git. */
export function saveDb(db: TradesFile): void {
  const tmp = `${TRADES_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2) + "\n");
  fs.renameSync(tmp, TRADES_FILE);
}

/** Published trades, oldest first. Everything public is built from this list. */
export function publicTrades(db: TradesFile = loadDb()): Trade[] {
  return sortByOpen(db.trades.filter((t) => t.published !== false));
}

/** Slugs as a plain object, so they can be passed to client components. */
export function slugRecord(trades: Trade[]): Record<number, string> {
  return Object.fromEntries(tradeSlugs(trades));
}

export function loadStrategy(): Strategy {
  return JSON.parse(fs.readFileSync(STRATEGY_FILE, "utf8")) as Strategy;
}

/** Admin pages and routes only run locally (`next dev`), unless ALX_ADMIN=1 is set. */
export function adminEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALX_ADMIN === "1";
}
