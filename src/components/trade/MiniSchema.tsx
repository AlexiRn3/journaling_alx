// Sketch for a trade without screenshot: entry, stop (and target), and the path to the exit.
import { isEstimatedStop } from "@/lib/calc";
import { fmtPrice, resultMark } from "@/lib/format";
import type { Trade } from "@/lib/types";
import s from "./MiniSchema.module.css";

export function MiniSchema({ trade: t }: { trade: Trade }) {
  const target = t.target && Math.abs(t.target.price - t.exit) > 0.01 ? t.target.price : null;
  const prices = [t.entry, t.stop.price, t.exit, ...(target !== null ? [target] : [])];
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pad = (hi - lo) * 0.45 || 1;
  // y in % of the height, 0 = top
  const y = (p: number) => (1 - (p - lo + pad) / (hi - lo + 2 * pad)) * 100;
  const ye = y(t.entry);
  const ys = y(t.stop.price);
  const yx = y(t.exit);
  const yt = target !== null ? y(target) : null;
  const exitIsStop = Math.abs(t.exit - t.stop.price) < 0.01;
  // Labels never sit between two lines: entry goes on the side away from the stop,
  // stop and exit go beyond their line, away from the entry.
  const beyond = (yl: number, other: number) => (yl < other ? "above" : "below");
  const entrySide = ys < ye ? "below" : "above";
  const est = isEstimatedStop(t) ? "~" : "";

  return (
    <div className={s.box} aria-hidden="true">
      <svg width="100%" height="100%" viewBox="0 0 360 100" preserveAspectRatio="none">
        <line x1="30" x2="330" y1={ye} y2={ye} className={s.entry} />
        <line x1="30" x2="330" y1={ys} y2={ys} className={s.stop} />
        {yt !== null && <line x1="30" x2="330" y1={yt} y2={yt} className={s.target} />}
        <line x1="90" x2="270" y1={ye} y2={yx} className={s.path} style={{ stroke: resultMark(t.result) }} />
      </svg>
      <span className={`mono ${s.lab} ${s[entrySide]}`} style={{ top: `${ye}%` }}>
        entry {fmtPrice(t.entry)}
      </span>
      <span className={`mono ${s.lab} ${s.loss} ${s[beyond(ys, ye)]}`} style={{ top: `${ys}%` }}>
        stop {est}
        {fmtPrice(t.stop.price)}
      </span>
      {!exitIsStop && (
        <span className={`mono ${s.lab} ${s.right} ${s[beyond(yx, ye)]}`} style={{ top: `${yx}%` }}>
          exit {fmtPrice(t.exit)}
        </span>
      )}
    </div>
  );
}
