"use client";

// Import card: three tabs (paste from Tradesea, orders CSV, auto-sync later) and the live
// "Before importing" checklist. Every change of the input asks the server for a preview
// (nothing written); "Import" runs the same import again on the server and writes the file.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, ViewTransition, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { swap } from "@/components/site/transitions";
import type { ImportReport } from "@/lib/import/plan";
import { fmtMoney, fmtPrice, fmtValue } from "@/lib/format";
import s from "./import.module.css";

type Tab = "paste" | "csv";
type Mark = "ok" | "warn" | "todo";
interface Item {
  mark: Mark;
  text: ReactNode;
  details?: string[];
}

const MAX_CSV = 2_000_000;
const EXAMPLE = `Tradeify  RTSL50436117908  MNQ  2026-09-27, 7:44:34 PM  2026-09-27, 8:23:39 PM  Long  1  $30,809.48  $30,894.00  $167.23  $1.82
Tradeify  RTSL50436117908  MNQ  2026-09-27, 7:44:34 PM  2026-09-27, 8:23:31 PM  Long  9  $30,809.47  $30,900.25  $1,617.57  $16.38
…`;

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const lineList = (xs: { line: number; reason: string }[]) => xs.map((x) => `Line ${x.line}: ${x.reason}`);
const fmtHoldShort = (sec: number) => (sec < 60 ? `${sec} s` : `${Math.round(sec / 60)} min`);

function pasteChecks(r: ImportReport): Item[] {
  const items: Item[] = [];
  items.push({
    mark: r.rowsRead ? "ok" : "warn",
    text: r.rowsRead ? `${n(r.rowsRead, "row")} read${r.headerLines ? " · header line skipped" : ""}` : "No trade row found yet",
  });
  if (r.unreadable.length) items.push({ mark: "warn", text: `${n(r.unreadable.length, "line")} not read`, details: lineList(r.unreadable) });
  if (r.skipped.length) items.push({ mark: "warn", text: `${n(r.skipped.length, "row")} skipped`, details: lineList(r.skipped) });
  if (r.identicalRows.length)
    items.push({
      mark: "warn",
      text: `${n(r.identicalRows.length, "row")} pasted twice, read once`,
      details: [`Line${r.identicalRows.length > 1 ? "s" : ""} ${r.identicalRows.join(", ")}`],
    });
  if (r.notes.length) items.push({ mark: "warn", text: "Extra columns ignored", details: lineList(r.notes) });

  items.push(
    r.partials.length
      ? {
          mark: "ok",
          text: `${n(r.partials.length, "partial exit")} merged · ${r.partials.map((p) => `${p.label}, ${p.parts.join(" + ")} contracts`).join(" · ")}`,
        }
      : { mark: "ok", text: "No partial exits to merge" },
  );
  if (r.scaleIns.length)
    items.push({
      mark: "ok",
      text: `${n(r.scaleIns.length, "scale-in")} merged · ${r.scaleIns.map((p) => `${p.label}, ${p.entries.join(" + ")} contracts`).join(" · ")}`,
    });

  items.push(
    r.signs.mismatches.length
      ? {
          mark: "warn",
          text: `Signs recomputed · ${n(r.signs.mismatches.length, "net")} off the prices`,
          details: r.signs.mismatches.map((m) => `Line ${m.line}: ${fmtMoney(m.pasted)} pasted, ${fmtMoney(m.computed)} from the prices`),
        }
      : { mark: "ok", text: "Signs recomputed from side and prices" },
  );

  const links =
    r.reentries || r.flips
      ? `${n(r.reentries, "re-entry", "re-entries")} and ${n(r.flips, "flip")} linked`
      : "No re-entries or flips to link";
  items.push({ mark: "ok", text: r.relinked.length ? `${links} · ${n(r.relinked.length, "stored trade")} relinked` : links });

  items.push(
    r.flash.length
      ? { mark: "ok", text: `${n(r.flash.length, "flash trade")} flagged · held ${r.flash.map((f) => fmtHoldShort(f.hold)).join(", ")}` }
      : { mark: "ok", text: "No flash trades" },
  );

  const noteDup = r.duplicates.filter((d) => d.note);
  items.push(
    r.duplicates.length
      ? {
          mark: noteDup.length ? "warn" : "ok",
          text: `${n(r.duplicates.length, "duplicate")} skipped · already imported`,
          details: noteDup.map((d) => `${d.label}: ${d.note}`),
        }
      : { mark: "ok", text: "0 duplicates" },
  );
  if (r.restopped.length) {
    const p = (v: number) => fmtValue(v, "pts", { signed: false });
    const avg = r.avgStop.before !== r.avgStop.after ? ` · loser average ${p(r.avgStop.before)} → ${p(r.avgStop.after)}` : "";
    items.push({ mark: "ok", text: `Stop and R updated on ${n(r.restopped.length, "stored trade")}${avg}` });
  }
  return items;
}

