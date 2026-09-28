// /admin/trades/[id]: complete one trade (screenshots, write-up, stop, classification, publication).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/site/transitions";
import { adminEnabled, loadDb, publicTrades, slugRecord, TRADES_FILE } from "@/lib/data";
import { fmtDayShort, fmtTime } from "@/lib/dates";
import { autoValues } from "@/lib/import/edit";
import type { AdminTrade } from "@/lib/import/derive";
import { EditTrade, type LinkedInfo } from "../../_ui/EditTrade";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function find(id: string) {
  const db = loadDb();
  const n = /^\d{1,9}$/.test(id) ? Number(id) : NaN;
  return { db, trade: db.trades.find((t) => t.id === n) as AdminTrade | undefined };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  if (!adminEnabled()) return {};
  const { trade } = find((await params).id);
  return { title: trade ? `Edit · ${fmtDayShort(trade.open)}, ${fmtTime(trade.open)}` : "Admin" };
}

export default async function EditTradePage({ params }: Params) {
  if (!adminEnabled()) notFound();
  const { db, trade } = find((await params).id);
  if (!trade) notFound();

  const auto = autoValues(db, trade.id)!;
  const slug = slugRecord(publicTrades(db))[trade.id] ?? null;
  const prev = trade.linked_to !== null ? db.trades.find((t) => t.id === trade.linked_to) : undefined;
  const linked: LinkedInfo | null = prev ? { id: prev.id, side: prev.side, result: prev.result } : null;

  return (
    <PageTransition>
      <div className="wrap">
        <EditTrade
          key={trade.id}
          trade={trade}
          auto={auto}
          slug={slug}
          linked={linked}
          pointValue={db.rules.point_value_usd}
          avgStop={db.rules.avg_stop_distance_pts}
          dataFile={TRADES_FILE.endsWith("data/trades.json") ? "data/trades.json" : TRADES_FILE}
        />
      </div>
    </PageTransition>
  );
}
