"use client";

// Motion for clicks and page changes, built on React's <ViewTransition> (native in Next 16).
//
// - <PageTransition> wraps the content of every page: on navigation the old page fades out
//   quickly and the new one rises in; the top bar and the bottom menu stay still.
// - swap(fn) runs a state change as a transition: the page cross-fades (unit, period, journal view…).
// - Links are plain next/link: navigations are transitions, so they animate on their own.
//   Use transitionTypes={["nav-forward"]} / {["nav-back"]} on "next / previous" links for a slide.
//
// Browsers without the View Transitions API, and reduced-motion visitors, get instant changes.
// CSS lives in app/globals.css (classes .page-in, .page-out, .swap, .nav-forward, .nav-back).

import { startTransition, ViewTransition, type ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-in" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-out" }}
      update="swap"
      default="none"
    >
      {children}
    </ViewTransition>
  );
}

/** Runs a state change as a transition, so the surrounding <ViewTransition> cross-fades it. */
export function swap(update: () => void): void {
  startTransition(update);
}

/** Theme switch: not React state, so it drives the View Transitions API directly (whole page fades). */
export function themeFade(update: () => void): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!("startViewTransition" in document) || reduce) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.vt = "theme";
  document.startViewTransition(update).finished.finally(() => {
    delete root.dataset.vt;
  });
}
