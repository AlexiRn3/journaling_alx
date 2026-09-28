"use client";

// Home: net result, equity curve, key figures, latest trades, the current month and "How I trade".
// Every figure is recomputed from the trades, in the visitor's unit, over the selected period.

import Link from "next/link";
import { useMemo } from "react";
import { EquityChart, EquityLegend } from "@/components/charts/EquityChart";
import { usePeriodTrades, usePrefs } from "@/components/site/prefs";
import { TradeCard } from "@/components/trade/TradeCard";
import { ACCOUNT_USD, isEstimated, overview, PERIOD_LABEL, sortByOpen, tradeValue } from "@/lib/calc";
import { fmtDate } from "@/lib/dates";
import { fmtHold, fmtRate, fmtRatio, fmtValue } from "@/lib/format";
import type { Trade, Unit } from "@/lib/types";
import { isPlaceholder } from "../strategy/text";
import { MonthCalendar } from "./MonthCalendar";
import { More, Num } from "./parts";
import s from "./home.module.css";

interface Props {
  trades: Trade[];
  slugs: Record<number, string>;
  account: string;
  instrument: string;
  intro: string;
  principles: string[]; // titles of the first three principles
}

/** The net in two other units, next to the big figure. */
const ALT_UNITS: Record<Unit, [Unit, Unit]> = { $: ["%", "R"], R: ["$", "%"], pts: ["$", "R"], "%": ["$", "R"] };

