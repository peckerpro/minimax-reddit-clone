import { h } from "../utils/dom.js";
export const ReportPage = () =>
  h(
    "div",
    { class: "empty-state" },
    h("div", { class: "empty-state__icon", html: "🚩" }),
    h("h3", { class: "empty-state__title" }, "举报"),
    h("p", { class: "empty-state__copy" }, "v0.6.0 will add a real report dialog.")
  );
