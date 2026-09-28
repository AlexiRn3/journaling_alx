import type { ImportInput } from "@/lib/import/plan";

/** Validates { paste?: string, csv?: string, expect?: string }. */
export function importInput(body: unknown): (ImportInput & { expect?: string }) | { error: string } {
  if (!body || typeof body !== "object") return { error: "Send { paste, csv }." };
  const b = body as Record<string, unknown>;
  for (const k of ["paste", "csv", "expect"]) {
    if (b[k] !== undefined && typeof b[k] !== "string") return { error: `${k} must be text.` };
  }
  const paste = (b.paste as string | undefined) ?? "";
  const csv = (b.csv as string | undefined) ?? "";
  if (!paste.trim() && !csv.trim()) return { error: "Nothing to import: paste the Recent Trades table or add the orders CSV." };
  return { paste, csv, expect: b.expect as string | undefined };
}
