// User profile page.

import { h } from "../utils/dom.js";
import { api } from "../api.js";
import { formatCount, timeAgo } from "../utils/format.js";
import { PostCard } from "./post-card.js";

export async function UserPage({ name }) {
  const clean = String(name).replace(/^u\//, "");
  const u = await api.getUser(clean);
  if (!u) {
    return h(
      "div",
      { class: "empty-state" },
      h("div", { class: "empty-state__icon", html: "👻" }),
      h("h3", { class: "empty-state__title" }, `未找到用户 u/${clean}`),
      h("a", { class: "btn btn--secondary", href: "#/" }, "返回首页")
    );
  }

  const root = h("div", { class: "user-page" });

  // banner
  root.appendChild(
    h(
      "div",
      {
        class: "user-page__banner",
        style: { background: `linear-gradient(135deg, ${u.color || "#ff4500"} 0%, #1c1c1c 100%)` },
      }
    )
  );

  // head
  root.appendChild(
    h(
      "div",
      { class: "user-page__head" },
      h(
        "span",
        {
          class: "user-page__avatar",
          style: { background: u.color || "#ff4500" },
        },
        (u.name[0] || "U").toUpperCase()
      ),
      h(
        "div",
        { class: "user-page__heading" },
        h("h1", { class: "user-page__name" }, `u/${u.name}`),
        h("p", { class: "user-page__karma" }, `${formatCount(u.karma)} karma`)
      )
    )
  );

  // tabs
  const tabs = h("div", { class: "user-page__tabs" });
  for (const t of ["概览", "帖子", "评论", "已保存", "已隐藏", "已赞"]) {
    tabs.appendChild(
      h(
        "button",
        {
          class: "user-page__tab",
          type: "button",
          onClick: () => toast(`切换到「${t}」tab（mock）`, { kind: "info" }),
        },
        t
      )
    );
  }
  root.appendChild(tabs);

  // recent posts (filter mock posts that match the user)
  const allPosts = await api.listPosts({});
  const mine = allPosts.filter((p) => p.author === `u_${u.name}` || p.author === u.name);
  if (mine.length === 0) {
    root.appendChild(
      h(
        "div",
        { class: "empty-state" },
        h("div", { class: "empty-state__icon", html: "✍️" }),
        h("h3", { class: "empty-state__title" }, "暂无帖子"),
        h("p", { class: "empty-state__copy" }, "此用户还没有发过帖子。")
      )
    );
  } else {
    root.appendChild(h("h2", { class: "user-page__section" }, `最近的帖子 (${mine.length})`));
    for (const p of mine) {
      const sub = await api.getSubreddit(p.subreddit);
      root.appendChild(PostCard({ post: p, subreddit: sub }));
    }
  }

  return root;
}
