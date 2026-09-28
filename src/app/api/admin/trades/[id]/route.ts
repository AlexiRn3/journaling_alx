// PATCH /api/admin/trades/:id — editorial and classification fields of one trade.
// Body (every key optional): { published, story: { context, scenario, why, management }, shots,
// mae, mfe, stop, target (a price, or null for the automatic value), session, entry_type,
// result, session_day }. Derived fields are then recomputed for every trade.
import { loadDb, saveDb } from "@/lib/data";
import { applyTradeEdit, autoValues, parseEdit } from "@/lib/import/edit";
import { guard, json, readJson, tradeId } from "../../_shared";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const id = tradeId((await params).id);
  if (id === null) return json({ error: "Unknown trade." }, 404);
  const { body, error } = await readJson(req, 200_000);
  if (error) return error;
  const { edit, errors } = parseEdit(body);
  if (errors.length) return json({ error: errors.join(" ") }, 400);

  const db = loadDb();
  if (!db.trades.some((t) => t.id === id)) return json({ error: `Trade ${id} not found.` }, 404);
  const out = applyTradeEdit(db, id, edit);
  if (out.errors.length) return json({ error: out.errors.join(" ") }, 400);

  const changed = JSON.stringify(out.db) !== JSON.stringify(db);
  if (changed) saveDb(out.db);
  return json({
    trade: out.trade,
    others: out.others,
    auto: autoValues(out.db, id),
    avgStop: out.db.rules.avg_stop_distance_pts,
    written: changed,
  });
}
