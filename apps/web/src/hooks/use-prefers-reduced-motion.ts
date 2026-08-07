"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;
const getServerSnapshot = () => false;

/**
 * Tracks `prefers-reduced-motion: reduce`, live.
 *
 * `useSyncExternalStore` rather than the `useState` + `useEffect` shape in
 * `use-is-mobile` because callers read this inside event handlers that can fire
 * before an effect would have run, so the value has to be right on the first
 * client render. SSR assumes no-preference.
 */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