function csvChecks(r: ImportReport, fileName: string): Item[] {
  const c = r.csv;
  if (!c) return [];
  const items: Item[] = [{ mark: "warn", text: "Orders CSV · untested against a real Tradesea export" }];
  if (c.error) return [...items, { mark: "warn", text: c.error }];
  items.push({ mark: c.orders ? "ok" : "warn", text: `${n(c.orders, "order")} read from ${fileName}` });
  if (c.unreadable.length) items.push({ mark: "warn", text: `${n(c.unreadable.length, "line")} not read`, details: lineList(c.unreadable) });
  const stops = c.matches.filter((m) => m.stop);
  const targets = c.matches.filter((m) => m.target);
  if (!c.matches.length) items.push({ mark: "warn", text: "No stop or limit order matched a trade" });
  else
    items.push({
      mark: "ok",
      text: `Stops read for ${n(stops.length, "trade")}, targets for ${targets.length}`,
      details: c.matches.map(
        (m) =>
          `${m.label}: ${m.stop ? `stop ${fmtPrice(m.stop.price)} (${m.stop.status || "?"})` : "no stop"} · ${
            m.target ? `target ${fmtPrice(m.target.price)} (${m.target.status || "?"})` : "no target"
          }${m.applied.stop || m.applied.target ? "" : " · already there"}`,
      ),
    });
  if (c.keptManual.length) items.push({ mark: "ok", text: `Your typed stop or target kept on ${n(c.keptManual.length, "trade")}` });
  return items;
}

const PLACEHOLDER: Item[] = [
  { mark: "todo", text: "Rows read" },
  { mark: "todo", text: "Partial exits merged" },
  { mark: "todo", text: "Signs recomputed from side and prices" },
  { mark: "todo", text: "Re-entries and flips linked" },
  { mark: "todo", text: "Flash trades flagged" },
  { mark: "todo", text: "Duplicates skipped" },
];

function buttonLabel(r: ImportReport | null): string {
  if (!r) return "Import trades";
  const add = r.newTrades.length;
  const csv = r.csv ? r.csv.matches.filter((m) => m.applied.stop || m.applied.target).length : 0;
  if (add && csv) return `Import ${n(add, "trade")} · apply the CSV`;
  if (add) return `Import ${n(add, "trade")}`;
  if (csv) return `Apply CSV stops to ${n(csv, "trade")}`;
  if (r.willWrite) return "Update the stored trades";
  return "Nothing new to import";
}

