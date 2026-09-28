import { fmtDate } from "@/lib/dates";
import type { Meta } from "@/lib/types";
import s from "./Footer.module.css";

export function Footer({ meta }: { meta: Meta }) {
  const year = meta.updated_at.slice(0, 4);
  return (
    <footer className={`wrap ${s.foot}`}>
      <div className={s.inner}>
        <span className={s.note}>Not financial advice. Past performance does not guarantee future results.</span>
        <span className={`mono ${s.src}`}>
          Data: {meta.source} · Updated {fmtDate(meta.updated_at)} · © {year} ALX
        </span>
      </div>
    </footer>
  );
}
