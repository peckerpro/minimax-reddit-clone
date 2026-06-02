// Modal primitive. Backdrop, focus trap, Esc / overlay click to close.

import { h, mount, trapFocus } from "../utils/dom.js";
import { icon } from "../utils/icons.js";

let activeModal = null;

function closeActive() {
  if (activeModal) {
    activeModal.close();
    activeModal = null;
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && activeModal) closeActive();
});

/**
 * @param {Object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.subtitle]
 * @param {string} [opts.size] "sm" | "md" | "lg"
 * @param {boolean} [opts.dismissable]
 * @param {Node} opts.body
 * @param {Node} [opts.footer]
 * @returns {{ close: () => void, root: HTMLElement }}
 */
export function openModal(opts) {
  if (activeModal) closeActive();
  const dismissable = opts.dismissable !== false;
  const size = opts.size || "md";

  const closeBtn = h(
    "button",
    {
      class: "icon-btn modal__close",
      type: "button",
      "aria-label": "关闭",
      onClick: close,
    },
    h("span", { class: "icon-btn__inner", html: icon("close", { size: 18 }) })
  );

  const head = h(
    "div",
    { class: "modal__head" },
    h(
      "div",
      { class: "modal__heading" },
      opts.title ? h("h2", { class: "modal__title" }, opts.title) : null,
      opts.subtitle ? h("p", { class: "modal__subtitle" }, opts.subtitle) : null
    ),
    closeBtn
  );

  const body = h("div", { class: "modal__body" }, opts.body);
  const footer = opts.footer ? h("div", { class: "modal__foot" }, opts.footer) : null;

  const panel = h(
    "div",
    {
      class: ["modal__panel", `modal__panel--${size}`].join(" "),
      role: "dialog",
      "aria-modal": "true",
      tabindex: "-1",
    },
    head,
    body,
    footer
  );

  const overlay = h("div", {
    class: "modal-overlay",
    onClick: dismissable ? close : undefined,
  });

  const root = h("div", { class: "modal" }, overlay, panel);
  document.body.appendChild(root);
  document.body.classList.add("body--no-scroll");

  requestAnimationFrame(() => {
    overlay.classList.add("modal-overlay--in");
    panel.classList.add("modal__panel--in");
  });

  const releaseFocus = trapFocus(panel);
  requestAnimationFrame(() => panel.focus());

  function close() {
    if (!root.parentNode) return;
    releaseFocus();
    overlay.classList.remove("modal-overlay--in");
    panel.classList.remove("modal__panel--in");
    document.body.classList.remove("body--no-scroll");
    setTimeout(() => {
      root.remove();
      if (activeModal?.root === root) activeModal = null;
    }, 180);
  }

  activeModal = { close, root };
  return { close, root };
}

export { closeActive as closeModal };
