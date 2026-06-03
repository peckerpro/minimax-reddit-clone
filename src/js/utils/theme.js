// src/js/utils/theme.js
// M7 — applies state.theme to <html data-theme="..."> so the CSS
// variable blocks in variables.css take effect. Subscribes to the
// state signal so changes are immediate (the header's theme toggle
// just calls state.setTheme, the rest is automatic).
//
// `state.theme` is "auto" | "light" | "dark":
//   - "auto"  → no data-theme attribute; the @media (prefers-color-scheme: dark)
//               block in variables.css drives the look
//   - "light" → data-theme="light"   (light tokens, regardless of OS setting)
//   - "dark"  → data-theme="dark"    (dark tokens, regardless of OS setting)

import { state } from "../state.js";

function resolveTheme(stored) {
  if (stored === "light" || stored === "dark") return stored;
  // "auto" — defer to the OS preference.
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme() {
  const theme = resolveTheme(state.get().theme);
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function startTheme() {
  applyTheme();
  // Re-apply on state change. (subscribe returns an unsubscribe fn
  // but we don't need to clean up on hot reload — leaks are tiny.)
  state.subscribe(applyTheme);
  // Also re-apply if the OS-level pref changes while we're in auto.
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", applyTheme);
  }
}
