"use client";

// Price path: stop, entry, exit and target on one horizontal line, drawn to scale.
// The axis runs in the trade's direction (profit to the right, for longs and shorts alike),
// so the risk always sits on the left of the entry and the gain on its right.
// Labels are placed by a small search that keeps them apart at any width (mono font: known widths).

import { useLayoutEffect, useRef, useState } from "react";
import { isEstimatedStop } from "@/components/trade/MiniSchema";
import { fmtInt, fmtPrice, fmtValue } from "@/lib/format";
import type { Trade } from "@/lib/types";
import { sideSign } from "./text";
import s from "./trade.module.css";

type Row = "top" | "mid" | "bot";
type Anchor = "start" | "end" | "middle";
type Tone = "ink" | "loss" | "gain" | "be";

interface Opt {
  row: Row | null; // null = hidden
  anchor: Anchor;
  at: number; // x of the anchor point
  cost: number;
}

interface Lab {
  key: string;
  text: string;
  tone: Tone;
  opts: Opt[];
}

interface Placed {
  key: string;
  text: string;
  tone: Tone;
  row: Row;
  anchor: Anchor;
  x: number; // text x (SVG text-anchor semantics)
  a: number; // left edge
  b: number; // right edge
}

const H = 112;
const ROW_Y: Record<Row, number> = { top: 16, mid: 44, bot: 102 };
const BAR = { y: 52, h: 16 };
const MARK = { y1: 36, y2: 84 };
const TARGET_Y1 = 22;
const LABEL_GAP = 12; // min space between two labels of a row
const OFFSET = 6; // label distance from its marker

const same = (a: number, b: number) => Math.abs(a - b) < 0.005;
const STEPS = [0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2500];

