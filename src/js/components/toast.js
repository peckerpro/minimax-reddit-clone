// Toast notifications. Simple absolute-positioned container, top-right.

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";

const TOAST_LIFETIME_MS = 3200;

let host = null;

function ensureHost() {
  if (host) return host;
  host = h("div", { class: "toast-host", "aria-live": "polite", "aria-atomic": "true" });
  document.body.appendChild(host);
  return host;
}

/**
 * Show a toast. Variants: "info" | "success" | "warn" | "error".
 * @param {string} message
 * @param {Object} [opts]
 * @param {"info"|"success"|"warn"|"error"} [opts.kind]
 * @param {number} [opts.duration] ms
 */
export function toast(message, opts = {}) {
  const root = ensureHost();
  const kind = opts.kind || "info";
  const node = h(
    "div",
    { class: ["toast", `toast--${kind}`], role: "status" },
    h("span", { class: "toast__msg" }, message)
  );
  root.appendChild(node);
  // animate in next frame
  requestAnimationFrame(() => node.classList.add("toast--in"));
  const t = setTimeout(() => dismiss(node), opts.duration || TOAST_LIFETIME_MS);
  node.addEventListener("click", () => {
    clearTimeout(t);
    dismiss(node);
  });
  return () => dismiss(node);
}

function dismiss(node) {
  node.classList.remove("toast--in");
  node.classList.add("toast--out");
  setTimeout(() => node.remove(), 200);
}

export { icon }; // re-export so consumers can import everything from one place