export function ImportCard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("paste");
  const [paste, setPaste] = useState("");
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const hasInput = Boolean(paste.trim() || csv);

  // Live preview, 250 ms after the last change. Stale answers are dropped.
  useEffect(() => {
    if (!hasInput) {
      setReport(null);
      setError(null);
      setChecking(false);
      return;
    }
    const ctl = new AbortController();
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/import/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paste, csv: csv?.text ?? "" }),
          signal: ctl.signal,
        });
        const data = await res.json();
        if (ctl.signal.aborted) return;
        if (!res.ok) {
          setError(data.error ?? "The preview failed.");
          setReport(null);
        } else {
          setReport(data.report);
          setError(null);
        }
      } catch {
        if (!ctl.signal.aborted) setError("The local server did not answer. Is `next dev` running?");
      } finally {
        if (!ctl.signal.aborted) setChecking(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [paste, csv, hasInput]);

  const goTab = (t: Tab) => {
    if (t !== tab) swap(() => setTab(t));
  };

  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next: Tab = tab === "paste" ? "csv" : "paste";
    goTab(next);
    tabsRef.current?.querySelector<HTMLButtonElement>(`#tab-${next}`)?.focus();
  };

  async function loadCsv(file: File) {
    if (file.size > MAX_CSV) {
      setError("The CSV is over 2 MB: is it the day's orders?");
      return;
    }
    const text = await file.text();
    setDone(null);
    setCsv({ name: file.name, text });
    goTab("csv");
  }

  const onDrop = (e: DragEvent) => {
    const file = e.dataTransfer.files?.[0];
    setDragging(false);
    if (!file) return; // plain text dropped in the textarea: let the browser insert it
    e.preventDefault();
    if (/\.(csv|txt|tsv)$/i.test(file.name) || file.type.startsWith("text/")) void loadCsv(file);
    else setError(`${file.name} is not a CSV file.`);
  };
  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setDragging(true);
    }
  };

  async function runImport() {
    if (!report?.willWrite) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paste, csv: csv?.text ?? "", expect: report.summary }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.report) setReport(data.report);
        setError(data.error ?? "The import failed.");
        return;
      }
      const r: ImportReport = data.report;
      const what = r.summary || "The stored trades";
      setDone(`${what.charAt(0).toUpperCase()}${what.slice(1)} written to the trades file. Commit and push to publish.`);
      setPaste("");
      setCsv(null);
      setReport(null);
      if (fileRef.current) fileRef.current.value = "";
      swap(() => router.refresh());
    } catch {
      setError("The local server did not answer. Nothing was written.");
    } finally {
      setImporting(false);
    }
  }

  const items: Item[] = report
    ? [...(paste.trim() ? pasteChecks(report) : []), ...(csv ? csvChecks(report, csv.name) : [])]
    : PLACEHOLDER;
  // The list rises in again when the figures change, not on every keystroke.
  const signature = report
    ? `${report.rowsRead}|${report.newTrades.length}|${report.duplicates.length}|${report.unreadable.length}|${csv?.name ?? ""}`
    : "empty";

  return (
    <section className={s.card} aria-label="Import trades" onDragOver={onDragOver} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <div className={s.tabs} role="tablist" aria-label="Import method" ref={tabsRef} onKeyDown={onTabKey}>
        <button type="button" role="tab" id="tab-paste" aria-controls="panel-import" aria-selected={tab === "paste"} tabIndex={tab === "paste" ? 0 : -1} className={s.tab} onClick={() => goTab("paste")}>
          <span className={s.long}>Paste from Tradesea</span>
          <span className={s.short}>Paste</span>
        </button>
        <button type="button" role="tab" id="tab-csv" aria-controls="panel-import" aria-selected={tab === "csv"} tabIndex={tab === "csv" ? 0 : -1} className={s.tab} onClick={() => goTab("csv")}>
          <span className={s.long}>Upload today&rsquo;s orders · CSV</span>
          <span className={s.short}>Orders CSV</span>
          {csv && <span className={s.dot} aria-label="(file loaded)" />}
        </button>
        <button type="button" role="tab" aria-selected={false} aria-disabled="true" disabled className={`${s.tab} ${s.off}`} title="Only if Tradeify or Tradesea opens an API">
          <span className={s.long}>Auto-sync · not available yet</span>
          <span className={s.short}>Auto-sync · later</span>
        </button>
      </div>

      <div className={`${s.panel} ${dragging ? s.dragging : ""}`}>
        <div className={s.input}>
          <ViewTransition key={tab} name="import-panel" share="swap" default="none">
            <div id="panel-import" role="tabpanel" aria-labelledby={`tab-${tab}`} className={s.pane}>
              {tab === "paste" ? (
                <>
                  <label htmlFor="paste" className={`k ${s.label}`}>
                    Paste the Recent Trades table from Tradesea Compass
                  </label>
                  <textarea
                    id="paste"
                    className={s.textarea}
                    value={paste}
                    onChange={(e) => {
                      setDone(null);
                      setPaste(e.target.value);
                    }}
                    placeholder={EXAMPLE}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <p className={s.hint}>
                    Or drop the CSV exported from Orders › Export. It carries your stop and limit orders, so stop, target and R are read,
                    not estimated.{" "}
                    <button type="button" className={s.inline} onClick={() => goTab("csv")}>
                      Upload it →
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <span className={`k ${s.label}`}>The day&rsquo;s orders · Tradesea › Orders › Export</span>
                  <label className={`${s.drop} ${csv ? s.loaded : ""}`}>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,.tsv,.txt,text/csv"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void loadCsv(f);
                      }}
                    />
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />
                    </svg>
                    {csv ? (
                      <>
                        <span className={s.dropTitle}>{csv.name}</span>
                        <span className="mono pencil" style={{ fontSize: 11 }}>
                          {n(csv.text.split(/\r?\n/).filter((l) => l.trim()).length - 1, "line")} · choose another file
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={s.dropTitle}>Drop the CSV here, or choose the file</span>
                        <span className="mono pencil" style={{ fontSize: 11 }}>
                          CSV · stop and limit orders, even cancelled
                        </span>
                      </>
                    )}
                  </label>
                  {csv && (
                    <button type="button" className={s.inline} onClick={() => setCsv(null)}>
                      Remove the file
                    </button>
                  )}
                  <p className={s.untested}>
                    <strong>Untested.</strong> No real export was available when this import was built: the columns are guessed from
                    their names (symbol, side, type, qty, stop / limit price, status, time) and times without a zone are read as ET.
                    Check the stops in the list before importing.
                  </p>
                  {report?.csv && !report.csv.error && (
                    <p className={`mono ${s.columns}`}>
                      Columns found:{" "}
                      {Object.entries(report.csv.columns)
                        .map(([k, v]) => `${k} = “${v}”`)
                        .join(" · ") || "none"}
                    </p>
                  )}
                </>
              )}
            </div>
          </ViewTransition>
        </div>

        <div className={s.checks} aria-live="polite">
          <span className={`k ${s.label}`}>
            Before importing
            {checking && <span className={s.checking}> · checking…</span>}
          </span>
          {done && !hasInput ? (
            <p className={`${s.done} rise-in`} role="status">
              <b>✓</b>
              <span>{done}</span>
            </p>
          ) : (
            <ul key={signature} className={`${s.items} ${report ? "" : s.idle}`}>
              {items.map((it, i) => (
                <li key={i} className={`${s.item} ${report ? "rise-in" : ""}`} style={report ? { animationDelay: `${Math.min(i, 6) * 25}ms` } : undefined}>
                  <b className={s[it.mark]} aria-hidden="true">
                    {it.mark === "ok" ? "✓" : it.mark === "warn" ? "!" : "·"}
                  </b>
                  <span>
                    {it.text}
                    {it.details && it.details.length > 0 && (
                      <span className={s.details}>
                        {it.details.slice(0, 6).map((d) => (
                          <span key={d}>{d}</span>
                        ))}
                        {it.details.length > 6 && <span>…and {it.details.length - 6} more</span>}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className={`${s.error} fade-in`} role="alert">
              {error}
            </p>
          )}
          <button type="button" className={`btn ink ${s.go}`} disabled={!report?.willWrite || checking || importing} onClick={runImport}>
            {importing ? "Importing…" : buttonLabel(report)}
          </button>
        </div>
      </div>
    </section>
  );
}
