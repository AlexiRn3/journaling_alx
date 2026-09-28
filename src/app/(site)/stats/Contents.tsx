"use client";

// Contents of the Stats page.
// - Desktop (≥ 1024 px): a list stuck to the left; an ink marker slides to the section being read.
// - Below: a row of pills stuck under the top bar, scrolling sideways; the active pill stays in view.
// The section being read comes from an IntersectionObserver (a reading zone under the bars).
// A click scrolls smoothly to the section (instantly with reduced motion) and the marker goes
// straight there, without stepping through the sections in between.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import s from "./stats.module.css";

export const SECTIONS = [
  { id: "overview", num: "01", toc: "Overview", pill: "Overview" },
  { id: "equity", num: "02", toc: "Equity", pill: "Equity" },
  { id: "distribution", num: "03", toc: "Distribution", pill: "Distribution" },
  { id: "session", num: "04", toc: "By session", pill: "Session" },
  { id: "hour", num: "05", toc: "By hour", pill: "Hour" },
  { id: "weekday", num: "06", toc: "By weekday", pill: "Weekday" },
  { id: "side", num: "07", toc: "Long vs short", pill: "Long / short" },
  { id: "hold", num: "08", toc: "Hold time", pill: "Hold" },
  { id: "entry", num: "09", toc: "Entry type", pill: "Entry" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

const IDS = SECTIONS.map((x) => x.id) as SectionId[];
const LAST = IDS[IDS.length - 1];
const PILLS_H = 52; // height of the pill row below 1024 px

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Section being read. `narrow` = the pill row is showing (it covers 52 px more of the top).
 * Returns the active id and `go(id)`, which scrolls to a section.
 */
export function useScrollSpy(narrow: boolean) {
  const [spied, setSpied] = useState<SectionId>(IDS[0]);
  const [atEnd, setAtEnd] = useState(false);
  const [locked, setLocked] = useState<SectionId | null>(null);
  const lock = useRef<{ id: SectionId; settled: boolean } | null>(null);

  // Reading zone: from under the bars down to 35 % of the screen. The active section is the last
  // one inside it, i.e. the one whose heading most recently crossed that line.
  useEffect(() => {
    const els = IDS.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => e !== null);
    const inside = new Set<string>();
    const top = 56 + (narrow ? PILLS_H : 0) + 8;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inside.add(e.target.id);
          else inside.delete(e.target.id);
        }
        const last = [...IDS].reverse().find((id) => inside.has(id));
        if (last) setSpied(last);
      },
      { rootMargin: `-${top}px 0px -65% 0px` },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [narrow]);

  // The last sections are short and never reach the zone: at the very bottom, the last one wins.
  // Any scroll after a jump has settled hands control back to the spy.
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      setAtEnd(window.scrollY > 0 && window.innerHeight + window.scrollY >= doc.scrollHeight - 4);
      if (lock.current?.settled) {
        lock.current = null;
        setLocked(null);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const go = useCallback((id: SectionId) => {
    const el = document.getElementById(id);
    if (!el) return;
    const instant = reduced();
    const entry = { id, settled: false };
    lock.current = entry;
    setLocked(id);
    const settle = () => {
      if (lock.current === entry) entry.settled = true;
    };
    window.addEventListener("scrollend", settle, { once: true });
    window.setTimeout(settle, instant ? 60 : 1200); // browsers without scrollend
    el.scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "start" });
    try {
      window.history.replaceState(window.history.state, "", `#${id}`);
    } catch {
      /* ignore */
    }
  }, []);

  const active: SectionId = locked ?? (atEnd ? LAST : spied);
  return { active, go };
}

interface NavProps {
  active: SectionId;
  go: (id: SectionId) => void;
}

function onLink(go: (id: SectionId) => void, id: SectionId) {
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    go(id);
  };
}

/** Desktop contents, stuck to the left. */
export function Toc({ active, go }: NavProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const [ink, setInk] = useState<{ y: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const place = () => {
      const a = list.querySelector<HTMLAnchorElement>("a[aria-current]");
      if (a && a.offsetHeight) setInk({ y: a.offsetTop, h: a.offsetHeight });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(list);
    return () => ro.disconnect();
  }, [active]);

  return (
    <nav className={s.toc} aria-label="Sections">
      <ol ref={listRef} className={s.tocList}>
        {SECTIONS.map((x) => (
          <li key={x.id}>
            <a
              href={`#${x.id}`}
              className={s.tocLink}
              aria-current={x.id === active ? "location" : undefined}
              data-measured={ink ? "" : undefined}
              onClick={onLink(go, x.id)}
            >
              <b aria-hidden="true">{x.num}</b>
              {x.toc}
            </a>
          </li>
        ))}
        {ink && <li aria-hidden="true" className={s.tocInk} style={{ transform: `translateY(${ink.y}px)`, height: ink.h }} />}
      </ol>
    </nav>
  );
}

/** Tablet and mobile contents: pills under the top bar. */
export function Pills({ active, go }: NavProps) {
  const rowRef = useRef<HTMLOListElement>(null);
  const [ink, setInk] = useState<{ x: number; w: number } | null>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const place = () => {
      const pill = row.querySelector<HTMLElement>("a[aria-current] > span");
      if (!pill || !pill.offsetWidth) return;
      setInk({ x: pill.offsetLeft, w: pill.offsetWidth });
      // Keep the active pill in view, centred when possible (the row scrolls, not the page).
      const left = pill.offsetLeft - (row.clientWidth - pill.offsetWidth) / 2;
      row.scrollTo({ left: Math.max(0, left), behavior: first.current || reduced() ? "auto" : "smooth" });
      first.current = false;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(row);
    return () => ro.disconnect();
  }, [active]);

  return (
    <nav className={s.pills} aria-label="Sections">
      <ol ref={rowRef} className={s.pillRow}>
        {SECTIONS.map((x) => (
          <li key={x.id}>
            <a
              href={`#${x.id}`}
              className={s.pill}
              aria-current={x.id === active ? "location" : undefined}
              data-measured={ink ? "" : undefined}
              onClick={onLink(go, x.id)}
            >
              <span>{x.pill}</span>
            </a>
          </li>
        ))}
        {ink && <li aria-hidden="true" className={s.pillInk} style={{ transform: `translateX(${ink.x}px)`, width: ink.w }} />}
      </ol>
    </nav>
  );
}
