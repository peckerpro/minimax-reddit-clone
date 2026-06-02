// 404 page (and any other "no route matched" case).

import { h } from "../utils/dom.js";

export function NotFoundPage({ path }) {
  return h(
    "div",
    { class: "empty-state" },
    h("div", { class: "empty-state__icon", html: "🧭" }),
    h("h3", { class: "empty-state__title" }, "页面未找到"),
    h("p", { class: "empty-state__copy" }, `地址 ${path} 不存在。`),
    h(
      "div",
      { class: "empty-state__actions" },
      h("a", { class: "btn btn--secondary", href: "#/" }, "返回首页"),
      h("a", { class: "btn btn--primary", href: "#/communities" }, "浏览社区")
    )
  );
}
