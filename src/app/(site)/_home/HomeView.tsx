"use client";
// Placeholder, replaced by the Home page.
import { EquityChart, EquityLegend } from "@/components/charts/EquityChart";
import { usePeriodTrades, usePrefs } from "@/components/site/prefs";
import { TradeCard } from "@/components/trade/TradeCard";
import { Val } from "@/components/ui/Val";
import { overview, sortByOpen } from "@/lib/calc";
import type { Trade } from "@/lib/types";

export function HomeView({ trades, slugs }: { trades: Trade[]; slugs: Record<number, string> }) {
  const { unit } = usePrefs();
  const ts = usePeriodTrades(trades);
  const o = overview(ts, unit);
  const latest = sortByOpen(ts).slice(-3).reverse();
  return (
    <div className="wrap" style={{ paddingTop: 72 }}>
      <span className="k">Trading log</span>
      <div><Val v={o.net} unit={unit} est={o.estimated} style={{ fontSize: 104, lineHeight: 0.95 }} /></div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 56 }}><h2 className="h3">Equity</h2><EquityLegend unit={unit} /></div>
      <EquityChart trades={ts} unit={unit} slugs={slugs} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 28, marginTop: 60 }}>
        {latest.map((t) => <TradeCard key={t.id} trade={t} unit={unit} href={`/journal/${slugs[t.id]}`} />)}
      </div>
    </div>
  );
}
