// Timeline view: session days newest first, each trade a notebook entry in the order it was taken,
// with how long after the previous trade it came.
import Link from "next/link";
import { secondaryValue } from "@/components/trade/TradeCard";
import { Val } from "@/components/ui/Val";
import { tradeValue, type DaySummary } from "@/lib/calc";
import { fmtDayLong, fmtDayShort, fmtTime } from "@/lib/dates";
import { fmtPrice, resultClass, resultMark } from "@/lib/format";
import type { Trade, Unit } from "@/lib/types";
import { excerpt, exitsLabel, followLine, holdLabel, plural, resultCounts, resultText, sessionOpenLabel } from "./lib";
import s from "./Timeline.module.css";

interface Props {
  days: DaySummary[]; // oldest first
  all: Trade[]; // every published trade, to find the real previous trade
  unit: Unit;
  slugs: Record<number, string>;
}

export function Timeline({ days, all, unit, slugs }: Props) {
  return (
    <div className={s.days}>
      {[...days].reverse().map((d) => {
        const est = unit === "R" && d.trades.some((t) => t.r_estimated);
        return (
          <section key={d.day} id={`day-${d.day}`} className={s.day} aria-labelledby={`tl-${d.day}`}>
            <header className={s.dayHead}>
              <span className="k">Session · {fmtDayShort(d.day)}</span>
              <h2 id={`tl-${d.day}`} className={s.dayName}>
                {fmtDayLong(d.day)}
              </h2>
              <span className={`mono ${s.opened}`}>Opened {sessionOpenLabel(d.day)}</span>
              <Val v={d.net} unit={unit} est={est} className={s.dayNet} />
              <span className={s.counts}>
                {plural(d.trades.length, "trade")}
                {resultCounts(d, true) && ` · ${resultCounts(d, true)}`}
              </span>
            </header>
            <ol className={s.list}>
              {d.trades.map((t) => (
                <Entry key={t.id} t={t} all={all} unit={unit} href={`/journal/${slugs[t.id]}`} />
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function Entry({ t, all, unit, href }: { t: Trade; all: Trade[]; unit: Unit; href: string }) {
  const follow = followLine(t, all);
  const text = excerpt(t);
  return (
    <li className={s.ent}>
      <span className={s.node} style={{ background: resultMark(t.result) }} aria-hidden="true" />
      <div className={`mono ${s.time}`}>
        <span className={s.t1}>{fmtTime(t.open)}</span>
        <span className={s.t2}>
          <span aria-hidden="true">→ </span>
          <span className="sr-only">closed at </span>
          {fmtTime(t.close)}
        </span>
      </div>
      <div className={s.body}>
        <div className={s.text}>
          {follow && <span className={`mono ${s.follow} ${follow.linked ? s.linked : ""}`}>{follow.text}</span>}
          <div className={s.titleRow}>
            <h3 className={s.title}>
              {t.side} · {t.qty} MNQ · {t.session}
            </h3>
            <span className={`mono ${resultClass(t.result)} ${s.val}`}>
              {resultText(t, tradeValue(t, unit), unit, { est: unit === "R" && t.r_estimated })}
            </span>
          </div>
          <span className={`mono ${s.meta}`}>
            {holdLabel(t)} · {secondaryValue(t, unit)} · {fmtPrice(t.entry)} → {fmtPrice(t.exit)}
            {exitsLabel(t)}
          </span>
          {text && <p className={s.story}>{text}</p>}
          <Link href={href} className={s.open}>
            Open the trade →
          </Link>
        </div>
        {t.shots.before && (
          <div className={`shot ${s.thumb}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.shots.before} alt="" loading="lazy" />
          </div>
        )}
      </div>
    </li>
  );
}
