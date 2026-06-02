// Placeholder. Filled in by v1.0.0.

import { h } from "../utils/dom.js";
import { PostCard } from "./post-card.js";
import { api } from "../api.js";

export async function SearchPage({ q }) {
  if (!q) {
    return h(
      "div",
      { class: "empty-state" },
      h("div", { class: "empty-state__icon", html: "🔎" }),
      h("h3", { class: "empty-state__title" }, "输入关键词开始搜索"),
      h("p", { class: "empty-state__copy" }, "试试在顶部搜索框中输入。")
    );
  }

  const subs = await api.listSubreddits();
  const sub = subs.find((s) => s.name.toLowerCase() === q.toLowerCase());
  if (sub) {
    // jump to subreddit page
    location.hash = `#/r/${sub.name}`;
    return h("p", { class: "rail-loading" }, `正在跳转到 ${sub.display}…`);
  }

  const results = await api.searchPosts(q);
  const root = h("div", { class: "search-results" });
  root.appendChild(
    h("h2", { class: "search-results__title" }, `"${q}" 的搜索结果 (${results.length})`)
  );
  for (const p of results) {
    root.appendChild(
      PostCard({
        post: p,
        subreddit: {
          name: p.subreddit,
          display: `r/${p.subreddit}`,
          color: "#ff4500",
          iconText: p.subreddit[0].toUpperCase(),
        },
      })
    );
  }
  if (results.length === 0) {
    root.appendChild(
      h(
        "div",
        { class: "empty-state" },
        h("div", { class: "empty-state__icon", html: "🕳️" }),
        h("h3", { class: "empty-state__title" }, "没有找到匹配的帖子")
      )
    );
  }
  return root;
}
