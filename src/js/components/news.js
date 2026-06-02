// News page (FSM: S_NEWS) — top-level news feed.
//
// v2.1.0: replaces the v2.0.0 toast stub. Re-uses the Feed component but
// filters the post list down to the "news" category (subreddits tagged
// `news` in subreddits.json). Sorts by `new` so the page reads as a wire.

import { h, mount } from "../utils/dom.js";
import { api } from "../api.js";
import { Feed } from "./feed.js";
import { state } from "../state.js";

export async function NewsPage() {
  state.setSort("new");

  // Pull all subreddits, keep those in the "news" category, collect names.
  const all = await api.listSubreddits();
  const newsSubs = new Set(
    (Array.isArray(all) ? all : []).filter((s) => s.category === "news").map((s) => s.name)
  );

  // Fetch the post lists for each news subreddit in parallel and concatenate.
  // Posts are already sorted `new` by api.listPosts({ sort: "new" }).
  const lists = await Promise.all(
    Array.from(newsSubs).map((name) => api.listPosts({ subreddit: name, sort: "new" }).catch(() => []))
  );
  const flat = lists.flat();
  flat.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const root = h("div", { class: "news-page" });
  mount(
    root,
    h(
      "header",
      { class: "news-page__head" },
      h("h1", { class: "news-page__title" }, "资讯"),
      h(
        "p",
        { class: "news-page__sub" },
        `来自 ${newsSubs.size} 个新闻社区的最新 ${flat.length} 条帖子。`
      )
    )
  );
  if (flat.length === 0) {
    mount(
      root,
      h(
        "div",
        { class: "empty-state" },
        h("div", { class: "empty-state__icon", html: "📰" }),
        h("h3", { class: "empty-state__title" }, "暂无资讯"),
        h("p", { class: "empty-state__copy" }, "RSS 还没拉回来。")
      )
    );
  } else {
    // Reuse Feed layout so cards, vote, actions behave identically.
    const list = h("div", { class: "feed__list feed__list--card" });
    // Feed exports a `Feed(opts)` returning a node; we render the same
    // PostCard stream by hand to skip the Feed's own loading state.
    const { PostCard } = await import("./post-card.js");
    const { getSubreddit } = api;
    const subs = {};
    for (const s of newsSubs) subs[s] = await getSubreddit(s).catch(() => null);
    for (const p of flat) list.appendChild(PostCard({ post: p, subreddit: subs[p.subreddit] }));
    root.appendChild(list);
  }
  return root;
}
