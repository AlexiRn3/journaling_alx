"use client";

// A TradingView screenshot of the trade. Click (or tap) opens it large in a modal <dialog>:
// it pops in, Escape, the close button or a click anywhere closes it with a short pop-out,
// and focus goes back to the screenshot.

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./trade.module.css";

interface Props {
  src: string;
  alt: string;
  /** Caption, e.g. "Before · 19:44 ET" */
  label: string;
  /** Desktop-only end of the caption, e.g. "what the market did next" */
  more?: string;
}

const CLOSE_MS = 160;

export function Shot({ src, alt, label, more }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const finish = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setClosing(false);
    setOpen(false);
    if (dialog.current?.open) dialog.current.close();
    trigger.current?.focus({ preventScroll: true });
  }, []);

  const close = useCallback(() => {
    if (!dialog.current?.open || timer.current !== null) return;
    setClosing(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer.current = window.setTimeout(finish, reduce ? 0 : CLOSE_MS);
  }, [finish]);

  const show = () => {
    const d = dialog.current;
    if (!d || d.open) return;
    setOpen(true);
    d.showModal();
  };

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  return (
    <figure className={s.fig}>
      <button
        ref={trigger}
        type="button"
        className={`shot ${s.shotBtn}`}
        onClick={show}
        aria-haspopup="dialog"
        aria-label={`${alt}. Enlarge`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" />
      </button>
      <figcaption className={s.cap}>
        <span className="k">
          {label}
          {more && <span className={s.desk}> · {more}</span>}
        </span>
        <span className={`mono ${s.hint}`}>
          <span className={s.desk}>Click to enlarge</span>
          <span className={s.mob}>Tap to enlarge</span>
        </span>
      </figcaption>

      <dialog
        ref={dialog}
        className={s.box}
        data-closing={closing ? "" : undefined}
        aria-label={label}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClose={() => {
          // Closed by the browser itself (e.g. a second Escape): keep the state in sync.
          if (open) finish();
        }}
        onClick={close}
      >
        <div className={s.panel}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {open && <img src={src} alt={alt} />}
          <div className={s.boxCap}>
            <span className="k">{label}</span>
            <span className={`mono ${s.hint} ${s.desk}`}>Esc to close</span>
          </div>
        </div>
        <button type="button" className={`ib ${s.boxClose}`} onClick={close} aria-label="Close" autoFocus>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </dialog>
    </figure>
  );
}
