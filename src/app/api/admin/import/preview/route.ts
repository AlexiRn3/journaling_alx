// POST /api/admin/import/preview  { paste?: string, csv?: string }
// What an import would do, without writing anything: rows read, merges, signs, links, flash
// trades, duplicates, CSV stops. The admin calls it while the owner pastes.
import { loadDb } from "@/lib/data";
import { planImport } from "@/lib/import/plan";
import { guard, json, readJson } from "../../_shared";
import { importInput } from "../input";

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const { body, error } = await readJson(req);
  if (error) return error;
  const input = importInput(body);
  if ("error" in input) return json({ error: input.error }, 400);
  const { report } = planImport(loadDb(), input);
  return json({ report });
}
