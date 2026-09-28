// Shared by the admin API routes. The admin only runs locally (`next dev`, or ALX_ADMIN=1):
// otherwise every route answers 404, as if it did not exist.
import "server-only";
import { adminEnabled } from "@/lib/data";

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** null when the request may go on, otherwise the response to send. */
export function guard(req: Request): Response | null {
  if (!adminEnabled()) return new Response("Not found", { status: 404 });
  // There is no login: refuse requests made by pages from another site to the local server.
  if (req.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Cross-site request refused." }, 403);
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host")) return json({ error: "Cross-site request refused." }, 403);
    } catch {
      return json({ error: "Cross-site request refused." }, 403);
    }
  }
  return null;
}

export async function readJson(req: Request, maxBytes = 2_000_000): Promise<{ body: unknown; error: Response | null }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) return { body: null, error: json({ error: "Request too large." }, 413) };
  try {
    const text = await req.text();
    if (text.length > maxBytes) return { body: null, error: json({ error: "Request too large." }, 413) };
    return { body: JSON.parse(text), error: null };
  } catch {
    return { body: null, error: json({ error: "The request body must be JSON." }, 400) };
  }
}

export function tradeId(raw: string): number | null {
  return /^\d{1,9}$/.test(raw) ? Number(raw) : null;
}
