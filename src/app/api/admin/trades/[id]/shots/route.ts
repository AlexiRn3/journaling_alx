// Screenshots of a trade, stored in public/shots/<id>-before.<ext> / <id>-after.<ext> and
// referenced as /shots/… in trade.shots. The file and data/trades.json change together.
//
// POST   multipart form: slot = "before" | "after", file = PNG, JPEG or WebP, 10 MB at most.
//        Replacing a screenshot deletes the old file.
// DELETE ?slot=before|after — removes the file and clears the field.
import fs from "node:fs";
import path from "node:path";
import { loadDb, saveDb } from "@/lib/data";
import { SHOT_PATH } from "@/lib/import/edit";
import type { TradesFile } from "@/lib/types";
import { guard, json, tradeId } from "../../../_shared";

const SHOTS_DIR = path.join(process.cwd(), "public", "shots");
const MAX_BYTES = 10 * 1024 * 1024;
type Slot = "before" | "after";

/** Image type from the first bytes, whatever the file name says. */
function sniff(b: Uint8Array): "png" | "jpg" | "webp" | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

/** Deletes /shots/<file> unless another trade or slot still uses it. */
function removeFile(db: TradesFile, publicPath: string | null, keep: { id: number; slot: Slot }) {
  if (!publicPath || !SHOT_PATH.test(publicPath)) return;
  const used = db.trades.some((t) =>
    (["before", "after"] as Slot[]).some((s) => !(t.id === keep.id && s === keep.slot) && t.shots[s] === publicPath),
  );
  if (used) return;
  const file = path.join(SHOTS_DIR, path.basename(publicPath));
  if (path.dirname(file) !== SHOTS_DIR) return;
  try {
    fs.unlinkSync(file);
  } catch {
    // already gone
  }
}

function slotOf(v: unknown): Slot | null {
  return v === "before" || v === "after" ? v : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const id = tradeId((await params).id);
  if (id === null) return json({ error: "Unknown trade." }, 404);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) {
    return json({ error: "The image is over 10 MB." }, 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Send a multipart form with slot and file." }, 400);
  }
  const slot = slotOf(form.get("slot"));
  const file = form.get("file");
  if (!slot) return json({ error: "slot must be before or after." }, 400);
  if (!(file instanceof File)) return json({ error: "No file received." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "The image is over 10 MB." }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniff(bytes);
  if (!ext) return json({ error: "Only PNG, JPEG or WebP images." }, 415);

  // From here on everything is synchronous: no other request can write in between.
  const db = loadDb();
  const trade = db.trades.find((t) => t.id === id);
  if (!trade) return json({ error: `Trade ${id} not found.` }, 404);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const name = `${id}-${slot}.${ext}`;
  const publicPath = `/shots/${name}`;
  const tmp = path.join(SHOTS_DIR, `.${name}.tmp`);
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, path.join(SHOTS_DIR, name));
  const old = trade.shots[slot];
  trade.shots = { ...trade.shots, [slot]: publicPath };
  if (old !== publicPath) removeFile(db, old, { id, slot });
  saveDb(db);
  return json({ path: publicPath, shots: trade.shots, bytes: bytes.length });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const id = tradeId((await params).id);
  if (id === null) return json({ error: "Unknown trade." }, 404);
  const slot = slotOf(new URL(req.url).searchParams.get("slot"));
  if (!slot) return json({ error: "slot must be before or after." }, 400);

  const db = loadDb();
  const trade = db.trades.find((t) => t.id === id);
  if (!trade) return json({ error: `Trade ${id} not found.` }, 404);
  const old = trade.shots[slot];
  if (!old) return json({ shots: trade.shots });
  trade.shots = { ...trade.shots, [slot]: null };
  removeFile(db, old, { id, slot });
  saveDb(db);
  return json({ shots: trade.shots });
}
