"use client";

// Building blocks of the Stats page: a numbered section (its bars grow once, the first time it
// scrolls into view), the empty-period note, and a media-query hook.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import s from "./stats.module.css";

/** True while the media query matches. False on the server and during hydration. */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Becomes true the first time the element enters the viewport, then stays true. */
function useSeenOnce(ref: React.RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

interface SectionProps {
  id: string;
  num: string;
  title: string;
  /** Shorter heading below 720 px ("Distribution"). */
  short?: string;
  /** Right-hand caption of the heading (hidden below 720 px). */
  caption?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Section({ id, num, title, short, caption, className = "", children }: SectionProps) {
  const ref = useRef<HTMLElement>(null);
  const seen = useSeenOnce(ref);
  return (
    <section id={id} ref={ref} data-seen={seen || undefined} aria-labelledby={`${id}-h`} className={`${s.sec} ${className}`}>
      <div className={s.sh}>
        <span className={s.num} aria-hidden="true">
          {num}
        </span>
        <h2 id={`${id}-h`}>
          {short ? (
            <>
              <span className={s.dOnly}>{title}</span>
              <span className={s.mOnly}>{short}</span>
            </>
          ) : (
            title
          )}
        </h2>
        {caption && <span className={`${s.cap} ${s.dOnly}`}>{caption}</span>}
      </div>
      {children}
    </section>
  );
}

export function Empty() {
  return <p className={s.empty}>No trades in this period.</p>;
}
