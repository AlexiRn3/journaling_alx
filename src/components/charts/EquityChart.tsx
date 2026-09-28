"use client";

// Equity curve: one dot per trade (closing order), coloured by result, a separator per session day,
// max drawdown annotated, tooltip on hover / tap / arrow keys, click a dot to open the trade.
// The line draws itself once, in 0.9 s, when the chart mounts.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { equity, maxDrawdown } from "@/lib/calc";
import { fmtDayMonth, fmtDayShort, fmtMonth, fmtTime, monthKey } from "@/lib/dates";
import { fmtAxis, fmtValue, resultClass, resultMark, signClass } from "@/lib/format";
import type { Trade, Unit } from "@/lib/types";
import s from "./EquityChart.module.css";

interface Props {
  trades: Trade[]; // already filtered by period
  unit: Unit;
  slugs?: Record<number, string>; // id → slug, makes dots clickable
  height?: number;
  compact?: boolean; // mobile: short labels, smaller margins
  drawdown?: boolean; // annotate the max drawdown (default: !compact)
  endLabel?: boolean; // write the final total next to the last dot
  className?: string;
}

function niceStep(span: number, count: number): number {
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

export function EquityChart({
  trades,
  unit,
  slugs,
  height,
  compact = false,
  drawdown = !compact,
  endLabel = false,
  className = "",
}: Props) {
  const H = height ?? (compact ? 180 : 380);
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const touched = useRef(false); // last interaction was a tap: first tap shows, the tooltip opens
  const [tapMode, setTapMode] = useState(false);
  const router = useRouter();
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = useMemo(() => equity(trades, unit), [trades, unit]);
  const dd = useMemo(() => maxDrawdown(trades, unit), [trades, unit]);
  const est = unit === "R" && trades.some((t) => t.r_estimated);
  const n = pts.length - 1;

  const g = useMemo(() => {
    const padL = compact ? 34 : 64;
    const padR = compact ? 8 : 20;
    const padT = compact ? 12 : 20;
    const padB = compact ? 26 : 40;
    const plotW = Math.max(1, W - padL - padR);
    const plotH = H - padT - padB;
    const cums = pts.map((p) => p.cum);
    let lo = Math.min(0, ...cums);
    let hi = Math.max(0, ...cums);
    if (hi - lo < 1e-9) hi = lo + 1;
    const pad = (hi - lo) * 0.12;
    lo -= hi > 0 && lo === 0 ? pad * 0.6 : pad;
    hi += pad;
    const step = niceStep(hi - lo, compact ? 2 : 3);
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Math.abs(v) < 1e-9 ? 0 : v);
    const x = (i: number) => padL + (n ? (i * plotW) / n : plotW / 2);
    const y = (v: number) => padT + ((hi - v) / (hi - lo)) * plotH;
    return { padL, padR, padT, padB, plotW, plotH, x, y, ticks, lo, hi };
  }, [W, H, pts, n, compact]);

  // Session-day groups (or months when there are many days) for separators and labels.
  const groups = useMemo(() => {
    const days = pts.slice(1).map((p) => p.trade!.session_day);
    const byMonth = new Set(days).size > 20;
    const key = (d: string) => (byMonth ? monthKey(d) : d);
    const out: { key: string; from: number; to: number }[] = [];
    days.forEach((d, j) => {
      const i = j + 1;
      const k = key(d);
      const last = out[out.length - 1];
      if (last && last.key === k) last.to = i;
      else out.push({ key: k, from: i, to: i });
    });
    return out.map((grp, gi) => ({
      ...grp,
      label: byMonth
        ? fmtMonth(grp.key).toUpperCase()
        : compact
          ? fmtDayShort(grp.key).toUpperCase()
          : `${fmtDayMonth(grp.key).toUpperCase()} SESSION`,
      // separator before this group, halfway between the previous dot and this one
      sepX: gi > 0 ? (g.x(grp.from - 1) + g.x(grp.from)) / 2 : null,
    }));
  }, [pts, g, compact]);

  const pick = useCallback(
    (clientX: number) => {
      const el = boxRef.current;
      if (!el || !n) return null;
      const rx = clientX - el.getBoundingClientRect().left;
      const i = Math.round(((rx - g.padL) / g.plotW) * n);
      return Math.min(n, Math.max(1, i));
    },
    [g, n],
  );

  const open = (i: number | null) => {
    const t = i !== null ? pts[i]?.trade : null;
    if (t && slugs?.[t.id]) router.push(`/journal/${slugs[t.id]}`);
  };

  if (!n) {
    return (
      <div ref={boxRef} className={`${s.box} ${className}`} style={{ height: H }}>
        <p className={s.empty}>No trades in this period.</p>
      </div>
    );
  }

  const last = pts[n];
  const shown = active ?? n;
  const cur = pts[shown];
  const zeroY = g.y(0);
  const line = pts.map((p) => `${g.x(p.index).toFixed(1)},${g.y(p.cum).toFixed(1)}`).join(" ");
  const area = `${g.x(0)},${zeroY} ${line} ${g.x(n)},${zeroY}`;
  const fs = compact ? 10 : 11;

  // Tooltip placement: right of the dot, flipped left near the right edge.
  const tipW = 212;
  const tx = g.x(shown);
  const tipLeft = tx + 16 + tipW > W ? Math.max(0, tx - 16 - tipW) : tx + 16;
  const tipTop = Math.min(Math.max(0, g.y(cur.cum) - 44), H - 96);

  return (
    <div
      ref={boxRef}
      className={`${s.box} ${className}`}
      style={{ height: H }}
      tabIndex={0}
      role="group"
      aria-label={`Equity curve: ${fmtValue(last.cum, unit, { est })} over ${n} trade${n > 1 ? "s" : ""}${
        dd.value < 0 ? `, max drawdown ${fmtValue(dd.value, unit, { est })}` : ""
      }. Use the arrow keys to read each trade.`}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const d = e.key === "ArrowRight" ? 1 : -1;
          setActive((a) => Math.min(n, Math.max(1, (a ?? (d > 0 ? 0 : n + 1)) + d)));
        } else if (e.key === "Enter") open(active);
        else if (e.key === "Escape") setActive(null);
      }}
      onBlur={() => setActive(null)}
    >
      {W > 0 && (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className={`${s.svg} ${active !== null && slugs ? s.clickable : ""}`}
          aria-hidden="true"
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse") return;
            touched.current = false;
            setTapMode(false);
            setActive(pick(e.clientX));
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setActive(null);
          }}
          onPointerDown={(e) => {
            if (e.pointerType !== "mouse") {
              touched.current = true;
              setTapMode(true);
              setActive(pick(e.clientX));
            }
          }}
          onClick={(e) => {
            if (!touched.current) open(pick(e.clientX));
          }}
        >
          <defs>
            <clipPath id={`above-${uid}`}>
              <rect x="0" y="0" width={W} height={zeroY} />
            </clipPath>
            <clipPath id={`below-${uid}`}>
              <rect x="0" y={zeroY} width={W} height={H - zeroY} />
            </clipPath>
          </defs>

          {/* grid */}
          {g.ticks.map((v) => (
            <g key={v}>
              <line x1={g.padL} x2={W - (compact ? 0 : 0)} y1={g.y(v)} y2={g.y(v)} className={v === 0 ? s.zero : s.grid} />
              <text x={0} y={g.y(v) + 4} className={s.tick} style={{ fontSize: fs }}>
                {fmtAxis(v, unit, compact)}
              </text>
            </g>
          ))}

          {/* session separators and labels */}
          {groups.map((grp) => (
            <g key={grp.key}>
              {grp.sepX !== null && <line x1={grp.sepX} x2={grp.sepX} y1={g.padT} y2={H - g.padB + 6} className={s.sep} />}
              {(() => {
                const left = grp.sepX ?? g.padL;
                const next = groups[groups.indexOf(grp) + 1];
                const right = next?.sepX ?? W - g.padR;
                const fits = right - left > grp.label.length * (fs * 0.62) + 8;
                return fits ? (
                  <text x={(left + right) / 2} y={H - (compact ? 6 : 12)} textAnchor="middle" className={s.day} style={{ fontSize: fs }}>
                    {grp.label}
                  </text>
                ) : null;
              })()}
            </g>
          ))}

          {/* area, green above zero and red below */}
          <g className={s.area}>
            <polygon points={area} clipPath={`url(#above-${uid})`} style={{ fill: "var(--gbg)" }} />
            <polygon points={area} clipPath={`url(#below-${uid})`} style={{ fill: "var(--lbg)" }} />
          </g>

          {/* max drawdown */}
          {drawdown && dd.value < 0 && (
            <g className={s.dd}>
              <line x1={g.x(dd.peakIndex)} x2={g.x(dd.troughIndex)} y1={g.y(pts[dd.peakIndex].cum)} y2={g.y(pts[dd.peakIndex].cum)} className={s.ddDash} />
              <line x1={g.x(dd.troughIndex)} x2={g.x(dd.troughIndex)} y1={g.y(pts[dd.peakIndex].cum)} y2={g.y(pts[dd.troughIndex].cum)} className={s.ddBar} />
              <text
                x={g.x(dd.troughIndex) - 8}
                y={(g.y(pts[dd.peakIndex].cum) + g.y(pts[dd.troughIndex].cum)) / 2 + 4}
                textAnchor="end"
                className={s.ddText}
                style={{ fontSize: fs }}
              >
                max drawdown {fmtValue(dd.value, unit, { est })}
              </text>
            </g>
          )}

          {/* guide on the active (or last) dot */}
          <line x1={tx} x2={tx} y1={g.padT} y2={H - g.padB + 6} className={s.guide} />

          <polyline points={line} pathLength={1} className={s.line} />

          {pts.slice(1).map((p) => {
            const isCur = p.index === shown;
            const r = compact ? (isCur ? 6 : 4) : isCur ? 7 : 5;
            return (
              <circle
                key={p.trade!.id}
                cx={g.x(p.index)}
                cy={g.y(p.cum)}
                r={r}
                className={`${s.dot} ${active === p.index ? s.dotActive : ""}`}
                style={{ fill: resultMark(p.trade!.result), animationDelay: `${Math.round((p.index / n) * 700)}ms` }}
              />
            );
          })}

          {endLabel && (
            <text x={g.x(n) - 10} y={g.y(last.cum) - 12} textAnchor="end" className={s.end} style={{ fontSize: fs }}>
              {fmtValue(last.cum, unit, { est })}
            </text>
          )}
        </svg>
      )}

      {active !== null && cur.trade && (
        <Tip
          style={{ left: tipLeft, top: tipTop, width: tipW }}
          trade={cur.trade}
          value={cur.value}
          cum={cur.cum}
          unit={unit}
          href={tapMode && slugs?.[cur.trade.id] ? `/journal/${slugs[cur.trade.id]}` : undefined}
        />
      )}
      <span className="sr-only" aria-live="polite">
        {active !== null && cur.trade
          ? `Trade ${cur.trade.id}, ${fmtDayShort(cur.trade.session_day)}, ${cur.trade.side}: ${fmtValue(cur.value, unit)}. Total ${fmtValue(cur.cum, unit)}.`
          : ""}
      </span>
    </div>
  );
}

