"use client";

// Bottom sheet built on a modal <dialog>: it sits in the top layer (over the bottom menu),
// traps focus, closes on Escape, on a tap on the backdrop, on the close button or when dragged down.
// Opening slides it up (CSS, 240 ms); closing slides it down (Web Animations, 200 ms).

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { reducedMotion } from "./useMedia";
import s from "./Sheet.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Right side of the title row (e.g. the day's net). */
  aside?: ReactNode;
  /** Line under the title. */
  sub?: ReactNode;
  children: ReactNode;
  className?: string;
}

const EASE = "cubic-bezier(.2, 0, 0, 1)";
const OUT_MS = 200;

/** Stops the page from scrolling behind the sheet. Returns the undo. */
function lockScroll(): () => void {
  const html = document.documentElement;
  const prev = html.style.overflow;
  html.style.overflow = "hidden";
  return () => {
    html.style.overflow = prev;
  };
}

export function Sheet({ open, onClose, title, aside, sub, children, className = "" }: Props) {
  const id = useId();
  const dlg = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const unlock = useRef<(() => void) | null>(null);
  const closing = useRef(false);
  const drag = useRef<{ id: number; y0: number; t0: number; dy: number; v: number; active: boolean } | null>(null);
  const onCloseRef = useRef(onClose);
  const openRef = useRef(open);
  useEffect(() => {
    onCloseRef.current = onClose;
    openRef.current = open;
  });

  const release = useCallback(() => {
    unlock.current?.();
    unlock.current = null;
  }, []);

  const animateOut = useCallback(() => {
    const d = dlg.current;
    const p = panel.current;
    const b = back.current;
    if (!d || !p || !b || closing.current) return;
    closing.current = true;
    const from = drag.current?.dy ?? 0;
    drag.current = null;
    p.style.translate = "";
    p.style.transition = "";
    let anims: Animation[] = [];
    const finish = () => {
      closing.current = false;
      if (d.open) d.close();
      anims.forEach((a) => a.cancel());
      release();
    };
    if (reducedMotion()) {
      finish();
      return;
    }
    const opts: KeyframeAnimationOptions = { duration: OUT_MS, easing: EASE, fill: "forwards" };
    anims = [
      p.animate([{ transform: `translateY(${from}px)` }, { transform: "translateY(100%)" }], opts),
      b.animate([{ opacity: Number(getComputedStyle(b).opacity) }, { opacity: 0 }], opts),
    ];
    anims[0].finished.then(finish, finish);
  }, [release]);

  // Open and close follow the `open` prop.
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) {
      closing.current = false;
      d.showModal();
      // Focus the sheet itself: the title is read out, the close button is the next Tab stop.
      panel.current?.focus({ preventScroll: true });
      d.querySelector<HTMLElement>(`.${s.body}`)?.scrollTo(0, 0);
      unlock.current = lockScroll();
    } else if (!open && d.open) {
      animateOut();
    }
  }, [open, animateOut]);

  // Leaving the page with the sheet open: give the scroll back.
  useEffect(() => release, [release]);

  /* ---------------------------------------------------------------- drag */

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || closing.current) return;
    drag.current = { id: e.pointerId, y0: e.clientY, t0: e.timeStamp, dy: 0, v: 0, active: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = drag.current;
    const p = panel.current;
    if (!g || g.id !== e.pointerId || !p) return;
    const dy = Math.max(0, e.clientY - g.y0);
    if (!g.active) {
      if (dy < 6) return;
      // Past a few pixels it is a drag, not a tap: follow the finger.
      g.active = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      p.style.transition = "none";
    }
    const dt = Math.max(1, e.timeStamp - g.t0);
    g.v = (dy - g.dy) / dt;
    g.dy = dy;
    g.t0 = e.timeStamp;
    p.style.translate = `0 ${dy}px`;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = drag.current;
    const p = panel.current;
    if (!g || g.id !== e.pointerId || !p) return;
    if (!g.active) {
      drag.current = null;
      return;
    }
    const far = g.dy > Math.min(140, p.offsetHeight * 0.3);
    const fast = g.v > 0.5;
    if (far || fast) {
      onCloseRef.current();
      return;
    }
    // Not far enough: settle back.
    drag.current = null;
    p.style.transition = `translate ${OUT_MS}ms ${EASE}`;
    p.style.translate = "";
  };

  return (
    <dialog
      ref={dlg}
      className={`${s.dialog} ${className}`}
      aria-labelledby={`${id}-t`}
      onCancel={(e) => {
        e.preventDefault();
        onCloseRef.current();
      }}
      onClose={() => {
        // Closed by the browser itself (e.g. a second Escape): keep the state in step.
        release();
        if (openRef.current && !closing.current) onCloseRef.current();
      }}
    >
      <div ref={back} className={s.backdrop} onClick={() => onCloseRef.current()} aria-hidden="true" />
      <div ref={panel} className={s.panel} tabIndex={-1}>
        <div
          className={s.grab}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className={s.grip} aria-hidden="true" />
          <div className={s.head}>
            <h2 id={`${id}-t`} className={s.title}>
              {title}
            </h2>
            {aside}
            <button type="button" className={`ib ${s.close}`} aria-label="Close" onClick={() => onCloseRef.current()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {sub}
        </div>
        <div className={s.body}>{children}</div>
      </div>
    </dialog>
  );
}
