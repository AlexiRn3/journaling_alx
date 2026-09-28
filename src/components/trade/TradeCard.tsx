// Trade card (Home "Latest trades", Journal "Cards"): screenshot or sketch, meta, result, details.
import Link from "next/link";
import { tradeR, tradeValue } from "@/lib/calc";
import { fmtDayShort, fmtTime } from "@/lib/dates";
import { ENTRY_ICON, fmtHold, fmtValue, resultClass } from "@/lib/format";
import type { Trade, Unit } from "@/lib/types";
import { MiniSchema } from "./MiniSchema";
import s from "./TradeCard.module.css";

interface Props {
  trade: Trade;
  unit: Unit;
  href: string;
  compact?: boolean; // mobile carousel: smaller type and shot
  shotHeight?: number;
  className?: string;
}

/** "Mon 28 session · Sun 19:44 ET" */
export function tradeWhen(t: Trade): string {
  return `${fmtDayShort(t.session_day)} session · ${fmtDayShort(t.open).slice(0, 3)} ${fmtTime(t.open)} ET`;
}

/** The unit shown under the result: R when the result is in another unit, $ when it is in R. */
export function secondaryValue(t: Trade, unit: Unit): string {
  return unit === "R"
    ? fmtValue(t.net, "$")
    : fmtValue(tradeR(t), "R", { est: t.r_estimated });
}

export function TradeCard({ trade: t, unit, href, compact = false, shotHeight, className = "" }: Props) {
  const h = shotHeight ?? (compact ? 170 : 220);
  return (
    <Link href={href} className={`plain ${s.card} ${compact ? s.compact : ""} ${className}`}>
      <div className={`shot ${s.shot}`} style={{ height: h }}>
        {t.shots.before ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.shots.before} alt={`Chart of trade ${t.id}, before the entry`} loading="lazy" />
        ) : (
          <>
            <MiniSchema trade={t} />
            <span className={`chip ${s.none}`}>No screenshot yet</span>
          </>
        )}
      </div>
      <span className="k" style={compact ? { fontSize: 10 } : undefined}>
        {tradeWhen(t)}
        {t.entry_type !== "first" && (
          <span className="blue">
            {" "}
            · {ENTRY_ICON[t.entry_type]} {t.entry_type}
          </span>
        )}
        {t.flash && <span> · flash</span>}
      </span>
      <div className={s.head}>
        <span className={s.title}>
          {t.side}, {t.session}
        </span>
        <span className={`mono ${resultClass(t.result)} ${s.val}`}>
          {t.result === "be" ? "BE " : ""}
          {fmtValue(tradeValue(t, unit), unit, { est: unit === "R" && t.r_estimated })}
        </span>
      </div>
      <span className={s.sub}>
        {t.qty} MNQ · {fmtHold(t.hold_seconds)} · {secondaryValue(t, unit)}
      </span>
    </Link>
  );
}