const sumIn = (ts: Trade[], u: Unit) => ts.reduce((a, t) => a + tradeValue(t, u), 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function HomeView({ trades, slugs, account, instrument, intro, principles }: Props) {
  const { unit, period, today } = usePrefs();
  const ts = usePeriodTrades(trades);
  const o = useMemo(() => overview(ts, unit), [ts, unit]);
  const empty = o.count === 0;
  const estR = isEstimated(ts, "R");

  const alt = ALT_UNITS[unit].map((u) => fmtValue(sumIn(ts, u), u, { est: u === "R" && estR }));
  const latest = useMemo(() => sortByOpen(ts).slice(-3).reverse(), [ts]);
  const href = (t: Trade) => `/journal/${slugs[t.id]}`;

  // Secondary unit for the key figures' sub lines: R under $, $ under everything else.
  const second: Unit = unit === "$" ? "R" : "$";
  const expSecond = empty ? null : sumIn(ts, second) / o.count;
  const ddUsd = useMemo(() => overview(ts, "$").maxDrawdown.value, [ts]);
  const ddPct = (ddUsd / ACCOUNT_USD) * 100;
  const dd = o.maxDrawdown.value;

  const since = o.firstDay ? fmtDate(o.firstDay) : "";
  const sentence = empty
    ? "No trades in this period."
    : period === "All"
      ? { wide: `Net result since the first session, ${since}`, narrow: `Net result since ${since}` }
      : `Net result over ${PERIOD_LABEL[period]}`;

  const figures: { key: string; label: string; value: React.ReactNode; sub: string; href: string; narrow: boolean }[] = [
    {
      key: "trades",
      label: "Trades",
      value: <span className="mono">{o.count}</span>,
      sub: `${plural(o.wins, "win", "wins")} · ${plural(o.losses, "loss", "losses")} · ${o.be} BE`,
      href: "/stats#overview",
      narrow: false,
    },
    {
      key: "win",
      label: "Win rate",
      value: <span className="mono">{fmtRate(o.winRate)}</span>,
      sub: "break-even excluded",
      href: "/stats#overview",
      narrow: true,
    },
    {
      key: "exp",
      label: "Expectancy",
      value: o.expectancy === null ? <span className="mono">–</span> : <Num v={o.expectancy} unit={unit} est={o.estimated} />,
      sub:
        expSecond === null
          ? "per trade"
          : `${fmtValue(expSecond, second)} per trade${second === "R" && estR ? ", est." : ""}`,
      href: "/stats#overview",
      narrow: true,
    },
    {
      key: "pf",
      label: "Profit factor",
      value: <span className="mono">{fmtRatio(o.profitFactor)}</span>,
      sub: "gross win ÷ gross loss",
      href: "/stats#overview",
      narrow: false,
    },
    {
      key: "dd",
      label: "Max drawdown",
      value: empty ? <span className="mono">–</span> : <Num v={dd} unit={unit} est={o.estimated && dd < 0} tone={dd < 0 ? "l" : "be"} />,
      sub: empty
        ? "from a peak"
        : unit === "%"
          ? `${fmtValue(ddUsd, "$")} from the peak`
          : `${fmtValue(ddPct, "%")} of the account`,
      href: "/stats#equity",
      narrow: true,
    },
    {
      key: "hold",
      label: "Median hold",
      value: <span className="mono">{o.medianHold === null ? "–" : fmtHold(o.medianHold)}</span>,
      sub: `longest ${o.longestHold === null ? "–" : fmtHold(o.longestHold)}`,
      href: "/stats#hold",
      narrow: true,
    },
  ];

  return (
    <div className={`wrap ${s.page}`}>
      {/* 1 · Net result */}
      <section className={s.hero} aria-labelledby="home-title">
        <div className={s.lead}>
          <h1 id="home-title" className={`k ${s.kicker}`}>
            <span className={s.onlyWide}>Trading log · </span>
            {account} · {instrument} futures
          </h1>
          <p className={s.net}>
            {empty ? (
              <span className="mono be">–</span>
            ) : (
              <Num v={o.net} unit={unit} est={o.estimated} />
            )}
          </p>
          <div className={s.caption}>
            {typeof sentence === "string" ? (
              <p className={s.sentence}>{sentence}</p>
            ) : (
              <p className={s.sentence}>
                <span className={s.onlyWide}>{sentence.wide}</span>
                <span className={s.onlyNarrow}>{sentence.narrow}</span>
              </p>
            )}
            {!empty && (
              <p className={`mono ${s.alt}`}>
                <span className={s.onlyWide}>{alt.join(" · ")}</span>
                <span className={s.onlyNarrow}>
                  {alt[0]} · {plural(o.count, "trade", "trades")} · PF {fmtRatio(o.profitFactor)}
                </span>
              </p>
            )}
          </div>
        </div>
        <dl className={s.rows}>
          <div className={s.row}>
            <dt className="k">Trades</dt>
            <dd className="mono">{o.count}</dd>
          </div>
          <div className={s.row}>
            <dt className="k">Win rate</dt>
            <dd className="mono">{fmtRate(o.winRate)}</dd>
          </div>
          <div className={s.row}>
            <dt className="k">Profit factor</dt>
            <dd className="mono">{fmtRatio(o.profitFactor)}</dd>
          </div>
        </dl>
      </section>

      {/* 2 · Equity */}
      <section className={s.equity} aria-labelledby="home-equity">
        <div className={s.secHead}>
          <h2 id="home-equity" className="h3">
            Equity
          </h2>
          <div className={s.onlyWide}>
            <EquityLegend unit={unit} />
          </div>
          <div className={s.onlyNarrow}>
            <EquityLegend unit={unit} compact />
          </div>
        </div>
        <div className={s.chartWide}>
          <EquityChart trades={ts} unit={unit} slugs={slugs} />
        </div>
        <div className={s.chartNarrow}>
          <EquityChart trades={ts} unit={unit} slugs={slugs} compact />
        </div>
      </section>

      {/* 3 · Key figures */}
      <section aria-labelledby="home-figures">
        <h2 id="home-figures" className="sr-only">
          Key figures
        </h2>
        <ul className={s.figs}>
          {figures.map((f) => (
            <li key={f.key} className={`${s.figItem} ${f.narrow ? "" : s.figExtra}`}>
              <Link href={f.href} className={`plain ${s.fig}`}>
                <span className={`k ${s.figLabel}`}>
                  {f.label}
                  <span className={s.figArrow} aria-hidden="true">
                    →
                  </span>
                </span>
                <span className={`${s.figVal} ${empty ? "be" : ""}`}>{f.value}</span>
                <span className={s.figSub}>{f.sub}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* 4 · Latest trades */}
      <section className={s.latest} aria-labelledby="home-latest">
        <div className={s.secHead}>
          <h2 id="home-latest" className="h2">
            Latest trades
          </h2>
          <More href="/journal">
            <span className={s.onlyWide}>View the journal</span>
            <span className={s.onlyNarrow}>
              All<span className="sr-only"> trades</span>
            </span>
          </More>
        </div>
        {latest.length === 0 ? (
          <p className={s.none}>No trades in this period.</p>
        ) : (
          <>
            <div className={`${s.cards} ${s.onlyWide}`}>
              {latest.map((t) => (
                <TradeCard key={t.id} trade={t} unit={unit} href={href(t)} className={s.card} />
              ))}
            </div>
            <div className={`${s.carousel} ${s.onlyNarrow}`}>
              {latest.map((t) => (
                <TradeCard key={t.id} trade={t} unit={unit} href={href(t)} compact className={s.slide} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* 5 · This month + How I trade */}
      <div className={s.bottom}>
        <MonthCalendar trades={trades} unit={unit} today={today} />

        <section className={s.how} aria-labelledby="home-how">
          <h2 id="home-how" className={s.howTitle}>
            How I trade
          </h2>
          <p className={`${s.howIntro} ${isPlaceholder(intro) ? s.ph : ""}`}>{intro}</p>
          <ol className={s.prin}>
            {principles.map((p, i) => (
              <li key={i}>
                <span className={`mono ${s.prinNo}`}>{String(i + 1).padStart(2, "0")}</span>
                <span className={`${s.prinTitle} ${isPlaceholder(p) ? s.ph : ""}`}>{p}</span>
              </li>
            ))}
          </ol>
          <More href="/strategy" className={s.selfStart}>
            Read the approach
          </More>
        </section>
      </div>
    </div>
  );
}
