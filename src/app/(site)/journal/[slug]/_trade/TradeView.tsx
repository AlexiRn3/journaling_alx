"use client";

// Trade sheet: the vertical story of one trade (PLAN.md §4 "Trade").
// Unit-dependent figures follow the visitor's unit; prices, risk and fees stay as executed.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { usePrefs } from "@/components/site/prefs";
import { isEstimatedStop } from "@/components/trade/MiniSchema";
import { tradeValue } from "@/lib/calc";
import { dayKey, fmtTime } from "@/lib/dates";
import { ENTRY_ICON, fmtHold, fmtMoney, fmtPrice, fmtValue, resultClass, signClass } from "@/lib/format";
import type { Trade, Unit } from "@/lib/types";
import { PricePath } from "./PricePath";
import { Shot } from "./Shot";
import {
  executionNote,
  exitNotes,
  exitValue,
  isEst,
  kicker,
  linkChip,
  maeMfe,
  neighbourGap,
  neighbourTitle,
  otherUnits,
  resultText,
  sessionName,
  stopDistance,
  stopSuffix,
  targetSuffix,
  title,
  type Label,
} from "./text";
import { useSwipe } from "./useSwipe";
import s from "./trade.module.css";

export interface NavTrade {
  trade: Trade;
  href: string;
}

export interface StoryPart {
  key: string;
  title: string;
  html: string; // Markdown rendered on the server
}

interface Props {
  trade: Trade;
  instrument: string;
  linked: Trade | null; // previous attempt of a re-entry / flip
  prev: NavTrade | null;
  next: NavTrade | null;
  day: NavTrade[]; // every trade of the session day, current included, by open time
  avgStopPts: number;
  pointValue: number;
  story: StoryPart[];
}

/** Desktop and mobile spellings, switched by CSS. */
function Two({ l }: { l: Label }) {
  if (l.long === l.short) return <>{l.long}</>;
  return (
    <>
      <span className={s.desk}>{l.long}</span>
      <span className={s.mob}>{l.short}</span>
    </>
  );
}

export function TradeView({ trade: t, instrument, linked, prev, next, day, avgStopPts, pointValue, story }: Props) {
  const { unit } = usePrefs();
  const router = useRouter();
  const page = useRef<HTMLDivElement>(null);

  useSwipe(page, {
    onNext: next ? () => router.push(next.href, { transitionTypes: ["nav-forward"] }) : null,
    onPrev: prev ? () => router.push(prev.href, { transitionTypes: ["nav-back"] }) : null,
  });

  const journalHref = `/journal?day=${t.session_day}`;
  const riskPts = stopDistance(t, pointValue);

  return (
    <div ref={page} className={`wrap ${s.page}`}>
      <TopNav journalHref={journalHref} prev={prev} next={next} />
      <Header trade={t} instrument={instrument} linked={linked} unit={unit} />
      <DayRow trade={t} day={day} unit={unit} />
      {t.shots.before && (
        <Shot
          src={t.shots.before}
          alt={`Chart of the trade before the entry, ${fmtTime(t.open)} ET`}
          label={`Before · ${fmtTime(t.open)} ET`}
        />
      )}
      <Execution trade={t} linked={linked} avgStopPts={avgStopPts} />
      <PricePath trade={t} riskPts={riskPts} />
      <Exits trade={t} unit={unit} instrument={instrument} />
      {t.shots.after && (
        <Shot
          src={t.shots.after}
          alt={`Chart after the exit, ${fmtTime(t.close)} ET`}
          label={`After · ${fmtTime(t.close)} ET`}
          more="what the market did next"
        />
      )}
      {story.length > 0 && <Story parts={story} />}
      <Neighbours trade={t} prev={prev} next={next} unit={unit} />
    </div>
  );
}

/* ------------------------------------------------------------ navigation */

function TopNav({ journalHref, prev, next }: { journalHref: string; prev: NavTrade | null; next: NavTrade | null }) {
  return (
    <nav aria-label="Trade navigation" className={s.nav}>
      <Link href={journalHref} transitionTypes={["nav-back"]} className={s.navLink}>
        ← Journal
      </Link>
      <div className={s.navPN}>
        {prev ? (
          <Link href={prev.href} transitionTypes={["nav-back"]} rel="prev" className={s.navLink}>
            ‹ Previous<span className={s.desk}> trade</span>
          </Link>
        ) : (
          <span className={s.navOff} aria-disabled="true">
            ‹ Previous<span className={s.desk}> trade</span>
          </span>
        )}
        {next ? (
          <Link href={next.href} transitionTypes={["nav-forward"]} rel="next" className={s.navLink}>
            Next<span className={s.desk}> trade</span> ›
          </Link>
        ) : (
          <span className={s.navOff} aria-disabled="true">
            Next<span className={s.desk}> trade</span> ›
          </span>
        )}
      </div>
    </nav>
  );
}

/* ---------------------------------------------------------------- header */

