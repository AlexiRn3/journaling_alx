import type { Metadata } from "next";
import { PageTransition } from "@/components/site/transitions";
import { loadDb, publicTrades, slugRecord } from "@/lib/data";
import { StatsView } from "./StatsView";

export const metadata: Metadata = {
  title: "Statistics",
  description: "Every figure of the trading log: overview, equity and drawdown, distribution, and results by session, hour, weekday, side, hold time and entry type.",
};

export default function StatsPage() {
  const db = loadDb();
  const trades = publicTrades(db);
  const { rules } = db;
  return (
    <PageTransition>
      <StatsView
        trades={trades}
        slugs={slugRecord(trades)}
        rules={{ beBand: rules.breakeven_band_usd, linkWindow: rules.link_window_seconds, sessions: rules.sessions_et }}
      />
    </PageTransition>
  );
}
