import { h } from "../utils/dom.js";
export const NotificationsPage = () =>
  h(
    "div",
    { class: "empty-state" },
    h("div", { class: "empty-state__icon", html: "🔔" }),
    h("h3", { class: "empty-state__title" }, "通知"),
    h("p", { class: "empty-state__copy" }, "暂无新通知。v0.6.0 将填入示例数据。")
  );