function Header({ trade: t, instrument, linked, unit }: { trade: Trade; instrument: string; linked: Trade | null; unit: Unit }) {
  const link = linkChip(t, linked);
  const est = isEst(t, unit);
  const value = fmtValue(tradeValue(t, unit), unit);
  return (
    <header className={s.head}>
      <p className={`k ${s.kick}`}>
        <Two l={kicker(t)} />
      </p>
      <h1 className={s.title}>{title(t, instrument)}</h1>
      <div className={s.res}>
        <p className={`mono ${resultClass(t.result)} ${s.big}`}>
          {t.result === "be" && <span className={s.bigTag}>BE </span>}
          {value}
          {est && <span className={s.bigTag}> est.</span>}
        </p>
        <p className={`mono ${s.others}`}>{otherUnits(t, unit)}</p>
      </div>
      <ul className={s.tags} aria-label="Trade details">
        <li className={s.tag}>{t.side}</li>
        <li className={s.tag}>{t.session}</li>
        <li className={s.tag}>
          <Two l={{ long: `${t.qty} contract${t.qty > 1 ? "s" : ""}`, short: `${t.qty} ${instrument}` }} />
        </li>
        {t.flash ? (
          <li className={`${s.tag} ${s.tagFlash}`}>Flash trade · {fmtHold(t.hold_seconds)}</li>
        ) : (
          <li className={s.tag}>{fmtHold(t.hold_seconds)}</li>
        )}
        {link && (
          <li className={`${s.tag} ${s.tagBlue}`}>
            <Two l={link} />
          </li>
        )}
      </ul>
    </header>
  );
}

/* ------------------------------------------------------- session sequence */

