"use client";

// Main menu, fixed to the bottom, full width (64 px). The ink line on top of the active tab
// glides to the new tab on navigation. Below 720 px: tab bar with icons, theme button moves up.

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import Link from "next/link";
import s from "./TabBar.module.css";

const TABS = [
  {
    href: "/",
    label: "Home",
    icon: <path d="M4 11l8-6 8 6v8h-5v-5h-6v5H4z" />,
  },
  {
    href: "/journal",
    label: "Journal",
    icon: (
      <>
        <rect x="5" y="4" width="14" height="16" rx="1.5" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
  },
  { href: "/stats", label: "Stats", icon: <path d="M5 19v-8M12 19V5M19 19v-6" /> },
  {
    href: "/strategy",
    label: "Strategy",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M14.5 9.5 13 13l-3.5 1.5L11 11z" />
      </>
    ),
  },
];

function activeIndex(pathname: string): number {
  if (pathname === "/") return 0;
  return TABS.findIndex((t, i) => i > 0 && pathname.startsWith(t.href));
}

export function TabBar() {
  const pathname = usePathname();
  const active = activeIndex(pathname);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const place = () => {
      const a = el.querySelectorAll<HTMLAnchorElement>("a")[active];
      setInk(a ? { x: a.offsetLeft, w: a.offsetWidth } : null);
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  return (
    <nav className={`${s.bar} site-tabbar`} aria-label="Main">
      {/* Desktop */}
      <div className={s.tabs} ref={tabsRef}>
        {ink && <span className={s.ink} style={{ transform: `translateX(${ink.x}px)`, width: ink.w }} aria-hidden="true" />}
        {TABS.map((t, i) => (
          <Link key={t.href} href={t.href} className={s.tab} aria-current={i === active ? "page" : undefined} data-measured={ink ? "" : undefined}>
            {t.label}
          </Link>
        ))}
      </div>
      <ThemeToggle className={s.theme} />

      {/* Mobile */}
      <div className={s.dock} style={{ "--i": active } as React.CSSProperties}>
        {active >= 0 && <span className={s.dockInk} aria-hidden="true" />}
        {TABS.map((t, i) => (
          <Link key={t.href} href={t.href} className={s.dockTab} aria-current={i === active ? "page" : undefined}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              {t.icon}
            </svg>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
