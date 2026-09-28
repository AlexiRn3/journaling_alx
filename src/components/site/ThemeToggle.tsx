"use client";

import { themeFade } from "./transitions";

const KEY = "alx:theme";

function current(): "light" | "dark" {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return "dark";
  if (root.classList.contains("light")) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Moon in the light theme, sun in the dark one. The icon is picked by CSS, so it never flashes. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const toggle = () => {
    const next = current() === "dark" ? "light" : "dark";
    themeFade(() => {
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {}
    });
  };
  return (
    <button type="button" className={`ib ${className}`} aria-label="Switch theme" onClick={toggle}>
      <span className="when-dark">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </span>
      <span className="when-light">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
        </svg>
      </span>
    </button>
  );
}

/** Inline script for <head>: applies the stored theme before the first paint. */
export const themeScript = `try{var t=localStorage.getItem("${KEY}");if(t==="dark"||t==="light")document.documentElement.classList.add(t)}catch(e){}`;
