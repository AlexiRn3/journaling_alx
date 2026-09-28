"use client";

import { useSyncExternalStore } from "react";

/** Live media query. False on the server and during hydration, then the real value. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Below 720 px: phone layout. */
export const PHONE = "(max-width: 719px)";
/** Below 960 px: no room for the side panel, the selected day opens in a sheet. */
export const NARROW = "(max-width: 959px)";

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
