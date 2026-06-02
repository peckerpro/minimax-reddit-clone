import { h } from "../utils/dom.js";
export const PremiumPage = () =>
  h(
    "div",
    { class: "empty-state" },
    h("div", { class: "empty-state__icon", html: "💎" }),
    h("h3", { class: "empty-state__title" }, "Reddit Premium"),
    h("p", { class: "empty-state__copy" }, "v1.0.0 will add the premium checkout flow.")
  );
