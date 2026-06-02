// Dropdown — generic popover anchored to a button trigger.
//
// Usage:
//   const trigger = h("button", ...);
//   dropdown(trigger, () => panelEl);   // panelEl is built on open
//   // trigger can then be placed anywhere in the DOM; opening it
//   // wraps the trigger in a `.dd` container and renders the panel
//   // as a sibling, positioned absolutely below the trigger.

import { h } from "../utils/dom.js";

let openInstance = null;

function closeOpenInstance() {
  if (openInstance) {
    openInstance.close();
    openInstance = null;
  }
}

document.addEventListener("click", (e) => {
  if (!openInstance) return;
  if (openInstance.contains(e.target)) return;
  closeOpenInstance();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeOpenInstance();
});

/**
 * @param {HTMLElement} trigger  the button that opens the menu on click
 * @param {() => HTMLElement} buildPanel  factory returning the panel element
 * @param {Object} [opts]
 * @param {"down"|"up"} [opts.align]
 */
export function dropdown(trigger, buildPanel, opts = {}) {
  trigger.classList.add("dd__trigger");
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");

  const wrap = h("div", { class: "dd" });

  // Wrap the trigger in `.dd` so the panel can be position-absolute
  // relative to the wrap. If the trigger is already in the DOM, replace it.
  if (trigger.parentNode) {
    trigger.parentNode.replaceChild(wrap, trigger);
  }
  wrap.appendChild(trigger);

  let panel = null;
  let mounted = false;

  function mount() {
    if (mounted) return;
    panel = buildPanel();
    panel.classList.add("dd__panel", `dd__panel--${opts.align || "down"}`);
    panel.setAttribute("role", "menu");
    wrap.appendChild(panel);
    mounted = true;
  }

  function open() {
    closeOpenInstance();
    mount();
    panel.classList.add("dd__panel--open");
    trigger.setAttribute("aria-expanded", "true");
    openInstance = api;

    // focus first menuitem for keyboard users
    requestAnimationFrame(() => {
      const first = panel.querySelector('[role="menuitem"], button, a');
      if (first) first.focus();
    });
  }

  function close() {
    if (!mounted) return;
    panel.classList.remove("dd__panel--open");
    trigger.setAttribute("aria-expanded", "false");
    if (openInstance === api) openInstance = null;
  }

  function toggle() {
    if (trigger.getAttribute("aria-expanded") === "true") close();
    else open();
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });

  // panel-internal clicks shouldn't bubble to the document handler
  // (we already wrapped in stopPropagation on trigger; do the same on panel
  // so menuitem clicks work normally).
  function propagateClicks(el) {
    el.addEventListener("click", (e) => e.stopPropagation());
  }

  const api = {
    open,
    close,
    toggle,
    contains(el) {
      return wrap.contains(el);
    },
    get root() { return wrap; },
  };
  return api;
}
