"use client";

// Global display preferences: unit (R, $, pts, %) and period (1W … All).
// Remembered between visits (localStorage). $ and All by default.
// The server and the first client render always use the defaults, then the stored values load.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { filterByPeriod } from "@/lib/calc";
import { dayKey, todayET } from "@/lib/dates";
import { PERIODS, UNITS, type Period, type Trade, type Unit } from "@/lib/types";
import { swap } from "./transitions";

interface Prefs {
  unit: Unit;
  period: Period;
  setUnit: (u: Unit) => void;
  setPeriod: (p: Period) => void;
  /** Today in ET ("YYYY-MM-DD"). The data's update day until the page has mounted. */
  today: string;
  /** False during the server render and the first client render. */
  ready: boolean;
}

const PrefsContext = createContext<Prefs | null>(null);

const KEY_UNIT = "alx:unit";
const KEY_PERIOD = "alx:period";

function read<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

export function PrefsProvider({ updatedAt, children }: { updatedAt: string; children: ReactNode }) {
  const [unit, setUnitState] = useState<Unit>("$");
  const [period, setPeriodState] = useState<Period>("All");
  const [today, setToday] = useState(dayKey(updatedAt));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = read(KEY_UNIT, UNITS);
    const p = read(KEY_PERIOD, PERIODS);
    if (u) setUnitState(u);
    if (p) setPeriodState(p);
    setToday(todayET());
    setReady(true);
  }, []);

  const setUnit = useCallback((u: Unit) => {
    write(KEY_UNIT, u);
    swap(() => setUnitState(u));
  }, []);

  const setPeriod = useCallback((p: Period) => {
    write(KEY_PERIOD, p);
    swap(() => setPeriodState(p));
  }, []);

  const value = useMemo(
    () => ({ unit, period, setUnit, setPeriod, today, ready }),
    [unit, period, setUnit, setPeriod, today, ready],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used inside <PrefsProvider>");
  return ctx;
}

/** Trades inside the selected period. */
export function usePeriodTrades(trades: Trade[]): Trade[] {
  const { period, today } = usePrefs();
  return useMemo(() => filterByPeriod(trades, period, today), [trades, period, today]);
}
