"use client";

// Edit one trade: imported data locked, screenshots, the 4-part write-up (Markdown, with a
// preview), risk (stop and target; risk and R recomputed live), classification, MAE / MFE and
// publication. Save sends only what changed; the server recomputes every derived field.

import { marked } from "marked";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { swap } from "@/components/site/transitions";
import { Seg } from "@/components/ui/Seg";
import { fmtDayMonth, fmtDayShort, fmtTime } from "@/lib/dates";
import { ENTRY_ICON, fmtGap, fmtMoney, fmtPrice, MINUS } from "@/lib/format";
import type { AdminTrade } from "@/lib/import/derive";
import type { AutoValues } from "@/lib/import/edit";
import type { EntryType, Result, Session, Side, Trade } from "@/lib/types";
import { ShotSlot } from "./ShotSlot";
import s from "./edit.module.css";

export interface LinkedInfo {
  id: number;
  side: Side;
  result: Result;
}

interface Props {
  trade: AdminTrade;
  auto: AutoValues;
  slug: string | null;
  linked: LinkedInfo | null;
  pointValue: number;
  avgStop: number;
  dataFile: string;
}

type Story = Trade["story"];
interface Form {
  story: Story;
  stop: string;
  target: string;
  mae: string;
  mfe: string;
  session: Session;
  entry_type: EntryType;
  result: Result;
  session_day: string;
  published: boolean;
}

const STORY: { key: keyof Story; label: string; placeholder: string }[] = [
  { key: "context", label: "Context", placeholder: "What the market was doing before the entry" },
  { key: "scenario", label: "Scenario", placeholder: "What you expected, and what would have proved you wrong" },
  { key: "why", label: "Why I took it", placeholder: "In general terms, never the exact entry rule" },
  { key: "management", label: "Management", placeholder: "How you handled it once in" },
];
const SESSIONS: Session[] = ["Asia", "London", "New York"];
const ENTRY: { v: EntryType; label: string }[] = [
  { v: "first", label: "First entry" },
  { v: "re-entry", label: "↻ Re-entry" },
  { v: "flip", label: "⇄ Flip" },
];
const RESULTS: { v: Result; label: string }[] = [
  { v: "win", label: "Win" },
  { v: "loss", label: "Loss" },
  { v: "be", label: "Break-even" },
];

const num = (v: number | null) => (v === null ? "" : String(v));
const price = (v: number | null | undefined) => (v === null || v === undefined ? "" : fmtPrice(v));

function toForm(t: AdminTrade): Form {
  return {
    story: { ...t.story },
    stop: price(t.stop.price),
    target: price(t.target?.price),
    mae: num(t.mae),
    mfe: num(t.mfe),
    session: t.session,
    entry_type: t.entry_type,
    result: t.result,
    session_day: t.session_day,
    published: t.published !== false,
  };
}

