// Right-rail sidebar. "热门社区" list + (in later versions) a footer card
// with community rules / preview.

import { h, mount } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { formatCount } from "../utils/format.js";
import { api } from "../api.js";
import { state } from "../state.js";

function SubredditIcon(sub, size = 32) {
  return h(
    "span",
    {
      class: "subicon",
      style: {
        background: sub.color || "#ff4500",
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${Math.max(10, Math.round(size * 0.42))}px`,
      },
      "aria-hidden": "true",
    },
    sub.iconText || sub.name[0]?.toUpperCase() || "?"
  );
}

function SubredditRow(sub) {
  return h(
    "a",
    {
      class: "pop-row",
      href: `#/r/${sub.name}`,
      "aria-label": `${sub.display}, ${formatCount(sub.members)} 位成员`,
    },
    SubredditIcon(sub, 32),
    h(
      "div",
      { class: "pop-row__text" },
      h("span", { class: "pop-row__name" }, sub.display),
      h("span", { class: "pop-row__meta" }, `${formatCount(sub.members)} 位成员`)
    )
  );
}

function PopularCommunitiesCard(subs) {
  const list = h("ul", { class: "pop-list" });
  for (const s of subs) list.appendChild(h("li", {}, SubredditRow(s)));

  return h(
    "section",
    { class: "rail-card", "aria-labelledby": "pop-h" },
    h("h2", { class: "rail-card__title", id: "pop-h" }, "热门社区"),
    list,
    h(
      "a",
      { class: "rail-card__more", href: "#/communities" },
      "查看更多内容"
    )
  );
}

function PremiumCard() {
  return h(
    "section",
    { class: "rail-card rail-card--premium" },
    h("h2", { class: "rail-card__title" }, "Reddit Premium"),
    h(
      "p",
      { class: "rail-card__copy" },
      "订阅 Reddit Premium 享受无广告体验、专属福利和应用图标。"
    ),
    h(
      "a",
      { class: "btn btn--secondary", href: "#/premium" },
      "立即试用"
    )
  );
}

/**
 * Build the sidebar for the home / subreddit pages.
 */
export async function Sidebar() {
  const root = h("div", { class: "sidebar" });
  mount(root, h("p", { class: "rail-loading" }, "正在加载社区…"));

  const subs = await api.popularSubreddits(5);
  mount(
    root,
    h(
      "div",
      { class: "sidebar__inner" },
      PopularCommunitiesCard(subs),
      PremiumCard()
    )
  );
  return root;
}
