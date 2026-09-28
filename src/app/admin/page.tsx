// /admin: import (paste from Tradesea, orders CSV, auto-sync later) and every trade with what
// its sheet still misses. Reads data/trades.json on each request (local admin, `next dev`).
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/site/transitions";
import { hasFullSheet, sortByOpen } from "@/lib/calc";
import { adminEnabled, loadDb } from "@/lib/data";
import { fmtDayShort, fmtTime } from "@/lib/dates";
import { ImportCard } from "./_ui/ImportCard";
import { TradeList, type ListRow } from "./_ui/TradeList";
import s from "./_ui/list.module.css";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  if (!adminEnabled()) notFound();
  const db = loadDb();
  const trades = sortByOpen(db.trades).reverse(); // newest first

  const rows: ListRow[] = trades.map((t) => {
    const s = t.story;
    return {
      id: t.id,
      opened: `${fmtDayShort(t.open)} · ${fmtTime(t.open)}`,
      day: fmtDayShort(t.session_day),
      session: t.session,
      side: t.side,
      qty: t.qty,
      net: t.net,
      result: t.result,
      r: t.r,
      published: t.published !== false,
      full: hasFullSheet(t),
      missShots: !t.shots.before,
      missWriteup: !(s.context || s.scenario || s.why || s.management),
      stopEst: t.r_estimated,
    };
  });
  const published = rows.filter((r) => r.published);
  const full = published.filter((r) => r.full).length;
  const hidden = rows.length - published.length;

  const summary = [
    `${rows.length} imported`,
    `${published.length - full} published as short sheet${published.length - full === 1 ? "" : "s"}`,
    ...(full ? [`${full} as full sheet${full === 1 ? "" : "s"}`] : []),
    `${hidden} hidden`,
  ].join(" · ");

  return (
    <PageTransition>
      <div className="wrap">
        <header className={s.head}>
          <h1 className={s.title}>Trades</h1>
          <span className={`mono ${s.summary}`}>{summary}</span>
        </header>
        <ImportCard />
        <TradeList rows={rows} />
      </div>
    </PageTransition>
  );
}