/** "30,801.25" → 30801.25; "" → null; junk → NaN. */
function parseNum(v: string): number | null {
  const t = v.trim().replace(/[,\s$]/g, "");
  if (!t) return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

const signed = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? MINUS : ""}${Math.abs(v).toFixed(d)}`;

type SaveState = "idle" | "saving" | "saved" | "error";

export function EditTrade({ trade: initial, auto: initialAuto, slug, linked, pointValue, avgStop: initialAvg, dataFile }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState<AdminTrade>(initial);
  const [auto, setAuto] = useState<AutoValues>(initialAuto);
  const [avgStop, setAvgStop] = useState(initialAvg);
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const [shots, setShots] = useState(initial.shots);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const baseline = useMemo(() => toForm(saved), [saved]);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (state === "saved" || state === "error") setState("idle");
  };
  const setStory = (k: keyof Story, v: string) => set("story", { ...form.story, [k]: v });

  const t = saved;
  const dir = t.side === "Long" ? 1 : -1;

  /* ---------------------------------------------------------- live risk */
  const stopInput = form.stop.trim();
  const stopParsed = parseNum(form.stop);
  const stopTyped = stopInput !== "" && stopInput !== baseline.stop;
  const stopError =
    stopTyped && (stopParsed === null || Number.isNaN(stopParsed))
      ? "Not a price."
      : stopTyped && stopParsed !== null && (t.entry - stopParsed) * dir <= 0
        ? `A ${t.side.toLowerCase()}'s stop sits ${dir > 0 ? "below" : "above"} the entry, ${fmtPrice(t.entry)}.`
        : null;
  const effStop: Trade["stop"] =
    stopInput === "" ? auto.stop : stopTyped && !stopError && stopParsed !== null ? { price: stopParsed, source: "manual" } : t.stop;
  const estimated = effStop.source === "estimated_avg_loser_distance";
  const distance = estimated ? avgStop : Math.abs(t.entry - effStop.price);
  const risk = distance * t.qty * pointValue;
  const r = risk > 0 ? t.net / risk : 0;

  const targetInput = form.target.trim();
  const targetParsed = parseNum(form.target);
  const targetTyped = targetInput !== "" && targetInput !== baseline.target;
  const targetError =
    targetTyped && (targetParsed === null || Number.isNaN(targetParsed))
      ? "Not a price."
      : targetTyped && targetParsed !== null && (targetParsed - t.entry) * dir <= 0
        ? `A ${t.side.toLowerCase()}'s target sits ${dir > 0 ? "above" : "below"} the entry, ${fmtPrice(t.entry)}.`
        : null;
  const effTarget: Trade["target"] =
    targetInput === "" ? auto.target : targetTyped && !targetError && targetParsed !== null ? { price: targetParsed, source: "manual" } : t.target;
  const plannedRR = effTarget && distance > 0 ? Math.abs(effTarget.price - t.entry) / distance : null;

  const numError = (v: string) => {
    const p = parseNum(v);
    return p !== null && Number.isNaN(p) ? "Points, a number." : null;
  };
  const maeError = numError(form.mae);
  const mfeError = numError(form.mfe);
  const invalid = Boolean(stopError || targetError || maeError || mfeError || !/^\d{4}-\d{2}-\d{2}$/.test(form.session_day));

  /* -------------------------------------------------------------- save */
  const save = useCallback(async () => {
    if (!dirty || invalid || state === "saving") return;
    const patch: Record<string, unknown> = {};
    if (JSON.stringify(form.story) !== JSON.stringify(baseline.story)) patch.story = form.story;
    for (const k of ["stop", "target", "mae", "mfe"] as const) {
      if (form[k].trim() !== baseline[k]) patch[k] = parseNum(form[k]);
    }
    for (const k of ["session", "entry_type", "result", "session_day", "published"] as const) {
      if (form[k] !== baseline[k]) patch[k] = form[k];
    }
    setState("saving");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/trades/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(data.error ?? "Saving failed.");
        return;
      }
      const next: AdminTrade = data.trade;
      setSaved(next);
      setAuto(data.auto);
      setAvgStop(data.avgStop);
      setForm(toForm(next));
      setShots(next.shots);
      setState("saved");
      const others: number[] = data.others ?? [];
      setMessage(others.length ? `Stop and R of ${others.length} other trade${others.length > 1 ? "s" : ""} updated as well.` : null);
      swap(() => router.refresh());
    } catch {
      setState("error");
      setMessage("The local server did not answer. Nothing was saved.");
    }
  }, [dirty, invalid, state, form, baseline, t.id, router]);

  // "Saved ✓" fades back to "Save".
  useEffect(() => {
    if (state !== "saved") return;
    const id = setTimeout(() => setState("idle"), 1800);
    return () => clearTimeout(id);
  }, [state]);

  // Cmd / Ctrl + S saves; leaving with unsaved changes asks first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [save, dirty]);

  const onShot = (slot: "before" | "after", path: string | null) => {
    setShots((x) => ({ ...x, [slot]: path }));
    setSaved((x) => ({ ...x, shots: { ...x.shots, [slot]: path } }));
    swap(() => router.refresh());
  };

  /* ------------------------------------------------------------ labels */
  const hasStory = Object.values(form.story).some((v) => v.trim());
  const full = Boolean(shots.before) && hasStory;
  const status = form.published ? `Published · ${full ? "full" : "short"} sheet` : "Hidden";
  const open = `${fmtDayMonth(t.open)}, ${fmtTime(t.open)} → ${t.close.slice(0, 10) !== t.open.slice(0, 10) ? `${fmtDayShort(t.close)} ` : ""}${fmtTime(t.close)} ET`;
  const typeLabel = t.entry_type === "first" ? "" : ` · ${ENTRY_ICON[t.entry_type]} ${t.entry_type === "flip" ? "flip" : "re-entry"}`;

  const linkLine = (() => {
    if (t.entry_type === "first" || !linked) return "First entry: no trade closed in the 2 minutes before.";
    const gap = t.gap_seconds !== null ? fmtGap(t.gap_seconds) : "";
    const what = `${linked.result === "loss" ? "a stopped " : "a "}${linked.side.toLowerCase()}`;
    return `${ENTRY_ICON[t.entry_type]} ${t.entry_type === "flip" ? "Flip" : "Re-entry"} · ${gap} after ${what}`;
  })();

  const stopHint = (() => {
    if (stopError) return null;
    if (stopInput === "") return `Automatic: ${fmtPrice(auto.stop.price)}, ${sourceText(auto.stop.source, avgStop, linked).toLowerCase()}`;
    if (stopTyped) return "Typed by you: risk and R below use it. Save to keep it.";
    switch (t.stop.source) {
      case "estimated_avg_loser_distance":
        return `Estimated from your stopped trades, ${avgStop.toFixed(2)} pts. Type the real one if you know it.`;
      case "manual":
        return `Typed by you. Clear the field to go back to the automatic stop, ${fmtPrice(auto.stop.price)}.`;
      case "csv":
        return `Read from the orders CSV. Clear the field to use the automatic stop, ${fmtPrice(auto.stop.price)}.`;
      default:
        return sourceText(t.stop.source, avgStop, linked);
    }
  })();

  const targetHint = (() => {
    if (targetError) return null;
    if (targetInput === "") return auto.target ? `Automatic: ${fmtPrice(auto.target.price)}, from the partial fill.` : "No target recorded. Type it if you had one.";
    if (targetTyped) return "Typed by you. Save to keep it.";
    if (!t.target) return "No target recorded. Type it if you had one.";
    if (t.target.source === "partial_fill") {
      const q = t.exits.filter((e) => e.price === t.target!.price).reduce((a, e) => a + e.qty, 0);
      return `Taken from the partial fill on ${q} contract${q > 1 ? "s" : ""}.`;
    }
    if (t.target.source === "csv") return "Read from the orders CSV.";
    return `Typed by you. Clear the field to go back to ${auto.target ? fmtPrice(auto.target.price) : "no target"}.`;
  })();

  const exitsText =
    t.exits.length > 1
      ? `Exits ${t.exits.map((e) => `${e.qty} @ ${fmtPrice(e.price)}`).join(" · ")}`
      : `Exit ${fmtPrice(t.exit)}`;
  const resultClass = t.result === "win" ? "g" : t.result === "loss" ? "l" : "be";
  const saveLabel = state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : "Save";

  return (
    <div className={s.page}>
      <Link href="/admin" className={s.back} transitionTypes={["nav-back"]}>
        ← All trades
      </Link>

      <header className={s.head}>
        <div className={s.headText}>
          <span className="k">
            {fmtDayShort(form.session_day)} session · {open}
            {typeLabel}
          </span>
          <h1 className={s.title}>
            {t.side} MNQ, {form.session} session
          </h1>
        </div>
        <span key={status} className={`${s.pill} ${form.published ? s.pub : ""} fade-in`}>
          {status}
        </span>
      </header>

      <div className={s.locked} aria-label="Imported data, read-only">
        <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true" className={s.lock}>
          <rect x="1" y="7" width="12" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M4 7V4.5a3 3 0 0 1 6 0V7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <span>Entry {fmtPrice(t.entry)}</span>
        <span>{exitsText}</span>
        <span>{t.qty} MNQ</span>
        <span>Fees {fmtMoney(t.fees, { signed: false })}</span>
        <span className={resultClass}>Net {fmtMoney(t.net)}</span>
        <span>{signed(t.points)} pts</span>
        <span className={s.from}>From Tradesea · read-only</span>
      </div>

      <div className={s.grid}>
        <div className={s.main}>
          <section className={s.section} aria-labelledby="shots-h">
            <h2 id="shots-h" className={s.h2}>
              Screenshots
            </h2>
            <div className={s.shots}>
              <ShotSlot tradeId={t.id} slot="before" label="Before · at entry" hint="PNG, JPEG or WebP · annotated" path={shots.before} onChange={(p) => onShot("before", p)} />
              <ShotSlot tradeId={t.id} slot="after" label="After · outcome" hint="Optional" path={shots.after} onChange={(p) => onShot("after", p)} />
            </div>
          </section>

          <section className={s.section} aria-labelledby="story-h">
            <div className={s.sectionHead}>
              <h2 id="story-h" className={s.h2}>
                Write-up
              </h2>
              <div className={s.mdSwitch}>
                <span className="mono pencil" style={{ fontSize: 11 }}>
                  Markdown · public
                </span>
                <Seg
                  label="Write-up view"
                  value={mode}
                  onChange={(v) => swap(() => setMode(v))}
                  options={[
                    { value: "write", label: "Write" },
                    { value: "preview", label: "Preview" },
                  ]}
                />
              </div>
            </div>
            {STORY.map((f) => (
              <div key={f.key} className={s.fld}>
                <label htmlFor={`story-${f.key}`} className={s.lbl}>
                  {f.label}
                </label>
                {mode === "write" ? (
                  <textarea
                    id={`story-${f.key}`}
                    className={s.ta}
                    value={form.story[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => setStory(f.key, e.target.value)}
                  />
                ) : form.story[f.key].trim() ? (
                  <div
                    id={`story-${f.key}`}
                    className={`${s.md} fade-in`}
                    dangerouslySetInnerHTML={{ __html: marked.parse(form.story[f.key], { async: false, gfm: true }) }}
                  />
                ) : (
                  <div id={`story-${f.key}`} className={`${s.md} ${s.mdEmpty} fade-in`}>
                    Empty: this part is left out of the public sheet.
                  </div>
                )}
              </div>
            ))}
            <span className={s.hint}>This text is public. Keep the exact entry criteria out of it.</span>
          </section>
        </div>

        <aside className={s.aside}>
          <section className={s.card} aria-labelledby="risk-h">
            <h2 id="risk-h" className={s.h3}>
              Risk
            </h2>
            <div className={s.fld}>
              <label htmlFor="stop" className={s.lbl}>
                Stop price
              </label>
              <input
                id="stop"
                className={`${s.in} ${!stopTyped && t.stop.source === "estimated_avg_loser_distance" && stopInput !== "" ? s.est : ""} ${stopError ? s.bad : ""}`}
                inputMode="decimal"
                autoComplete="off"
                value={form.stop}
                placeholder={`${fmtPrice(auto.stop.price)} (automatic)`}
                onChange={(e) => set("stop", e.target.value)}
                aria-invalid={Boolean(stopError)}
                aria-describedby="stop-hint"
              />
              <span id="stop-hint" className={stopError ? s.errText : s.hint}>
                {stopError ?? stopHint}
              </span>
            </div>
            <div className={s.fld}>
              <label htmlFor="target" className={s.lbl}>
                Target price
              </label>
              <input
                id="target"
                className={`${s.in} ${targetError ? s.bad : ""}`}
                inputMode="decimal"
                autoComplete="off"
                value={form.target}
                placeholder={auto.target ? `${fmtPrice(auto.target.price)} (automatic)` : "None"}
                onChange={(e) => set("target", e.target.value)}
                aria-invalid={Boolean(targetError)}
                aria-describedby="target-hint"
              />
              <span id="target-hint" className={targetError ? s.errText : s.hint}>
                {targetError ?? targetHint}
              </span>
            </div>
            <div className={s.kvs}>
              <div className={s.kv}>
                <span className="k">Risk</span>
                <span className="mono">
                  {estimated ? "~" : ""}
                  {fmtMoney(risk, { signed: false })}
                  <span className="pencil"> · {distance.toFixed(2)} pts</span>
                </span>
              </div>
              <div className={s.kv}>
                <span className="k">Result</span>
                <span className={`mono ${resultClass}`}>
                  {signed(r)} R{estimated ? " est." : ""}
                </span>
              </div>
              <div className={s.kv}>
                <span className="k">Planned reward : risk</span>
                <span className="mono">{plannedRR === null ? "–" : `${plannedRR.toFixed(1)} : 1${estimated ? " est." : ""}`}</span>
              </div>
            </div>
            <div className={s.pair}>
              <div className={s.fld}>
                <label htmlFor="mae" className={s.lbl}>
                  MAE · pts
                </label>
                <input id="mae" className={`${s.in} ${maeError ? s.bad : ""}`} inputMode="decimal" autoComplete="off" value={form.mae} placeholder="–" onChange={(e) => set("mae", e.target.value)} />
              </div>
              <div className={s.fld}>
                <label htmlFor="mfe" className={s.lbl}>
                  MFE · pts
                </label>
                <input id="mfe" className={`${s.in} ${mfeError ? s.bad : ""}`} inputMode="decimal" autoComplete="off" value={form.mfe} placeholder="–" onChange={(e) => set("mfe", e.target.value)} />
              </div>
            </div>
            <span className={maeError || mfeError ? s.errText : s.hint}>
              {maeError || mfeError ? "MAE and MFE are points, e.g. 6.5." : "Optional. Worst move against you and best move for you while in the trade."}
            </span>
          </section>

          <section className={s.card} aria-labelledby="class-h">
            <h2 id="class-h" className={s.h3}>
              Classification
            </h2>
            <div className={s.pair}>
              <div className={s.fld}>
                <label htmlFor="session" className={s.lbl}>
                  Session
                </label>
                <select id="session" className={s.in} value={form.session} onChange={(e) => set("session", e.target.value as Session)}>
                  {SESSIONS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                      {x === auto.session ? " (from entry time)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className={s.fld}>
                <label htmlFor="etype" className={s.lbl}>
                  Entry type
                </label>
                <select id="etype" className={s.in} value={form.entry_type} onChange={(e) => set("entry_type", e.target.value as EntryType)}>
                  {ENTRY.map((x) => (
                    <option key={x.v} value={x.v}>
                      {x.label}
                      {x.v === auto.entry_type ? " (auto)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className={s.fld}>
                <label htmlFor="result" className={s.lbl}>
                  Result
                </label>
                <select id="result" className={s.in} value={form.result} onChange={(e) => set("result", e.target.value as Result)}>
                  {RESULTS.map((x) => (
                    <option key={x.v} value={x.v}>
                      {x.label}
                      {x.v === auto.result ? " (from net)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className={s.fld}>
                <label htmlFor="day" className={s.lbl}>
                  Trading day
                </label>
                <input id="day" type="date" className={s.in} value={form.session_day} required onChange={(e) => set("session_day", e.target.value)} />
              </div>
            </div>
            <div className={s.kvs}>
              <div className={s.kv}>
                <span className="k">Link</span>
                <span className={`mono ${s.linkLine}`}>
                  {linked && t.entry_type !== "first" ? (
                    <Link href={`/admin/trades/${linked.id}`} className="plain blue" transitionTypes={["nav-back"]}>
                      {linkLine}
                    </Link>
                  ) : (
                    <span className="pencil">{linkLine}</span>
                  )}
                </span>
              </div>
              <div className={s.kv}>
                <span className="k">Computed</span>
                <span className="mono pencil" style={{ fontSize: 12 }}>
                  {auto.session} · {ENTRY.find((x) => x.v === auto.entry_type)?.label} · {RESULTS.find((x) => x.v === auto.result)?.label} · {fmtDayMonth(auto.session_day)}
                </span>
              </div>
            </div>
            <span className={s.hint}>A value you change here is kept when trades are imported again.</span>
          </section>

          <section className={s.card} aria-labelledby="pub-h">
            <h2 id="pub-h" className={s.h3}>
              Publishing
            </h2>
            <label className={s.check}>
              <input type="checkbox" checked={form.published} onChange={(e) => set("published", e.target.checked)} />
              <span>Published on the site</span>
            </label>
            <span className={s.hint}>
              {!form.published
                ? "Hidden: the trade leaves the journal, the stats and the equity curve."
                : full
                  ? "Full sheet: screenshot and write-up are in."
                  : "Short sheet for now. It becomes a full sheet as soon as a screenshot and the write-up are in."}
            </span>
            <div className={s.buttons}>
              {slug && saved.published !== false ? (
                <a className="btn plain" href={`/journal/${slug}`} target="_blank" rel="noopener" title={dirty ? "Shows the saved version" : undefined}>
                  Preview
                </a>
              ) : (
                <button type="button" className="btn" disabled title="Hidden trades have no public page">
                  Preview
                </button>
              )}
              <button
                type="button"
                className={`btn ink ${s.save} ${state === "saved" ? s.savedState : ""}`}
                disabled={(!dirty && state !== "saved") || invalid || state === "saving"}
                onClick={save}
                aria-live="polite"
              >
                <span key={saveLabel} className="fade-in">
                  {saveLabel}
                </span>
              </button>
            </div>
            {(dirty || message) && (
              <span className={`${state === "error" ? s.errText : s.hint} fade-in`}>
                {state === "error" ? message : dirty ? `Unsaved changes. Preview shows the saved version. Save writes ${dataFile}.` : message}
              </span>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function sourceText(source: Trade["stop"]["source"], avg: number, linked: LinkedInfo | null): string {
  switch (source) {
    case "exit_of_stopped_trade":
      return "This trade was stopped: its exit price is the stop.";
    case "previous_attempt_stop":
      return `Kept from the stopped attempt before it${linked ? ` (#${linked.id})` : ""}.`;
    case "estimated_avg_loser_distance":
      return `Estimated from your stopped trades, ${avg.toFixed(2)} pts.`;
    case "csv":
      return "Read from the orders CSV.";
    case "manual":
      return "Typed by you.";
  }
}
