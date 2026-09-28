"use client";

// Filter bar, stuck to the top (56 px): logo, account, unit, period, update time.
// On Strategy: logo only. Below 720 px: logo, two dropdowns (unit, period) and the theme button.

import { usePathname } from "next/navigation";
import { Seg } from "@/components/ui/Seg";
import { fmtTime, parseNaive } from "@/lib/dates";
import { PERIODS, UNITS, type Meta, type Period, type Unit } from "@/lib/types";
import { Wordmark } from "./Logo";
import { usePrefs } from "./prefs";
import { ThemeToggle } from "./ThemeToggle";
import Link from "next/link";
import s from "./TopBar.module.css";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const UNIT_NAMES: Record<Unit, string> = { R: "R multiples", $: "dollars", pts: "points", "%": "percent of the account" };
const PERIOD_NAMES: Record<Period, string> = { "1W": "last week", "1M": "last month", "3M": "last 3 months", YTD: "year to date", All: "all time" };

function updated(ts: string) {
  const d = parseNaive(ts);
  return `Updated ${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${fmtTime(ts)} ET`;
}

export function TopBar({ meta }: { meta: Meta }) {
  const pathname = usePathname();
  const minimal = pathname.startsWith("/strategy");
  const { unit, period, setUnit, setPeriod } = usePrefs();

  return (
    <header className={`${s.bar} site-bar`}>
      <div className={s.left}>
        <Link href="/" aria-label="ALX, home" className={`plain ${s.logo}`}>
          <Wordmark />
        </Link>
        {!minimal && (
          <>
            <span className={s.div} aria-hidden="true" />
            <span className={`mono ${s.account}`}>
              {meta.account} · {meta.instrument}
            </span>
          </>
        )}
      </div>

      {/* Desktop and tablet */}
      {!minimal && (
        <div className={s.right}>
          <Seg label="Unit" options={UNITS.map((u) => ({ value: u, label: u, title: UNIT_NAMES[u] }))} value={unit} onChange={setUnit} />
          <Seg label="Period" options={PERIODS.map((p) => ({ value: p, label: p, title: PERIOD_NAMES[p] }))} value={period} onChange={setPeriod} />
          <span className={`mono ${s.updated}`}>{updated(meta.updated_at)}</span>
        </div>
      )}

      {/* Mobile */}
      <div className={s.mobile}>
        {!minimal && (
          <>
            <label className={s.pick}>
              <span>{unit}</span>
              <span aria-hidden="true">▾</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label={`Unit: ${UNIT_NAMES[unit]}`}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className={s.pick}>
              <span>{period}</span>
              <span aria-hidden="true">▾</span>
              <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label={`Period: ${PERIOD_NAMES[period]}`}>
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
