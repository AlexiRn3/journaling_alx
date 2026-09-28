"use client";

// Sections 04 → 09: one table model. Label, a divergent bar from 0 (scaled on the table's
// largest |net|), trades, win % (break-even excluded), net.
// Below 720 px each row stacks: label + net, the bar, then "7 trades · 25.0 % win";
// empty rows fold into one line ("Tue, Wed, Thu: no trades").

import type { BreakdownRow } from "@/lib/calc";
import { fmtValue, MINUS, signClass } from "@/lib/format";
import type { Unit } from "@/lib/types";
import s from "./stats.module.css";

interface Props {
  rows: BreakdownRow[];
  unit: Unit;
  head: string; // first column header ("Session")
  labelledBy: string; // id of the section heading
  /** Short label for the mobile "no trades" line (weekdays: "Tue"). */
  short?: (r: BreakdownRow) => string;
  /** Mobile only: add "· 3 BE" to the row's details. */
  beInDetails?: boolean;
  /** Mobile only: line under the table. */
  mobileNote?: string;
}

const beOnly = (n: number) => (n === 1 ? "break-even" : n === 2 ? "both break-even" : "all break-even");

export function Breakdown({ rows, unit, head, labelledBy, short, beInDetails = false, mobileNote }: Props) {
  const max = Math.max(0, ...rows.map((r) => Math.abs(r.net)));
  const empties = rows.filter((r) => r.count === 0);
  const note = [empties.length ? `${empties.map((r) => (short ? short(r) : r.label)).join(", ")}: no trades` : "", mobileNote ?? ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div role="table" aria-labelledby={labelledBy} className={s.tbl}>
        <div role="rowgroup">
          <div role="row" className={`${s.tr} ${s.th}`}>
            <span role="columnheader">{head}</span>
            <span role="columnheader">
              <span className="sr-only">Bar, share of the largest net</span>
            </span>
            <span role="columnheader">Trades</span>
            <span role="columnheader">Win %</span>
            <span role="columnheader" className={s.cNet}>
              Net
            </span>
          </div>
        </div>
        <div role="rowgroup">
          {rows.map((r) => {
            const empty = r.count === 0;
            const ratio = max > 0 ? Math.abs(r.net) / max : 0;
            const shown = !empty && signClass(r.net) !== "be"; // no bar for a net that prints as 0.00
            const est = unit === "R" && r.trades.some((t) => t.r_estimated);
            const pct = Math.round(ratio * 100);
            return (
              <div role="row" key={r.key} className={`${s.tr} ${empty ? s.nil : ""}`}>
                <span role="rowheader" className={s.cLabel}>
                  {r.label}
                </span>
                <span role="cell" className={s.cBar}>
                  <span className={`trk ${s.trk}`} aria-hidden="true">
                    {shown && (
                      <span
                        className={`${r.net > 0 ? "pos" : "neg"} ${s.growX}`}
                        style={{ width: `max(3px, calc((50% - 1px) * ${ratio.toFixed(4)}))` }}
                      />
                    )}
                  </span>
                  {!empty && <span className="sr-only">{`${r.net < 0 ? MINUS : ""}${pct} %`}</span>}
                </span>
                <span role="cell" className={s.cTrades}>
                  {r.count}
                  <span className={s.mOnly}>{r.count === 1 ? " trade" : " trades"}</span>
                </span>
                <span role="cell" className={s.cWin}>
                  <span className={s.dOnly}>{r.winRate === null ? "–" : r.winRate.toFixed(1)}</span>
                  <span className={s.mOnly}>
                    {" · "}
                    {r.winRate === null
                      ? beOnly(r.count)
                      : `${r.winRate.toFixed(1)} % win${beInDetails && r.be ? ` · ${r.be} BE` : ""}`}
                  </span>
                </span>
                <span role="cell" className={s.cNet}>
                  {empty ? (
                    "–"
                  ) : (
                    <span className={signClass(r.net)}>{fmtValue(r.net, unit, { est })}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {note && <p className={`${s.mNote} ${s.mOnly}`}>{note}</p>}
    </>
  );
}
