"use client";

// 01 Overview: 12 figures. Sub lines give the same figure in other units where it helps.
// Below 720 px the mockup swaps "Win / loss ratio" for "Median hold" and shortens the sub lines.

import type { ReactNode } from "react";
import { equity, tradeValue, type Overview as OverviewData } from "@/lib/calc";
import { fmtDayShort, fmtTime } from "@/lib/dates";
import { fmtHold, fmtRate, fmtRatio, fmtValue, signClass } from "@/lib/format";
import type { Trade, Unit } from "@/lib/types";
import s from "./stats.module.css";

/** Other units shown under a figure, most useful first. */
const ALTS: Record<Unit, Unit[]> = { $: ["%", "R"], R: ["$", "%"], pts: ["$", "R"], "%": ["$", "R"] };
/** The single other unit, for one-value sub lines. */
const ALT1: Record<Unit, Unit> = { $: "R", R: "$", pts: "$", "%": "$" };

/** R values are estimates when one of the trades behind them had its stop estimated. */
const estOf = (trades: Trade[], u: Unit) => u === "R" && trades.some((t) => t.r_estimated);

interface Props {
  trades: Trade[]; // period trades
  unit: Unit;
  ov: Record<Unit, OverviewData>; // overview in every unit
}

export function Overview({ trades, unit, ov }: Props) {
  const o = ov[unit];
  const wins = trades.filter((t) => t.result === "win");
  const losses = trades.filter((t) => t.result === "loss");

  // Trades between the peak and the trough of the max drawdown, in that unit's own curve.
  const ddTrades = (u: Unit) => {
    const dd = ov[u].maxDrawdown;
    return equity(trades, u)
      .slice(dd.peakIndex + 1, dd.troughIndex + 1)
      .map((p) => p.trade!)
      .filter(Boolean);
  };
  const netIn = (u: Unit) => fmtValue(ov[u].net, u, { est: estOf(trades, u) });
  const ddIn = (u: Unit) => fmtValue(ov[u].maxDrawdown.value, u, { est: estOf(ddTrades(u), u) });

  const a1 = ALT1[unit];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const lw = o.largestWin;
  const ll = o.largestLoss;
  const st = o.longestLosingStreak;
  const when = (t: Trade, session: boolean) => `${fmtDayShort(t.session_day)}${session ? " session" : ""}, ${fmtTime(t.open)}`;
  const streakSpan =
    st.from && st.to
      ? `${fmtDayShort(st.from.session_day)}, ${fmtTime(st.from.open)} → ${
          st.to.session_day === st.from.session_day ? "" : `${fmtDayShort(st.to.session_day)}, `
        }${fmtTime(st.to.close)}`
      : "no losing trade";

  const expAlt = ov[a1].expectancy;
  const avgWinAlt = ov[a1].avgWin;
  const avgLossAlt = ov[a1].avgLoss;

  return (
    <div className={s.ov}>
      <dl className={s.kpis}>
        <Kpi
          label="Net"
          value={<Fig v={o.net} unit={unit} est={o.estimated} />}
          sub={ALTS[unit].map(netIn).join(" · ")}
        />
        <Kpi
          label="Trades"
          value={o.count}
          sub={`${plural(o.wins, "win", "wins")} · ${plural(o.losses, "loss", "losses")} · ${o.be} BE`}
          short={`${o.wins} W · ${o.losses} L · ${o.be} BE`}
        />
        <Kpi label="Win rate" value={fmtRate(o.winRate)} sub="break-even excluded" short="BE excluded" />
        <Kpi
          label="Expectancy"
          value={<Fig v={o.expectancy} unit={unit} est={o.estimated} />}
          sub={expAlt === null ? "per trade" : `${fmtValue(expAlt, a1)} per trade${estOf(trades, a1) ? ", est." : ""}`}
          short={expAlt === null ? "per trade" : fmtValue(expAlt, a1, { est: estOf(trades, a1) })}
        />
        <Kpi label="Profit factor" value={fmtRatio(o.profitFactor)} sub="gross win ÷ gross loss" short="win ÷ loss" />
        <Kpi
          label="Max drawdown"
          value={<Fig v={o.maxDrawdown.value} unit={unit} est={estOf(ddTrades(unit), unit)} />}
          sub={o.maxDrawdown.value < 0 ? ALTS[unit].map(ddIn).join(" · ") : "no drawdown"}
          short={o.maxDrawdown.value < 0 ? ddIn(ALTS[unit][0]) : "none"}
        />
        <Kpi
          label="Average win"
          value={<Fig v={o.avgWin} unit={unit} est={estOf(wins, unit)} />}
          sub={avgWinAlt === null ? "no winning trade" : fmtValue(avgWinAlt, a1, { est: estOf(wins, a1) })}
        />
        <Kpi
          label="Average loss"
          value={<Fig v={o.avgLoss} unit={unit} est={estOf(losses, unit)} />}
          sub={avgLossAlt === null ? "no losing trade" : fmtValue(avgLossAlt, a1, { est: estOf(losses, a1) })}
        />
        <Kpi label="Win / loss ratio" value={fmtRatio(o.winLossRatio)} sub="average win ÷ average loss" only="d" />
        <Kpi
          label="Largest win"
          value={<Fig v={lw ? tradeValue(lw, unit) : null} unit={unit} est={lw ? estOf([lw], unit) : false} />}
          sub={lw ? when(lw, true) : "no winning trade"}
          short={lw ? when(lw, false) : "none"}
        />
        <Kpi
          label="Largest loss"
          value={<Fig v={ll ? tradeValue(ll, unit) : null} unit={unit} est={ll ? estOf([ll], unit) : false} />}
          sub={ll ? when(ll, true) : "no losing trade"}
          short={ll ? when(ll, false) : "none"}
        />
        <Kpi
          label={
            <>
              <span className={s.dOnly}>Longest losing streak</span>
              <span className={s.mOnly}>Losing streak</span>
            </>
          }
          value={st.count}
          sub={streakSpan}
          short="longest"
        />
        <Kpi
          label="Median hold"
          value={o.medianHold === null ? "–" : fmtHold(o.medianHold)}
          sub={o.longestHold === null ? "" : `longest ${fmtHold(o.longestHold)}`}
          only="m"
        />
      </dl>
    </div>
  );
}

/** A figure in the unit, signed and coloured; "est." is set smaller so the value keeps its width. */
function Fig({ v, unit, est }: { v: number | null; unit: Unit; est?: boolean }) {
  if (v === null) return <span className="be">–</span>;
  return (
    <>
      <span className={signClass(v)}>{fmtValue(v, unit)}</span>
      {est && <span className={s.est}> est.</span>}
    </>
  );
}

function Kpi({
  label,
  value,
  sub,
  short,
  only,
}: {
  label: ReactNode;
  value: ReactNode;
  sub: ReactNode;
  short?: ReactNode;
  only?: "d" | "m";
}) {
  return (
    <div className={`${s.kpi} ${only === "d" ? s.dOnly : only === "m" ? s.mOnly : ""}`}>
      <dt className="k">{label}</dt>
      <dd className={s.kv}>{value}</dd>
      <dd className={s.ks}>
        {short !== undefined ? (
          <>
            <span className={s.dOnly}>{sub}</span>
            <span className={s.mOnly}>{short}</span>
          </>
        ) : (
          sub
        )}
      </dd>
    </div>
  );
}
