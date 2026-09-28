"use client";

// Statistics: a long page in 9 sections with its contents. Every figure follows the visitor's
// unit and period (top bar); the page cross-fades when either changes.

import { useMemo } from "react";
import { EquityChart } from "@/components/charts/EquityChart";
import { usePeriodTrades, usePrefs } from "@/components/site/prefs";
import {
  byEntryType,
  byHold,
  byHour,
  bySession,
  bySide,
  byWeekday,
  overview,
  PERIOD_LABEL,
  type Overview as OverviewData,
} from "@/lib/calc";
import { fmtHold, UNIT_LABEL } from "@/lib/format";
import { UNITS, type Session, type Trade, type Unit } from "@/lib/types";
import { Breakdown } from "./Breakdown";
import { Pills, Toc, useScrollSpy } from "./Contents";
import { Distribution } from "./Distribution";
import { DrawdownChart, drawdownText } from "./Drawdown";
import { Overview } from "./Overview";
import { Empty, Section, useMedia } from "./Section";
import s from "./stats.module.css";

export interface StatsRules {
  beBand: number; // $30
  linkWindow: number; // seconds (120)
  sessions: Record<Session, string>; // "18:00-03:00"
}

interface Props {
  trades: Trade[];
  slugs: Record<number, string>;
  rules: StatsRules;
}

export function StatsView({ trades, slugs, rules }: Props) {
  const { unit, period } = usePrefs();
  const ts = usePeriodTrades(trades);
  const mobile = useMedia("(max-width: 719px)");
  const narrow = useMedia("(max-width: 1023px)");
  const { active, go } = useScrollSpy(narrow);

  const ov = useMemo(
    () => Object.fromEntries(UNITS.map((u) => [u, overview(ts, u)])) as Record<Unit, OverviewData>,
    [ts],
  );
  const o = ov[unit];
  const has = ts.length > 0;

  const tables = useMemo(
    () => ({
      session: bySession(ts, unit),
      hour: byHour(ts, unit),
      weekday: byWeekday(ts, unit),
      side: bySide(ts, unit),
      hold: byHold(ts, unit),
      entry: byEntryType(ts, unit),
    }),
    [ts, unit],
  );

  const periodName = PERIOD_LABEL[period].replace(/^the /, "").replace(/^./, (c) => c.toUpperCase());
  const count = `${ts.length} trade${ts.length === 1 ? "" : "s"}`;
  const win = Math.round(rules.linkWindow / 60);
  const sessionsCaption = `ET · ${(Object.keys(rules.sessions) as Session[])
    .map((k) => `${k} ${rules.sessions[k].split("-")[0]}`)
    .join(" · ")}`;
  const dd = drawdownText(ts, unit);

  // "3 of the 4 first entries ended at break-even."
  const first = tables.entry.find((r) => r.key === "first");
  const firstBe =
    first && first.be > 0
      ? first.be === first.count
        ? first.count === 1
          ? " The only first entry ended at break-even."
          : ` All ${first.count} first entries ended at break-even.`
        : ` ${first.be} of the ${first.count} first entries ended at break-even.`
      : "";

  return (
    <div className={s.page}>
      <Pills active={active} go={go} />

      <div className={`wrap ${s.wrap}`}>
        <header className={s.head}>
          <h1 className={s.title}>Statistics</h1>
          <p className={`mono ${s.caption}`}>
            <span className={s.dOnly}>
              All figures in {UNIT_LABEL[unit]} · {periodName} · {count} · BE = net within ±${rules.beBand}
            </span>
            <span className={s.mOnly}>
              In {unit} · {periodName} · {count} · BE = ±${rules.beBand}
            </span>
          </p>
        </header>

        <div className={s.grid}>
          <Toc active={active} go={go} />

          <div className={s.sections}>
            <Section id="overview" num="01" title="Overview">
              {has ? <Overview trades={ts} unit={unit} ov={ov} /> : <Empty />}
            </Section>

            <Section
              id="equity"
              num="02"
              title="Equity and drawdown"
              caption="one dot per trade, in closing order"
              className={s.secEquity}
            >
              {has ? (
                <>
                  <EquityChart
                    trades={ts}
                    unit={unit}
                    slugs={slugs}
                    compact={mobile}
                    height={mobile ? undefined : 300}
                    drawdown={false}
                    endLabel
                  />
                  <div className={s.ddHead}>
                    <span className={`k ${s.dOnly}`}>Drawdown from the last peak</span>
                    <span className={`mono ${s.ddMax} ${s.dOnly} ${dd ? "l" : "be"}`}>
                      {dd ? `max ${dd.max} · ${dd.span}` : "no drawdown in this period"}
                    </span>
                    <span className={`mono ${s.ddMobile} ${s.mOnly}`}>
                      Drawdown from the last peak · {dd ? <span className="l">max {dd.max}</span> : "none"}
                    </span>
                  </div>
                  <DrawdownChart trades={ts} unit={unit} compact={mobile} />
                </>
              ) : (
                <Empty />
              )}
            </Section>

            <Section
              id="distribution"
              num="03"
              title="Distribution of results"
              short="Distribution"
              caption="number of trades per result band"
              className={s.secDist}
            >
              {has ? <Distribution trades={ts} unit={unit} beBand={rules.beBand} labelledBy="distribution-h" /> : <Empty />}
            </Section>

            <Section id="session" num="04" title="By session" caption={sessionsCaption}>
              {has ? <Breakdown rows={tables.session} unit={unit} head="Session" labelledBy="session-h" /> : <Empty />}
            </Section>

            <Section id="hour" num="05" title="By hour of entry" caption="ET">
              {has ? <Breakdown rows={tables.hour} unit={unit} head="Hour" labelledBy="hour-h" mobileNote="hours in ET" /> : <Empty />}
            </Section>

            <Section id="weekday" num="06" title="By weekday" caption="session day, 18:00 → 17:00 ET">
              {has ? (
                <Breakdown
                  rows={tables.weekday}
                  unit={unit}
                  head="Day"
                  labelledBy="weekday-h"
                  short={(r) => r.label.slice(0, 3)}
                  mobileNote="session day, 18:00 → 17:00 ET"
                />
              ) : (
                <Empty />
              )}
            </Section>

            <Section id="side" num="07" title="Long vs short">
              {has ? <Breakdown rows={tables.side} unit={unit} head="Side" labelledBy="side-h" /> : <Empty />}
            </Section>

            <Section id="hold" num="08" title="Hold time" caption={o.medianHold === null ? undefined : `median ${fmtHold(o.medianHold)}`}>
              {has ? <Breakdown rows={tables.hold} unit={unit} head="Held" labelledBy="hold-h" /> : <Empty />}
            </Section>

            <Section id="entry" num="09" title="By entry type" caption={`within ${win} min of the previous close`}>
              {has ? (
                <>
                  <Breakdown
                    rows={tables.entry}
                    unit={unit}
                    head="Entry"
                    labelledBy="entry-h"
                    beInDetails
                    mobileNote={`Within ${win} min of the previous close. Re-entry: same side. Flip: opposite side.`}
                  />
                  <p className={`${s.foot} ${s.dOnly}`}>
                    Re-entry: same side, reopened within {win} min of a close. Flip: opposite side, within {win} min.
                    {firstBe}
                  </p>
                </>
              ) : (
                <Empty />
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
