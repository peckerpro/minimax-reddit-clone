// Back-to-top floating button — appears after scrolling 600px.

import { h } from "../utils/dom.js";

let host = null;
let btn = null;
let visible = false;

function ensure() {
  if (host) return host;
  host = h("div", { class: "to-top-host" });
  btn = h(
    "button",
    {
      class: "to-top",
      type: "button",
      "aria-label": "回到顶部",
      title: "回到顶部",
      onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }),
    },
    h("span", { class: "to-top__arrow", html: "↑" })
  );
  host.appendChild(btn);
  document.body.appendChild(host);

  window.addEventListener(
    "scroll",
    () => {
      const show = window.scrollY > 600;
      if (show !== visible) {
        visible = show;
        btn.classList.toggle("is-visible", visible);
      }
    },
    { passive: true }
  );
  return host;
}

export function initBackToTop() {
  ensure();
}
