"use client";

// Drawdown from the last peak, under the equity curve. Same width and same x positions as
// <EquityChart> (CHART_PAD), so each vertex sits right under its trade's dot.
// Compact (mobile): no axis labels, as in the mockup; the maximum is written above the chart.

import { useEffect, useMemo, useRef, useState } from "react";
import { CHART_PAD } from "@/components/charts/EquityChart";
import { equity, maxDrawdown } from "@/lib/calc";
import { fmtDayShort, fmtTime } from "@/lib/dates";
import { fmtAxis, fmtValue, MINUS } from "@/lib/format";
import type { Trade, Unit } from "@/lib/types";
import s from "./stats.module.css";

/** Smallest round number ≥ v (v > 0): 493 → 500, 3.47 → 4, 0.99 → 1, 24 → 25. */
function roundUp(v: number): number {
  const mag = 10 ** Math.floor(Math.log10(v));
  const steps = mag >= 1 ? [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] : [1, 2, 3, 4, 5, 6, 8, 10];
  const m = steps.find((x) => x * mag >= v - 1e-9) ?? 10;
  return Number((m * mag).toPrecision(6));
}

/** Axis label; small values keep the decimals fmtAxis would round away. */
function axis(v: number, unit: Unit, compact: boolean): string {
  if (v === 0 || Math.abs(v) >= 1 || unit === "$") return fmtAxis(v, unit, compact);
  const n = String(Number(Math.abs(v).toPrecision(2)));
  return `${v < 0 ? MINUS : ""}${n} ${unit}`;
}

const at = (t: Trade | null) => (t ? `${fmtDayShort(t.session_day)} ${fmtTime(t.close)}` : "start");

/** "max −$493.38 · Fri 25 06:03 → Mon 28 19:44" (peak and trough trades, by close). */
export function drawdownText(trades: Trade[], unit: Unit): { max: string; span: string } | null {
  const dd = maxDrawdown(trades, unit);
  if (dd.value >= 0) return null;
  const inside = equity(trades, unit)
    .slice(dd.peakIndex + 1, dd.troughIndex + 1)
    .map((p) => p.trade!);
  const est = unit === "R" && inside.some((t) => t.r_estimated);
  return { max: fmtValue(dd.value, unit, { est }), span: `${at(dd.peak)} → ${at(dd.trough)}` };
}

export function DrawdownChart({ trades, unit, compact }: { trades: Trade[]; unit: Unit; compact: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = useMemo(() => equity(trades, unit), [trades, unit]);
  const n = pts.length - 1;
  const H = compact ? 72 : 112;
  const pad = CHART_PAD[compact ? "compact" : "full"];
  const top = compact ? 6 : 10;
  const bottom = compact ? 6 : 12;
  const min = Math.min(0, ...pts.map((p) => p.dd));
  const floor = min < 0 ? roundUp(-min) : 1;
  const plotW = Math.max(1, W - pad.l - pad.r);
  const x = (i: number) => pad.l + (n ? (i * plotW) / n : plotW / 2);
  const y = (v: number) => top + (-v / floor) * (H - top - bottom);
  const fs = 11;

  const line = pts.map((p) => `${x(p.index).toFixed(1)},${y(p.dd).toFixed(1)}`).join(" ");
  const area = `${line} ${x(n).toFixed(1)},${y(0).toFixed(1)}`;
  const text = drawdownText(trades, unit);

  return (
    <div
      ref={boxRef}
      className={s.ddBox}
      style={{ height: H }}
      role="img"
      aria-label={text ? `Drawdown from the last peak: maximum ${text.max}, ${text.span}.` : "No drawdown in this period."}
    >
      {W > 0 && n > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className={s.ddSvg}>
          <line x1={pad.l} x2={W} y1={y(0)} y2={y(0)} className={s.ddZero} />
          {!compact && (
            <text x={0} y={y(0) + 4} className={s.ddTick} style={{ fontSize: fs }}>
              {axis(0, unit, compact)}
            </text>
          )}
          {min < 0 && (
            <>
              {!compact && (
                <>
                  <line x1={pad.l} x2={W} y1={y(-floor)} y2={y(-floor)} className={s.ddGrid} />
                  <text x={0} y={y(-floor) + 4} className={s.ddTick} style={{ fontSize: fs }}>
                    {axis(-floor, unit, compact)}
                  </text>
                </>
              )}
              <polygon points={area} className={s.ddArea} />
            </>
          )}
        </svg>
      )}
    </div>
  );
}
