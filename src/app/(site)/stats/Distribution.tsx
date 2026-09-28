"use client";

// 03 Distribution of results: number of trades in 5 result bands. The middle band is always the
// break-even trades (net within ±$30, whatever the unit); the other edges follow the unit.

import { tradeValue } from "@/lib/calc";
import { fmtAxis } from "@/lib/format";
import type { Trade, Unit } from "@/lib/types";
import s from "./stats.module.css";

/** Band edges per unit: [big loss at or below −a, big win above b]. */
const EDGES: Record<Unit, [number, number]> = {
  $: [150, 1000],
  R: [1, 3], // one stop, three stops
  pts: [8, 25], // ≈ 1 R and 3 R at the average stop distance (8.2 pts)
  "%": [0.3, 2], // $150 and $1,000 on the $50,000 account
};

type Tone = "loss" | "loss2" | "be" | "win2" | "win";

interface Band {
  label: string;
  short: string;
  tone: Tone;
  count: number;
}

export function bands(trades: Trade[], unit: Unit, beBand: number): Band[] {
  const [a, b] = EDGES[unit];
  const counts = [0, 0, 0, 0, 0];
  for (const t of trades) {
    if (t.result === "be") counts[2]++;
    else {
      const v = tradeValue(t, unit);
      if (t.result === "loss") counts[v <= -a ? 0 : 1]++;
      else counts[v > b ? 4 : 3]++;
    }
  }
  const L = (v: number) => fmtAxis(v, unit, true); // "−$150", "$1k", "−1 R", "25 pts", "0.3 %"
  const N = (v: number) => L(v).replace(/\$| R| pts| %/g, ""); // same, without the unit
  const dollars = unit === "$";
  return [
    { label: `≤ ${L(-a)}`, short: `≤ ${N(-a)}`, tone: "loss", count: counts[0] },
    {
      label: `${L(-a)} → ${dollars ? L(-beBand) : "BE"}`,
      short: `${N(-a)} → ${dollars ? N(-beBand) : "BE"}`,
      tone: "loss2",
      count: counts[1],
    },
    { label: `BE, ±$${beBand}`, short: "BE", tone: "be", count: counts[2] },
    {
      label: `${dollars ? L(beBand) : "BE"} → ${L(b)}`,
      short: `${dollars ? N(beBand) : "BE"} → ${N(b)}`,
      tone: "win2",
      count: counts[3],
    },
    { label: `> ${L(b)}`, short: `> ${N(b)}`, tone: "win", count: counts[4] },
  ];
}

export function Distribution({ trades, unit, beBand, labelledBy }: { trades: Trade[]; unit: Unit; beBand: number; labelledBy: string }) {
  const list = bands(trades, unit, beBand);
  const max = Math.max(...list.map((x) => x.count));
  return (
    <ol className={s.dist} aria-labelledby={labelledBy}>
      {list.map((x) => (
        <li key={x.tone} className={s.band}>
          <span className="sr-only">
            {x.label}: {x.count} trade{x.count === 1 ? "" : "s"}
          </span>
          <span className={s.bandPlot} aria-hidden="true">
            <span className={s.bandCount}>{x.count}</span>
            <span
              className={`${s.bandBar} ${s.growY}`}
              data-tone={x.tone}
              data-zero={x.count === 0 || undefined}
              style={{ "--r": max ? x.count / max : 0 } as React.CSSProperties}
            />
          </span>
          <span className={s.bandLabel} aria-hidden="true">
            <span className={s.dOnly}>{x.label}</span>
            <span className={s.mOnly}>{x.short}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