function layout(t: Trade, W: number, riskPts: number) {
  const dir = sideSign(t);
  const fs = W < 560 ? 11 : 12;
  const cw = fs * 0.6; // IBM Plex Mono advance width
  const u = (p: number) => (p - t.entry) * dir; // points in the trade's favour
  const stop = t.stop.price;
  const tgt = t.target?.price ?? null;

  const us = [u(stop), 0, u(t.exit), ...(tgt !== null ? [u(tgt)] : [])];
  const lo = Math.min(...us);
  const span = Math.max(Math.max(...us) - lo, 0.25);
  const wide = W >= 900;
  // On wide screens the stop label fits outside, on the left of the stop.
  const stopText = same(t.exit, stop) ? `exit at stop ${fmtPrice(stop)}` : `stop ${isEstimatedStop(t) ? "~" : ""}${fmtPrice(stop)}`;
  const padL = wide ? Math.max(112, Math.ceil(stopText.length * cw + OFFSET + 2)) : Math.max(16, Math.round(W * 0.05));
  const padR = wide ? 98 : padL;
  const k = (W - padL - padR) / span; // px per point
  const X = (p: number) => padL + (u(p) - lo) * k;
  const priceAt = (x: number) => t.entry + dir * ((x - padL) / k + lo);

  const x0 = Math.max(0, padL - 62);
  const x1 = Math.min(W, W - padR + 52);

  // Unlabelled ticks on round prices, 3 to 6 of them.
  const pA = priceAt(x0);
  const pB = priceAt(x1);
  const pMin = Math.min(pA, pB);
  const pMax = Math.max(pA, pB);
  const step = STEPS.find((st) => (pMax - pMin) / st <= 6) ?? 5000;
  const ticks: number[] = [];
  for (let p = Math.ceil(pMin / step) * step; p <= pMax; p += step) ticks.push(X(p));

  const round = (p: number) => {
    const r = pMax - pMin > 40 ? 5 : 1;
    return fmtInt(Math.round(p / r) * r);
  };
  const range = `${round(pA)} → ${round(pB)}`;

  const xs = X(stop);
  const xe = X(t.entry);
  const xx = X(t.exit);
  const xt = tgt !== null ? X(tgt) : null;
  const exitAtStop = same(t.exit, stop);
  const exitAtTarget = tgt !== null && same(t.exit, tgt);
  const resultTone: Tone = t.result === "win" ? "gain" : t.result === "loss" ? "loss" : "be";

  const o = (row: Row | null, anchor: Anchor, at: number, cost: number): Opt => ({ row, anchor, at, cost });
  const labels: Lab[] = [];
  labels.push({
    key: "stop",
    text: stopText,
    tone: "loss",
    opts: [o("bot", "end", xs, 0), o("bot", "start", xs, 2), o("top", "end", xs, 4), o("top", "start", xs, 5)],
  });
  labels.push({
    key: "entry",
    text: `entry ${fmtPrice(t.entry)}`,
    tone: "ink",
    opts: [o("bot", "start", xe, 0), o("bot", "end", xe, 1), o("top", "start", xe, 3), o("top", "end", xe, 3)],
  });
  if (!exitAtStop) {
    const gain = xx >= xe;
    labels.push({
      key: "exit",
      text: exitAtTarget ? `exit at target ${fmtPrice(t.exit)}` : `exit ${fmtPrice(t.exit)}`,
      tone: exitAtTarget ? "gain" : "ink",
      opts: gain
        ? [o("bot", "end", xx, 0), o("bot", "start", xx, 1), o("top", "end", xx, 3), o("top", "start", xx, 3)]
        : [o("bot", "end", xx, 0), o("bot", "start", xx, 0.5), o("top", "end", xx, 3), o("top", "start", xx, 3)],
    });
  }
  if (xt !== null && !exitAtTarget) {
    labels.push({
      key: "target",
      text: `target ${fmtPrice(tgt!)}`,
      tone: "gain",
      opts: [o("top", "end", xt, 0), o("top", "start", xt, 1), o("bot", "start", xt, 4), o("bot", "end", xt, 4)],
    });
  }
  const zoneR = Math.max(xe, xx);
  const zoneL = Math.min(xe, xx);
  labels.push({
    key: "result",
    text: fmtValue(t.points, "pts"),
    tone: resultTone,
    opts: [
      o("mid", "middle", (xe + xx) / 2, 0),
      o("mid", "start", zoneR, 1.5),
      o("mid", "end", zoneL, 1.5),
      o("top", "middle", (xe + xx) / 2, 3),
      o("top", "start", zoneR, 4),
    ],
  });
  if (!exitAtStop) {
    labels.push({
      key: "risk",
      text: fmtValue(riskPts, "pts", { signed: false }).replace(" pts", ""),
      tone: "loss",
      opts: [o("mid", "middle", (xs + xe) / 2, 0), o("top", "middle", (xs + xe) / 2, 4), o(null, "middle", 0, 6)],
    });
  }

  // Vertical marker lines cross the middle row: labels there must not sit on them.
  const midObstacles = [xs, xe, xx, ...(xt !== null ? [xt] : [])].map((x) => [x - 3, x + 3] as const);

  const place = (l: Lab, op: Opt): Placed | null => {
    if (!op.row) return null;
    const w = l.text.length * cw;
    let a: number;
    let x: number;
    if (op.anchor === "start") {
      x = op.at + OFFSET;
      a = x;
    } else if (op.anchor === "end") {
      x = op.at - OFFSET;
      a = x - w;
    } else {
      x = op.at;
      a = x - w / 2;
    }
    return { key: l.key, text: l.text, tone: l.tone, row: op.row, anchor: op.anchor, x, a, b: a + w };
  };

  const conflicts = (p: Placed, placed: Placed[]): number => {
    let n = 0;
    if (p.a < 0 || p.b > W) n++;
    for (const q of placed) {
      if (q.row === p.row && p.a < q.b + LABEL_GAP && q.a < p.b + LABEL_GAP) n++;
    }
    if (p.row === "mid") {
      for (const [a, b] of midObstacles) if (p.a < b + 2 && a < p.b + 2) n++;
    }
    return n;
  };

  // Depth-first search over the options, cheapest valid combination wins.
  let best: { cost: number; placed: Placed[] } = { cost: Infinity, placed: [] };
  const walk = (i: number, cost: number, placed: Placed[]) => {
    if (cost >= best.cost) return;
    if (i === labels.length) {
      best = { cost, placed };
      return;
    }
    for (const op of labels[i].opts) {
      const p = place(labels[i], op);
      const c = op.cost + (p ? conflicts(p, placed) * 100 : 0);
      walk(i + 1, cost + c, p ? [...placed, p] : placed);
    }
  };
  walk(0, 0, []);

  return {
    fs,
    range,
    base: [x0, x1] as const,
    ticks,
    xs,
    xe,
    xx,
    xt,
    exitAtStop,
    labels: best.placed,
  };
}

