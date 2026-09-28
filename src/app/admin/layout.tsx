// Admin shell: dark bar on top, no bottom menu. Local only: 404 in production unless ALX_ADMIN=1.
// There is no login: the bar says plainly where the admin writes.
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/site/Logo";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { adminEnabled, TRADES_FILE } from "@/lib/data";
import s from "./admin.module.css";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

function dataPath(): string {
  const rel = path.relative(process.cwd(), TRADES_FILE);
  return rel.startsWith("..") ? TRADES_FILE : rel;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!adminEnabled()) notFound();
  const file = dataPath();
  return (
    <>
      <header className={`${s.bar} site-bar`}>
        <div className={s.brand}>
          <Link href="/admin" className={`plain ${s.logo}`} aria-label="ALX admin, all trades">
            <Wordmark width={52} height={24} />
          </Link>
          <span className={`mono ${s.badge}`}>ADMIN</span>
        </div>
        <div className={s.right}>
          <span className={s.where} title={file}>
            Local admin · writes to {file}
          </span>
          <a href="/" target="_blank" rel="noopener" className={s.link}>
            View the site ↗
          </a>
          <ThemeToggle className={s.theme} />
        </div>
      </header>
      <main className={s.main}>{children}</main>
    </>
  );
}
