import { h } from "../utils/dom.js";
export const CommunitiesPage = () =>
  h(
    "div",
    { class: "empty-state" },
    h("div", { class: "empty-state__icon", html: "🧭" }),
    h("h3", { class: "empty-state__title" }, "所有社区"),
    h("p", { class: "empty-state__copy" }, "v0.5.0 will list every community with filters and search.")
  );