const TONE: Record<Tone, string> = { ink: s.tInk, loss: s.tLoss, gain: s.tGain, be: s.tBe };
const ZONE: Record<Trade["result"], string> = { win: s.zGain, loss: s.zLoss, be: s.zBe };
const ANCHOR: Record<Anchor, "start" | "end" | "middle"> = { start: "start", end: "end", middle: "middle" };

export function PricePath({ trade: t, riskPts }: { trade: Trade; riskPts: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.round(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = layout(t, W ?? 1200, riskPts);
  const est = isEstimatedStop(t);
  const aria = [
    `Stop ${fmtPrice(t.stop.price)}${est ? " (estimated)" : ""}`,
    `entry ${fmtPrice(t.entry)}`,
    `exit ${fmtPrice(t.exit)}${t.exits.length > 1 ? " (average)" : ""}`,
    ...(t.target ? [`target ${fmtPrice(t.target.price)}`] : []),
    `${fmtValue(t.points, "pts")}`,
  ].join(", ");

  return (
    <section className={s.path} aria-labelledby="price-path">
      <h2 id="price-path" className="k">
        Price path<span style={{ visibility: W === null ? "hidden" : undefined }}>, {L.range}</span>
      </h2>
      <div ref={ref} className={s.pathBox} style={{ visibility: W === null ? "hidden" : undefined }}>
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${W ?? 1200} ${H}`}
          role="img"
          aria-label={aria}
          style={{ fontSize: L.fs }}
        >
          <line x1={L.base[0]} x2={L.base[1]} y1={60} y2={60} className={s.base} />
          {L.ticks.map((x) => (
            <line key={x} x1={x} x2={x} y1={54} y2={66} className={s.base} />
          ))}
          {!L.exitAtStop && (
            <rect
              x={Math.min(L.xs, L.xe)}
              y={BAR.y}
              width={Math.abs(L.xe - L.xs)}
              height={BAR.h}
              rx={2}
              className={s.zLoss}
            />
          )}
          <rect
            x={Math.min(L.xe, L.xx)}
            y={BAR.y}
            width={Math.max(Math.abs(L.xx - L.xe), 1)}
            height={BAR.h}
            rx={2}
            className={ZONE[t.result]}
          />
          {!L.exitAtStop && <line x1={L.xs} x2={L.xs} y1={MARK.y1} y2={MARK.y2} className={s.mStop} />}
          <line x1={L.xe} x2={L.xe} y1={MARK.y1} y2={MARK.y2} className={s.mInk} />
          <line x1={L.xx} x2={L.xx} y1={MARK.y1} y2={MARK.y2} className={L.exitAtStop ? s.mHit : s.mInk} />
          {L.xt !== null && <line x1={L.xt} x2={L.xt} y1={TARGET_Y1} y2={BAR.y} className={s.mTarget} />}
          {L.labels.map((l) => (
            <text key={l.key} x={l.x} y={ROW_Y[l.row]} textAnchor={ANCHOR[l.anchor]} className={TONE[l.tone]}>
              {l.text}
            </text>
          ))}
        </svg>
      </div>
    </section>
  );
}
