"use client";

// Segmented control (unit, period, filters, journal views).
// The dark pill slides to the picked option; before hydration the pressed button is simply inked.

import { useLayoutEffect, useRef, useState } from "react";
import s from "./Seg.module.css";

export interface SegOption<T extends string> {
  value: T;
  label: React.ReactNode;
  title?: string;
}

interface Props<T extends string> {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string; // aria-label of the group
  size?: "sm" | "md" | "lg"; // 32 px (top bar), 40 px (filters), 44 px (view switch)
  stretch?: boolean; // full width, equal columns (mobile)
  className?: string;
}

export function Seg<T extends string>({ options, value, onChange, label, size = "sm", stretch = false, className = "" }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const btn = el.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      if (btn) setInd({ x: btn.offsetLeft, w: btn.offsetWidth });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, options.length]);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={`${s.seg} ${s[size]} ${stretch ? s.stretch : ""} ${ind ? s.measured : ""} ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => o.value !== value && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
      {/* After the buttons so `button:nth-child(n)` stays natural; z-index keeps it underneath. */}
      {ind && <span className={s.ind} style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} aria-hidden="true" />}
    </div>
  );
}
