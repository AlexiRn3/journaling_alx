// A figure in the chosen unit, with its sign and colour.
import { fmtValue, signClass, type ValueOpts } from "@/lib/format";
import type { Unit } from "@/lib/types";

interface Props extends ValueOpts {
  v: number;
  unit: Unit;
  /** Colour: from the sign (default), a fixed class (e.g. "be" for break-even trades), or none. */
  tone?: "auto" | "g" | "l" | "be" | "none";
  className?: string;
  style?: React.CSSProperties;
}

export function Val({ v, unit, tone = "auto", className = "", style, ...opts }: Props) {
  const cls = tone === "none" ? "" : tone === "auto" ? signClass(v) : tone;
  return (
    <span className={`mono ${cls} ${className}`} style={style}>
      {fmtValue(v, unit, opts)}
    </span>
  );
}
