// Small building blocks of the Home page.
import Link from "next/link";
import type { ReactNode } from "react";
import { fmtValue, signClass } from "@/lib/format";
import type { Unit } from "@/lib/types";
import s from "./home.module.css";

/**
 * A signed value in a unit, coloured by its sign. "est." is set smaller so long R figures
 * ("+12.50 R est.") keep the width of the other units.
 */
export function Num({
  v,
  unit,
  est = false,
  tone,
  className = "",
}: {
  v: number;
  unit: Unit;
  est?: boolean;
  tone?: "g" | "l" | "be";
  className?: string;
}) {
  return (
    <span className={`mono ${tone ?? signClass(v)} ${className}`}>
      {fmtValue(v, unit)}
      {est && <span className={s.est}> est.</span>}
    </span>
  );
}

/** "View the journal →": underlined text link whose arrow nudges on hover. 44 px tall on touch screens. */
export function More({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`plain ${s.more} ${className}`}>
      <span className={s.moreText}>
        {children}{" "}
        <span className={s.arrow} aria-hidden="true">
          →
        </span>
      </span>
    </Link>
  );
}
