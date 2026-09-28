"use client";

// Journal filters: labelled rows on desktop, a "Filters · N" button and a bottom sheet on phones.
import { Seg } from "@/components/ui/Seg";
import { FILTER_GROUPS, NO_FILTERS, activeFilters, plural, type Filters } from "./lib";
import { Sheet } from "./Sheet";
import s from "./Journal.module.css";

interface Props {
  filters: Filters;
  onChange: (next: Filters) => void;
}

export function FilterRows({ filters, onChange }: Props) {
  return (
    <div className={s.filters} role="group" aria-label="Filters">
      {FILTER_GROUPS.map((g) => (
        <div key={g.key} className={s.flt}>
          <span className="k" aria-hidden="true">
            {g.label}
          </span>
          <Seg
            size="md"
            label={g.label}
            options={g.options}
            value={filters[g.key]}
            onChange={(v) => onChange({ ...filters, [g.key]: v })}
            className={s.fseg}
          />
        </div>
      ))}
    </div>
  );
}

export function FilterButton({ filters, onOpen }: { filters: Filters; onOpen: () => void }) {
  const n = activeFilters(filters);
  return (
    <button
      type="button"
      className={`mono press ${s.filterBtn} ${n ? s.filterOn : ""}`}
      aria-haspopup="dialog"
      aria-label={n ? `Filters, ${n} active` : "Filters, none active"}
      onClick={onOpen}
    >
      Filters · {n}
    </button>
  );
}

export function FilterSheet({
  open,
  onClose,
  filters,
  onChange,
  count,
}: Props & { open: boolean; onClose: () => void; count: number }) {
  const n = activeFilters(filters);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filters"
      aside={<span className={`mono ${s.sheetCount}`}>{n ? `${n} active` : "none active"}</span>}
    >
      <div className={s.sheetGroups}>
        {FILTER_GROUPS.map((g) => (
          <div key={g.key} className={s.sheetGroup}>
            <span className="k" aria-hidden="true">
              {g.label}
            </span>
            <Seg
              size="lg"
              stretch
              label={g.label}
              options={g.options}
              value={filters[g.key]}
              onChange={(v) => onChange({ ...filters, [g.key]: v })}
            />
          </div>
        ))}
      </div>
      <div className={s.sheetActions}>
        <button type="button" className="btn" disabled={!n} onClick={() => onChange(NO_FILTERS)}>
          Clear
        </button>
        <button type="button" className="btn ink" onClick={onClose}>
          {count ? `Show ${plural(count, "trade")}` : "No trades match"}
        </button>
      </div>
    </Sheet>
  );
}
