// POST /api/admin/import  { paste?: string, csv?: string, expect?: string }
// Runs the import again on the current file and writes data/trades.json (meta.updated_at = now, ET).
// `expect` is the summary the owner saw in the preview: if the file changed in between and the
// import would now do something else, nothing is written (409) and the new preview is returned.
import { loadDb, saveDb } from "@/lib/data";
import { planImport } from "@/lib/import/plan";
import { guard, json, readJson } from "../_shared";
import { importInput } from "./input";

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const { body, error } = await readJson(req);
  if (error) return error;
  const input = importInput(body);
  if ("error" in input) return json({ error: input.error }, 400);

  const { report, db } = planImport(loadDb(), input);
  if (input.expect !== undefined && input.expect !== report.summary) {
    return json({ error: "The trades file changed since the preview. Check the new preview and import again.", report }, 409);
  }
  if (!report.willWrite) return json({ report, written: false });
  saveDb(db);
  return json({ report, written: true, updated_at: db.meta.updated_at });
}
