// Strategy: a long read, no figures. Texts come from data/strategy.json; the ones still in
// [brackets] are placeholders the owner will write, shown as they are, in pencil.
import type { Metadata } from "next";
import Link from "next/link";
import { PageTransition } from "@/components/site/transitions";
import { loadStrategy } from "@/lib/data";
import { isPlaceholder } from "./text";
import s from "./strategy.module.css";

export const metadata: Metadata = {
  title: "How I trade",
  description: "The thinking behind the trades: the idea and the principles, without the exact entry rules.",
};

const ph = (text: string) => (isPlaceholder(text) ? s.ph : "");

export default function StrategyPage() {
  const st = loadStrategy();
  return (
    <PageTransition>
      <div className={`wrap ${s.page}`}>
        <section className={s.row} aria-labelledby="strategy-title">
          <p className={s.lab}>Strategy</p>
          <div className={s.intro}>
            <h1 id="strategy-title" className={s.title}>
              How I <em>trade</em>
            </h1>
            <p className="k">Method · {st.method}</p>
            <p className={`${s.lede} ${ph(st.intro)}`}>{st.intro}</p>
          </div>
        </section>

        <section className={s.row} aria-labelledby="strategy-idea">
          <h2 id="strategy-idea" className={s.lab}>
            01 · The idea
          </h2>
          <div className={s.idea}>
            {st.idea.map((p, i) => (
              <p key={i} className={`${s.para} ${ph(p)}`}>
                {p}
              </p>
            ))}
            <blockquote className={s.quote}>
              <p className={ph(st.highlight)}>{st.highlight}</p>
            </blockquote>
          </div>
        </section>

        <section className={s.row} aria-labelledby="strategy-principles">
          <h2 id="strategy-principles" className={s.lab}>
            02 · Principles
          </h2>
          <ol className={s.principles}>
            {st.principles.map((p, i) => (
              <li key={i} className={s.principle}>
                <span className={`mono ${s.no}`} aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className={`${s.pTitle} ${ph(p.title)}`}>{p.title}</h3>
                  <p className={`${s.pBody} ${ph(p.body)}`}>{p.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${s.row} ${s.rowNote}`} aria-labelledby="strategy-private">
          <h2 id="strategy-private" className={s.lab}>
            03 · Not on this page
          </h2>
          <div className={s.note}>
            <svg className={s.lock} viewBox="0 0 14 16" aria-hidden="true">
              <rect x="1" y="7" width="12" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M4 7V4.5a3 3 0 0 1 6 0V7" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <p className={ph(st.not_here)}>{st.not_here}</p>
          </div>
        </section>

        <nav className={`${s.row} ${s.rowNext}`} aria-label="Keep reading">
          <span aria-hidden="true" />
          <div className={s.buttons}>
            <Link href="/journal" className={`btn ink ${s.btn}`}>
              See it applied in the journal
            </Link>
            <Link href="/stats" className={`btn ${s.btn}`}>
              Statistics
            </Link>
          </div>
        </nav>
      </div>
    </PageTransition>
  );
}
