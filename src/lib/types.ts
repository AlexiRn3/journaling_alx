// Shapes of data/trades.json and data/strategy.json.
// All timestamps are naive ET wall-clock strings ("2026-09-27T19:44:34"), as shown in Tradesea.
// Never convert them with the browser time zone: use the helpers in lib/dates.ts.

export type Side = "Long" | "Short";
export type Result = "win" | "loss" | "be";
export type EntryType = "first" | "re-entry" | "flip";
export type Session = "Asia" | "London" | "New York";

export type StopSource =
  | "csv" // read from the day's order export
  | "manual" // typed in the admin
  | "exit_of_stopped_trade" // loser: the exit price is the stop
  | "previous_attempt_stop" // winning re-entry keeps the stop of the previous attempt
  | "estimated_avg_loser_distance"; // winner or BE without data: average loser distance

export type TargetSource = "csv" | "manual" | "partial_fill";

export interface Exit {
  time: string;
  qty: number;
  price: number;
  net: number;
}

export interface Trade {
  id: number;
  side: Side;
  qty: number;
  open: string;
  close: string;
  entry: number; // weighted average entry
  exit: number; // weighted average exit
  net: number; // after fees, $
  fees: number;
  points: number; // (exit − entry) × side, per contract
  exits: Exit[];
  session_day: string; // "YYYY-MM-DD", CME session 18:00 → 17:00 ET (Sunday evening counts for Monday)
  session: Session;
  hold_seconds: number;
  result: Result; // BE = net within ±$30
  flash: boolean; // held < 30 s
  entry_type: EntryType;
  gap_seconds: number | null; // seconds since the previous close, when linked
  linked_to: number | null; // id of the previous attempt (re-entry / flip)
  stop: { price: number; source: StopSource };
  target: { price: number; source: TargetSource } | null;
  risk_usd: number;
  r: number;
  r_estimated: boolean;
  pct_of_account: number;

  // Editorial fields, filled in the admin
  published: boolean;
  shots: { before: string | null; after: string | null }; // paths under /public, e.g. "/shots/9-before.png"
  story: { context: string; scenario: string; why: string; management: string }; // Markdown
  mae: number | null; // points
  mfe: number | null; // points
}

export interface Rules {
  point_value_usd: number;
  account_start_usd: number;
  breakeven_band_usd: number;
  link_window_seconds: number;
  session_day: string;
  sessions_et: Record<Session, string>;
  avg_stop_distance_pts: number;
}

export interface Meta {
  account: string; // "Tradeify 50K"
  account_id: string;
  instrument: string; // "MNQ"
  source: string; // "Tradeify via Tradesea"
  updated_at: string; // naive ET
  timezone: string;
}

export interface TradesFile {
  meta: Meta;
  rules: Rules;
  trades: Trade[];
}

export interface Strategy {
  method: string;
  intro: string;
  home_intro: string;
  idea: string[];
  highlight: string;
  principles: { title: string; body: string }[];
  not_here: string;
}

/** Display units. $ is the default. */
export type Unit = "R" | "$" | "pts" | "%";
export const UNITS: Unit[] = ["R", "$", "pts", "%"];

export type Period = "1W" | "1M" | "3M" | "YTD" | "All";
export const PERIODS: Period[] = ["1W", "1M", "3M", "YTD", "All"];