function DayRow({ trade: t, day, unit }: { trade: Trade; day: NavTrade[]; unit: Unit }) {
  const row = useRef<HTMLOListElement>(null);

  // On a narrow screen the row scrolls sideways: bring the current trade into view.
  useEffect(() => {
    const el = row.current;
    const cur = el?.querySelector<HTMLElement>("[aria-current]");
    if (!el || !cur || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = Math.max(0, cur.offsetLeft - (el.clientWidth - cur.offsetWidth) / 2);
  }, [t.id]);

  const curIndex = day.findIndex((d) => d.trade.id === t.id);
  return (
    <section className={s.day} aria-labelledby="day-h">
      <h2 id="day-h" className={`k ${s.dayK}`}>
        {sessionName(t.session_day)}
      </h2>
      <ol ref={row} className={s.dayList} data-noswipe="">
        {day.map((d, i) => {
          const x = d.trade;
          const icon = ENTRY_ICON[x.entry_type];
          const time = `${icon ? `${icon} ` : ""}${fmtTime(x.open)}`;
          const res = x.result === "be" ? "BE" : fmtValue(tradeValue(x, unit), unit, { est: isEst(x, unit) });
          const resShort = x.result === "be" ? "BE" : fmtValue(tradeValue(x, unit), unit, { compact: true });
          if (x.id === t.id) {
            return (
              <li key={x.id}>
                <span className={`${s.dayChip} ${s.dayCur}`} aria-current="true">
                  {time}
                  <span className={s.desk}> {x.side}</span> · this trade
                </span>
              </li>
            );
          }
          return (
            <li key={x.id}>
              <Link
                href={d.href}
                transitionTypes={[i < curIndex ? "nav-back" : "nav-forward"]}
                className={`plain ${s.dayChip}`}
              >
                {time}
                <span className={s.desk}>
                  {" "}
                  {x.side} · {res}
                </span>
                <span className={s.mob}> · {resShort}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------- execution */

interface Cell {
  key: string;
  label: ReactNode;
  value: ReactNode;
  cls?: string;
  hideMobile?: boolean;
}

function Execution({ trade: t, linked, avgStopPts }: { trade: Trade; linked: Trade | null; avgStopPts: number }) {
  const estStop = isEstimatedStop(t);
  const stopSfx = stopSuffix(t);
  const tgtSfx = targetSuffix(t);
  const mm = maeMfe(t);
  const note = executionNote(t, linked, avgStopPts);
  const lab = (name: string, sfx: Label | null) =>
    sfx ? <Two l={{ long: `${name} · ${sfx.long}`, short: `${name} · ${sfx.short}` }} /> : name;

  const cells: Cell[] = [
    { key: "entry", label: "Entry", value: fmtPrice(t.entry) },
    {
      key: "stop",
      label: lab("Stop", stopSfx),
      value: `${estStop ? "~" : ""}${fmtPrice(t.stop.price)}`,
      cls: estStop ? s.est : undefined,
    },
    {
      key: "target",
      label: lab("Target", tgtSfx),
      value: t.target ? fmtPrice(t.target.price) : <span aria-label="Not recorded">–</span>,
      cls: t.target ? undefined : s.muted,
    },
    {
      key: "exit",
      label: t.exits.length > 1 ? <Two l={{ long: "Exit · average", short: "Exit · avg" }} /> : "Exit",
      value: fmtPrice(t.exit),
    },
    { key: "contracts", label: "Contracts", value: String(t.qty) },
    {
      key: "risk",
      label: t.r_estimated ? <Two l={{ long: "Risk · estimated", short: "Risk · est." }} /> : "Risk",
      value: `${t.r_estimated ? "~" : ""}${fmtMoney(t.risk_usd, { signed: false })}`,
      cls: t.r_estimated ? s.est : undefined,
    },
    { key: "net", label: "Net", value: fmtMoney(t.net), cls: resultClass(t.result), hideMobile: mm === null },
    { key: "fees", label: "Fees", value: fmtMoney(t.fees, { signed: false }) },
    { key: "hold", label: "Hold", value: fmtHold(t.hold_seconds) },
    {
      key: "mae",
      label: mm === null ? "MAE / MFE" : "MAE / MFE · pts",
      value: mm ?? "Not tracked",
      cls: mm === null ? s.muted : undefined,
      hideMobile: mm === null,
    },
  ];

  return (
    <section className={s.exec} aria-labelledby="exec-h">
      <h2 id="exec-h" className="h2">
        Execution
      </h2>
      <dl className={s.grid}>
        {cells.map((c) => (
          <div key={c.key} className={`${s.cell} ${s[`o_${c.key}`]} ${c.hideMobile ? s.deskOnly : ""}`}>
            <dt className="k">{c.label}</dt>
            <dd className={`mono ${s.v} ${c.cls ?? ""}`}>{c.value}</dd>
          </div>
        ))}
      </dl>
      {note && <p className={`mono ${s.note}`}>{note}</p>}
    </section>
  );
}

/* ----------------------------------------------------------------- exits */

function Exits({ trade: t, unit, instrument }: { trade: Trade; unit: Unit; instrument: string }) {
  const notes = exitNotes(t);
  return (
    <section className={s.exits} aria-labelledby="exits-h">
      <h2 id="exits-h" className={`k ${s.exitsK}`}>
        Exits
      </h2>
      <div role="table" aria-labelledby="exits-h" className={s.xt}>
        <div role="row" className="sr-only">
          <span role="columnheader">Time</span>
          <span role="columnheader">Contracts</span>
          <span role="columnheader">Price</span>
          <span role="columnheader">Result</span>
          <span role="columnheader">Note</span>
        </div>
        {t.exits.map((e, i) => {
          const v = exitValue(t, e, unit);
          const cls = t.result === "be" ? "be" : signClass(v);
          return (
            <div role="row" key={`${e.time}-${i}`} className={s.xr}>
              <span role="cell" className={`mono ${s.xTime}`}>
                {fmtTime(e.time, true)}
                {dayKey(e.time) !== dayKey(t.open) && <span className="sr-only"> next day</span>}
              </span>
              <span role="cell" className={`mono ${s.xQty}`}>
                <span className={s.desk}>
                  {e.qty} {instrument}
                </span>
                <span className={s.mob}>· {e.qty}</span>
              </span>
              <span role="cell" className={`mono ${s.xPrice}`}>
                @ {fmtPrice(e.price)}
              </span>
              <span role="cell" className={`mono ${s.xVal} ${cls}`}>
                {fmtValue(v, unit, { est: isEst(t, unit) })}
              </span>
              <span role="cell" className={s.xNote}>
                <Two l={notes[i]} />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- story */

function Story({ parts }: { parts: StoryPart[] }) {
  return (
    <section className={s.story} aria-labelledby="story-h">
      <h2 id="story-h" className="sr-only">
        Explanation
      </h2>
      {parts.map((p) => (
        <div key={p.key} className={s.wr}>
          <h3 className={s.wrH}>{p.title}</h3>
          <div className={s.md} dangerouslySetInnerHTML={{ __html: p.html }} />
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------ previous / next */

function Neighbours({ trade: t, prev, next, unit }: { trade: Trade; prev: NavTrade | null; next: NavTrade | null; unit: Unit }) {
  return (
    <nav aria-label="Previous and next trades" className={s.pn}>
      {prev ? (
        <Link href={prev.href} transitionTypes={["nav-back"]} className={`plain ${s.card}`}>
          <span className="k">‹ Previous trade · {neighbourGap(prev.trade, t, "before")}</span>
          <span className={s.cardRow}>
            <span className={s.cardT}>{neighbourTitle(prev.trade)}</span>
            <span className={`mono ${resultClass(prev.trade.result)} ${s.cardV}`}>{resultText(prev.trade, unit)}</span>
          </span>
        </Link>
      ) : (
        <div className={s.cardNone}>
          <span className="k">‹ Previous trade</span>
          <span className={s.cardT}>This is the first trade</span>
        </div>
      )}
      {next ? (
        <Link href={next.href} transitionTypes={["nav-forward"]} className={`plain ${s.card}`}>
          <span className="k">Next trade · {neighbourGap(t, next.trade, "after")} ›</span>
          <span className={s.cardRow}>
            <span className={s.cardT}>{neighbourTitle(next.trade)}</span>
            <span className={`mono ${resultClass(next.trade.result)} ${s.cardV}`}>{resultText(next.trade, unit)}</span>
          </span>
        </Link>
      ) : (
        <div className={s.cardNone}>
          <span className="k">Next trade ›</span>
          <span className={s.cardT}>This is the latest trade</span>
        </div>
      )}
    </nav>
  );
}
