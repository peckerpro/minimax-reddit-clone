// User profile — overview / posts / comments / saved / hidden tabs.
// v2.0.0: 6 time ranges, 2 sorts, 2 view modes, banner, follow button, block.

import { h, mount } from "../utils/dom.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { formatCount, timeAgo } from "../utils/format.js";
import { icon } from "../utils/icons.js";
import { PostCard } from "./post-card.js";
import { dropdown } from "./dropdown.js";

const SORTS = [
  { value: "hot",  label: "热门" },
  { value: "top",   label: "最受欢迎" },
  { value: "new",   label: "最新" },
  { value: "controversial", label: "争议" },
];
const TIMES = [
  { value: "now",   label: "现在" },
  { value: "today", label: "今天" },
  { value: "week",  label: "本周" },
  { value: "month", label: "本月" },
  { value: "year",  label: "今年" },
  { value: "all",   label: "所有时间" },
];
const TABS = [
  { value: "",          label: "概述" },
  { value: "/posts",    label: "帖子" },
  { value: "/comments", label: "评论" },
  { value: "/saved",    label: "已保存" },
  { value: "/hidden",   label: "已隐藏" },
  { value: "/upvoted",  label: "已赞" },
];

export async function UserPage({ name, tab = "" }) {
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

  const sort = state.get().sort === "top" || state.get().sort === "hot" || state.get().sort === "new" || state.get().sort === "controversial" ? state.get().sort : "hot";
  const t = state.get().timeRange;

  const allPosts = await api.listPosts({ author: clean, sort, t, limit: 50 });

  // route scoped list
  let list = allPosts;
  let emptyMessage = `${u.name} 还没有公开的帖子。`;
  if (tab === "/saved") {
    list = allPosts.filter((p) => state.isSaved(p.id));
    emptyMessage = "你还没有收藏任何帖子。";
  } else if (tab === "/hidden") {
    list = allPosts.filter((p) => state.isHidden(p.id));
    emptyMessage = "你还没有隐藏任何帖子。";
  } else if (tab === "/upvoted") {
    list = allPosts.filter((p) => state.getVote(p.id) === 1);
    emptyMessage = "你还没有赞过任何帖子。";
  } else if (tab === "/comments") {
    // no real comment mock data — show empty
    list = [];
    emptyMessage = `${u.name} 的评论列表暂未展示（mock 数据未覆盖）。`;
  }

  const me = state.get().user;
  const isMe = me && me.name === u.name;
  const following = state.isFollowing(u.name);

  return h(
    "div",
    { class: "user-page" },
    h("div", { class: "user-page__banner", style: { background: `linear-gradient(135deg, ${u.color || "#ff4500"} 0%, #1c1c1c 100%)` } }),

    h(
      "div",
      { class: "user-page__head" },
      h(
        "span",
        { class: "user-page__avatar", style: { background: u.color || "#ff4500" } },
        (u.name[0] || "U").toUpperCase()
      ),
      h(
        "div",
        { class: "user-page__heading" },
        h("h1", { class: "user-page__name" }, `u/${u.name}`),
        h("p", { class: "user-page__karma" }, `${formatCount(u.karma)} karma`)
      )
    ),

    h(
      "div",
      { class: "user-page__actions" },
      isMe
        ? h("a", { class: "btn btn--secondary", href: "#/settings" }, "编辑资料")
        : h(
            "button",
            {
              class: "btn btn--primary",
              type: "button",
              onClick: () => {
                if (!me) {
                  toast("登录后即可关注", { kind: "info" });
                  location.hash = "#/login?next=" + encodeURIComponent(location.hash || "#/");
                  return;
                }
                state.toggleFollow(u.name);
                toast(state.isFollowing(u.name) ? `已关注 u/${u.name}` : `已取消关注`, { kind: "success" });
              },
            },
            following ? "✓ 已关注" : "关注"
          ),
      !isMe
        ? h("a", { class: "btn btn--secondary", href: "#/message/compose?to=" + u.name }, "私信")
        : null,
      h(
        "button",
        {
          class: "btn btn--ghost",
          type: "button",
          onClick: () => {
            state.toggleBlockUser(u.name);
            toast(state.isUserBlocked(u.name) ? `已屏蔽 u/${u.name}` : `已取消屏蔽`, { kind: "info" });
          },
        },
        state.isUserBlocked(u.name) ? "取消屏蔽" : "屏蔽"
      )
    ),

    // tabs
    h(
      "nav",
      { class: "user-page__tabs" },
      ...TABS.map((t) =>
        h(
          "a",
          {
            class: ["user-page__tab", tab === t.value ? "is-active" : ""],
            href: `#/u/${u.name}${t.value}`,
          },
          t.label
        )
      )
    ),

    // sort + time + view
    h(
      "div",
      { class: "user-page__filters" },
      SortPill(sort, (v) => {
        state.setSort(v);
        location.hash = `#/u/${u.name}${tab}?sort=${v}&t=${state.get().timeRange}`;
      }),
      TimePill(t, (v) => {
        state.setTimeRange(v);
        location.hash = `#/u/${u.name}${tab}?sort=${sort}&t=${v}`;
      }),
      ViewPill()
    ),

    // content
    list.length === 0
      ? h(
          "div",
          { class: "empty-state" },
          h("div", { class: "empty-state__icon", html: "✍️" }),
          h("h3", { class: "empty-state__title" }, emptyMessage)
        )
      : h(
          "div",
          { class: "user-page__list" },
          ...list.map((p) =>
            PostCard({
              post: p,
              subreddit: {
                name: p.subreddit,
                display: `r/${p.subreddit}`,
                color: "#ff4500",
                iconText: p.subreddit[0].toUpperCase(),
              },
            })
          )
        )
  );
}

