// Explore page (FSM: S_EXPLORE) — discovery / cross-community browse.
//
// v2.1.0: replaces the v2.0.0 toast stub. Shows a single scrolling feed
// mixed from many categories (not just one subreddit) plus category chips
// that act as quick filter buttons.

import { h, mount } from "../utils/dom.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { PostCard } from "./post-card.js";

const CATEGORY_BLURBS = {
  news:        "📰 资讯",
  gaming:      "🎮 游戏",
  pics:        "🖼️ 图片",
  funny:       "😂 搞笑",
  aww:         "🐶 可爱",
  tech:        "💻 科技",
  sports:      "🏀 体育",
  food:        "🍜 美食",
  art:         "🎨 艺术",
  music:       "🎵 音乐",
  science:     "🔬 科学",
  world:       "🌍 国际",
  history:     "📜 历史",
  ask:         "💬 问答",
};

export async function ExplorePage() {
  state.setSort("hot");

  const subs = await api.listSubreddits();
  const byCategory = {};
  for (const s of Array.isArray(subs) ? subs : []) {
    if (!byCategory[s.category]) byCategory[s.category] = [];
    byCategory[s.category].push(s);
  }

  // For the first 4 categories, pull the top posts and interleave them.
  const categories = Object.keys(byCategory).slice(0, 4);
  const subByName = Object.fromEntries(
    (Array.isArray(subs) ? subs : []).map((s) => [s.name, s])
  );
  const fetched = await Promise.all(
    categories.map((cat) =>
      Promise.all(
        byCategory[cat].slice(0, 3).map((s) =>
          api.listPosts({ subreddit: s.name, sort: "hot", limit: 2 }).catch(() => [])
        )
      ).then((arr) => ({ cat, posts: arr.flat() }))
    )
  );

  const root = h("div", { class: "explore-page" });
  mount(
    root,
    h(
      "header",
      { class: "explore-page__head" },
      h("h1", { class: "explore-page__title" }, "浏览"),
      h("p", { class: "explore-page__sub" }, "跨社区发现热门帖子。")
    )
  );

  // category chip row
  const chips = h(
    "nav",
    { class: "explore-page__chips" },
    h(
      "button",
      {
        class: ["explore-chip", "is-active"],
        type: "button",
        onClick: (e) => {
          document.querySelectorAll(".explore-chip").forEach((c) => c.classList.remove("is-active"));
          e.currentTarget.classList.add("is-active");
        },
      },
      "全部"
    ),
    ...categories.map((cat) =>
      h(
        "button",
        {
          class: "explore-chip",
          type: "button",
          onClick: (e) => {
            document.querySelectorAll(".explore-chip").forEach((c) => c.classList.remove("is-active"));
            e.currentTarget.classList.add("is-active");
            document
              .querySelectorAll(".explore-page__section")
              .forEach((sec) => (sec.style.display = sec.dataset.cat === cat ? "" : "none"));
          },
        },
        CATEGORY_BLURBS[cat] || cat
      )
    )
  );
  root.appendChild(chips);

  if (fetched.every((f) => f.posts.length === 0)) {
    root.appendChild(
      h(
        "div",
        { class: "empty-state" },
        h("div", { class: "empty-state__icon", html: "🔭" }),
        h("h3", { class: "empty-state__title" }, "暂无内容"),
        h("p", { class: "empty-state__copy" }, "暂时没有可推荐的帖子。" )
      )
    );
    return root;
  }

  for (const { cat, posts } of fetched) {
    if (posts.length === 0) continue;
    const section = h(
      "section",
      { class: "explore-page__section", "data-cat": cat },
      h(
        "h2",
        { class: "explore-page__section-title" },
        CATEGORY_BLURBS[cat] || cat
      ),
      h(
        "div",
        { class: "feed__list feed__list--card" },
        ...posts.map((p) => PostCard({ post: p, subreddit: subByName[p.subreddit] }))
      )
    );
    root.appendChild(section);
  }
  return root;
}
