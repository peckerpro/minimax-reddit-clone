// Placeholder. Filled in by v0.5.0.

import { h } from "../utils/dom.js";
import { timeAgo } from "../utils/format.js";
import { api } from "../api.js";
import { Feed } from "./feed.js";

export async function SubredditPage({ name }) {
  const sub = await api.getSubreddit(name);
  if (!sub) {
    return h(
      "div",
      { class: "empty-state" },
      h("div", { class: "empty-state__icon", html: "🚫" }),
      h("h3", { class: "empty-state__title" }, "未找到此社区"),
      h("p", { class: "empty-state__copy" }, `r/${name} 不存在。`),
      h("a", { class: "btn btn--secondary", href: "#/" }, "返回首页")
    );
  }
  return h(
    "div",
    { class: "boot-screen" },
    h("h1", {}, sub.display),
    h("p", {}, sub.description),
    h("p", {}, `成员数: ${sub.members.toLocaleString()}`),
    h("p", {}, "v0.5.0 will add the full community info, rules, and post list.")
  );
}
