"use client";

// Touch swipe on the page content: left → next trade, right → previous trade.
// The container gets `touch-action: pan-y pinch-zoom` (see .page in trade.module.css), so the browser
// keeps vertical scrolling and pinch-zoom for itself and hands us horizontal moves only.
// A swipe must be clearly horizontal (|dx| ≥ 64 px and ≥ 2 × |dy|) and quick (< 700 ms).
// Ignored inside horizontal scrollers ([data-noswipe]), dialogs, form fields, and while zoomed in.

import { useEffect, useRef, type RefObject } from "react";

interface Handlers {
  onNext: (() => void) | null;
  onPrev: (() => void) | null;
}

const MIN_DX = 64;
const MAX_MS = 700;

export function useSwipe(ref: RefObject<HTMLElement | null>, handlers: Handlers) {
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { x: number; y: number; t: number; id: number } | null = null;
    const vv = window.visualViewport;
    const zoomed = () => (vv ? vv.scale > 1.01 : false);

    // While zoomed in, give horizontal panning back to the browser.
    const syncZoom = () => {
      if (zoomed()) el.dataset.zoomed = "";
      else delete el.dataset.zoomed;
    };
    syncZoom();
    vv?.addEventListener("resize", syncZoom);

    const down = (e: PointerEvent) => {
      start = null;
      if (e.pointerType !== "touch" || !e.isPrimary || zoomed()) return;
      const target = e.target as Element | null;
      if (target?.closest("[data-noswipe], dialog, input, textarea, select")) return;
      start = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dt = e.timeStamp - start.t;
      start = null;
      if (Math.abs(dx) < MIN_DX || Math.abs(dx) < 2 * Math.abs(dy) || dt > MAX_MS) return;
      if (window.getSelection()?.toString()) return;
      const go = dx < 0 ? h.current.onNext : h.current.onPrev;
      go?.();
    };
    const cancel = () => {
      start = null;
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    return () => {
      vv?.removeEventListener("resize", syncZoom);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
    };
  }, [ref]);
}
