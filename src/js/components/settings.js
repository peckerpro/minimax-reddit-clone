import { h } from "../utils/dom.js";
export const SettingsPage = () =>
  h(
    "div",
    { class: "empty-state" },
    h("div", { class: "empty-state__icon", html: "⚙️" }),
    h("h3", { class: "empty-state__title" }, "设置"),
    h("p", { class: "empty-state__copy" }, "v0.6.0 will add a real settings panel.")
  );
