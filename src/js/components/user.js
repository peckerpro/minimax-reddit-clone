// Placeholder. Filled in by v1.0.0.

import { h } from "../utils/dom.js";

export function UserPage({ name }) {
  return h(
    "div",
    { class: "empty-state" },
    h("div", { class: "empty-state__icon", html: "👤" }),
    h("h3", { class: "empty-state__title" }, `u/${name}`),
    h("p", { class: "empty-state__copy" }, "用户主页将显示头像、karma、帖子与评论。"),
    h("p", { class: "empty-state__copy" }, "v1.0.0 完善。"),
    h("a", { class: "btn btn--secondary", href: "#/" }, "返回首页")
  );
}
