"use client";

// "All trades": filter (to complete, published, hidden) and one row per trade with what its
// sheet still misses. Newest first.

import Link from "next/link";
import { useState } from "react";
import { swap } from "@/components/site/transitions";
import { Seg } from "@/components/ui/Seg";
import { fmtMoney, MINUS } from "@/lib/format";
import type { Result, Session, Side } from "@/lib/types";
import s from "./list.module.css";

export interface ListRow {
  id: number;
  opened: string; // "Sun 27 · 19:44"
  day: string; // session day, "Mon 28"
  session: Session;
  side: Side;
  qty: number;
  net: number;
  result: Result;
  r: number;
  published: boolean;
  full: boolean;
  missShots: boolean;
  missWriteup: boolean;
  stopEst: boolean;
}

type Filter = "todo" | "published" | "hidden";

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? MINUS : ""}${Math.abs(v).toFixed(2)}`;
const netClass = (r: Result) => (r === "win" ? "g" : r === "loss" ? "l" : "be");

const EMPTY: Record<Filter, string> = {
  todo: "Every trade has a full sheet: screenshot and write-up.",
  published: "No trade is published.",
  hidden: "No hidden trade. Uncheck “Published on the site” on a trade to hide it.",
};

export function TradeList({ rows }: { rows: ListRow[] }) {
  const [filter, setFilter] = useState<Filter>("todo");
  const todo = rows.filter((r) => !r.full);
  const published = rows.filter((r) => r.published);
  const hidden = rows.filter((r) => !r.published);
  const shown = filter === "todo" ? todo : filter === "published" ? published : hidden;

  return (
    <section className={s.list} aria-labelledby="all-trades">
      <div className={s.listHead}>
        <h2 id="all-trades" className={s.h2}>
          All trades
        </h2>
        <Seg<Filter>
          label="Filter trades"
          size="md"
          value={filter}
          onChange={(v) => swap(() => setFilter(v))}
          options={[
            { value: "todo", label: `To complete · ${todo.length}`, title: "Trades without a screenshot or a write-up" },
            { value: "published", label: `Published · ${published.length}` },
            { value: "hidden", label: `Hidden · ${hidden.length}` },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <p className={s.empty}>No trade yet. Paste the Recent Trades table above to import them.</p>
      ) : (
        <div className={s.table} role="table" aria-label="Trades">
          <div className={`${s.tr} ${s.th}`} role="row">
            <span role="columnheader">Opened (ET)</span>
            <span role="columnheader">Session</span>
            <span role="columnheader">Side</span>
            <span role="columnheader">Qty</span>
            <span role="columnheader">Net</span>
            <span role="columnheader">R</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Missing for a full sheet</span>
            <span role="columnheader" className="sr-only">
              Edit
            </span>
          </div>
          {shown.length === 0 && <p className={s.empty}>{EMPTY[filter]}</p>}
          {shown.map((r) => (
            <div key={r.id} className={s.tr} role="row">
              <span role="cell" className={s.opened}>
                {r.opened}
              </span>
              <span role="cell" className={s.day}>
                {r.day} <span className="pencil">· {r.session}</span>
              </span>
              <span role="cell" className={s.side}>
                {r.side}
              </span>
              <span role="cell" className={s.qty}>
                {r.qty}
                <span className={s.unitMobile}> MNQ</span>
              </span>
              <span role="cell" className={`${s.net} ${netClass(r.result)}`}>
                {r.result === "be" ? "BE " : ""}
                {fmtMoney(r.net)}
              </span>
              <span role="cell" className={s.r} title={r.stopEst ? "R on an estimated stop" : undefined}>
                {signed(r.r)}
                <span className={s.unitMobile}> R</span>
              </span>
              <span role="cell" className={s.status}>
                {r.published ? (
                  <span className={`${s.pill} ${s.pub}`}>Published · {r.full ? "full" : "short"}</span>
                ) : (
                  <span className={s.pill}>Hidden</span>
                )}
              </span>
              <span role="cell" className={s.miss}>
                {r.missShots && <span className={`${s.pill} ${s.missing}`}>screenshots</span>}
                {r.missWriteup && <span className={`${s.pill} ${s.missing}`}>write-up</span>}
                {r.stopEst && (
                  <span className={s.pill} title="Stop estimated from the average loser distance">
                    stop est.
                  </span>
                )}
              </span>
              <span role="cell" className={s.action}>
                <Link href={`/admin/trades/${r.id}`} aria-label={`Complete the trade of ${r.opened}`}>
                  {r.full ? "Edit" : "Complete"} →
                </Link>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