function SortPill(value, onChange) {
  const cur = SORTS.find((s) => s.value === value) || SORTS[0];
  const trigger = h("button", { class: "sort-btn", type: "button" },
    h("span", { class: "sort-btn__label" }, "排序"),
    h("span", { class: "sort-btn__value" }, cur.label),
    h("span", { class: "sort-btn__caret", html: icon("chevronDown", { size: 14 }) })
  );
  dropdown(trigger, () => h("div", { class: "dd__panel" },
    ...SORTS.map((o) =>
      h("button", {
        class: ["more-panel__item", o.value === value ? "is-active" : ""],
        onClick: () => { onChange(o.value); document.body.click(); },
      }, o.label)
    )
  ));
  return trigger;
}

function TimePill(value, onChange) {
  const cur = TIMES.find((t) => t.value === value) || TIMES[TIMES.length - 1];
  const trigger = h("button", { class: "sort-btn", type: "button" },
    h("span", { class: "sort-btn__label" }, "时间"),
    h("span", { class: "sort-btn__value" }, cur.label),
    h("span", { class: "sort-btn__caret", html: icon("chevronDown", { size: 14 }) })
  );
  dropdown(trigger, () => h("div", { class: "dd__panel" },
    ...TIMES.map((o) =>
      h("button", {
        class: ["more-panel__item", o.value === value ? "is-active" : ""],
        onClick: () => { onChange(o.value); document.body.click(); },
      }, o.label)
    )
  ));
  return trigger;
}

function ViewPill() {
  const trigger = h("button", { class: "sort-btn", type: "button" },
    h("span", { class: "sort-btn__label" }, "视图"),
    h("span", { class: "sort-btn__value" }, state.get().view === "card" ? "卡片" : "紧凑"),
    h("span", { class: "sort-btn__caret", html: icon("chevronDown", { size: 14 }) })
  );
  dropdown(trigger, () => h("div", { class: "dd__panel" },
    h("button", { class: "more-panel__item", onClick: () => { state.setView("card"); document.body.click(); } }, "卡片"),
    h("button", { class: "more-panel__item", onClick: () => { state.setView("compact"); document.body.click(); } }, "紧凑")
  ));
  return trigger;
}