function Tip({
  trade,
  value,
  cum,
  unit,
  href,
  style,
}: {
  trade: Trade;
  value: number;
  cum: number;
  unit: Unit;
  href?: string;
  style: React.CSSProperties;
}) {
  const est = unit === "R" && trade.r_estimated;
  const kind = trade.entry_type === "first" ? "" : `, ${trade.entry_type}`;
  const body = (
    <>
      <span className="k" style={{ fontSize: 10 }}>
        {fmtDayShort(trade.session_day)} · {fmtTime(trade.close)} ET · Trade {trade.id}
      </span>
      <span className={s.tipRow}>
        <span>
          {trade.side}
          {kind}
        </span>
        <span className={`mono ${resultClass(trade.result)}`}>{fmtValue(value, unit, { est })}</span>
      </span>
      <span className={s.tipRow}>
        <span className="pencil">Total</span>
        <span className={`mono ${signClass(cum)}`}>{fmtValue(cum, unit, { est })}</span>
      </span>
      {href && <span className={`k ${s.tipOpen}`}>Open the trade →</span>}
    </>
  );
  return href ? (
    <Link href={href} className={`plain ${s.tip} ${s.tipLink}`} style={style}>
      {body}
    </Link>
  ) : (
    <div className={s.tip} style={style} aria-hidden="true">
      {body}
    </div>
  );
}

/** Legend for the header row: Win / Loss / Break-even + what the curve shows. */
export function EquityLegend({ unit, compact = false }: { unit: Unit; compact?: boolean }) {
  const what: Record<Unit, string> = { $: "Cumulative net, $", R: "Cumulative R, est.", pts: "Cumulative points", "%": "Cumulative, % of the account" };
  return (
    <div className={s.legend}>
      {(["win", "loss", "be"] as const).map((r) => (
        <span key={r} className={`mono ${s.legItem}`}>
          <svg width="10" height="10" aria-hidden="true">
            <circle cx="5" cy="5" r="4" style={{ fill: resultMark(r) }} />
          </svg>
          {r === "win" ? "Win" : r === "loss" ? "Loss" : "Break-even"}
        </span>
      ))}
      {!compact && <span className={`mono ${s.legItem}`}>{what[unit]} · one dot per trade</span>}
    </div>
  );
}
