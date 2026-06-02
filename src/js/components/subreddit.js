// Subreddit page — community feed with sort URL routing.
// URL: /r/:name (default best) | /r/:name/:sort | ?t=day
// Supports tabs: 信息流 / 关于 (后者跳到 subreddit-about).

import { h, mount } from "../utils/dom.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { icon } from "../utils/icons.js";
import { formatCount, formatScore } from "../utils/format.js";
import { PostCard } from "./post-card.js";
import { toast } from "./toast.js";
import { dropdown } from "./dropdown.js";

const SORT_OPTIONS = [
  { value: "best",   label: "最佳" },
  { value: "hot",    label: "热门" },
  { value: "new",    label: "最新" },
  { value: "top",    label: "最受欢迎" },
  { value: "rising", label: "热度增加" },
];

const TIME_OPTIONS = [
  { value: "all",   label: "所有时间" },
  { value: "hour",  label: "过去 1 小时" },
  { value: "day",   label: "今天" },
  { value: "week",  label: "本周" },
  { value: "month", label: "本月" },
  { value: "year",  label: "今年" },
];

export async function SubredditPage({ name, sort, timeRange }) {
  const sub = await api.getSubreddit(name);
  if (!sub) {
    return h(
      "div",
      { class: "empty-state" },
      h("div", { class: "empty-state__icon", html: "🚫" }),
      h("h3", { class: "empty-state__title" }, "未找到此社区"),
      h("p", { class: "empty-state__copy" }, `r/${name} 不存在，或已被封禁。`),
      h("a", { class: "btn btn--secondary", href: "#/" }, "返回首页")
    );
  }

  // sync state from URL
  const curSort = sort || state.get().sort || "best";
  const curT = timeRange || state.get().timeRange || "all";
  if (curSort !== state.get().sort) state.setSort(curSort);
  if (curT !== state.get().timeRange) state.setTimeRange(curT);

  const rules = await api.getRules(sub.name);
  const joined = state.isJoined(sub.name);

  // left: feed with sort + time
  const main = h("div", { class: "subreddit__main" });
  const subhead = h(
    "div",
    { class: "subreddit__subhead" },
    h("h2", { class: "subreddit__heading" }, "帖子"),
    h(
      "div",
      { class: "subreddit__sort" },
      SortPill(curSort, sub.name, (v) => {
        location.hash = `#/r/${sub.name}/${v}?t=${curT}`;
      }),
      curSort === "top"
        ? TimePill(curT, (v) => {
            location.hash = `#/r/${sub.name}/top?t=${v}`;
          })
        : null
    )
  );
  main.appendChild(subhead);

  const tabBar = h("div", { class: "subreddit__tabs" },
    h("a", { class: "subreddit__tab is-active", href: `#/r/${sub.name}` }, "信息流"),
    h("a", { class: "subreddit__tab", href: `#/r/${sub.name}/about` }, "关于")
  );
  main.appendChild(tabBar);

  const list = h("div", { class: "feed__list feed__list--card" });
  main.appendChild(list);

  async function load() {
    const posts = await api.listPosts({ subreddit: sub.name, sort: curSort, t: curT });
    list.replaceChildren();
    if (posts.length === 0) {
      list.appendChild(
        h(
          "div",
          { class: "empty-state" },
          h("div", { class: "empty-state__icon", html: "📭" }),
          h("h3", { class: "empty-state__title" }, `${sub.display} 暂无帖子`),
          h("p", { class: "empty-state__copy" }, "成为第一个发帖的人。"),
          h("a", { class: "btn btn--secondary", href: "#/submit" }, "创建帖子")
        )
      );
      return;
    }
    for (const p of posts) {
      list.appendChild(PostCard({ post: p, subreddit: sub }));
    }
  }
  await load();

  // right: community info + rules
  const aside = h("aside", { class: "subreddit__aside" });
  aside.appendChild(CommunityInfoCard(sub, joined, rules));

  return h(
    "div",
    { class: "subreddit__body" },
    main,
    aside
  );
}

function CommunityInfoCard(sub, joined, rules) {
  const joinBtn = h(
    "button",
    {
      class: ["btn", joined ? "btn--ghost" : "btn--primary", "sub-info__join"],
      type: "button",
      onClick: () => {
        if (!state.get().user) {
          toast("登录后即可加入社区", { kind: "info" });
          location.hash = "#/login?next=" + encodeURIComponent(location.hash || "#/");
          return;
        }
        state.toggleJoin(sub.name);
      },
    },
    joined ? "✓ 已加入" : "加入"
  );
  state.subscribe(() => {
    const j = state.isJoined(sub.name);
    joinBtn.textContent = j ? "✓ 已加入" : "加入";
    joinBtn.classList.toggle("btn--primary", !j);
    joinBtn.classList.toggle("btn--ghost", j);
  });

  return h(
    "section",
    { class: "rail-card sub-info" },
    h(
      "div",
      { class: "sub-info__head" },
      h(
        "span",
        {
          class: "subicon subicon--lg",
          style: { background: sub.color || "#ff4500" },
        },
        sub.iconText || sub.name[0]?.toUpperCase() || "?"
      ),
      h(
        "div",
        { class: "sub-info__heading" },
        h("h1", { class: "sub-info__name" }, sub.display),
        h("p", { class: "sub-info__handle" }, `r/${sub.name}`)
      ),
      joinBtn
    ),
    h("p", { class: "sub-info__desc" }, sub.description),
    h(
      "div",
      { class: "sub-info__stats" },
      h("div", { class: "sub-info__stat" }, h("strong", {}, formatCount(sub.weeklyVisitors || 0)), h("span", {}, "每周访客数")),
      h("div", { class: "sub-info__stat" }, h("strong", {}, formatCount(sub.weeklyContributors || 0)), h("span", {}, "每周贡献数")),
      h("div", { class: "sub-info__stat" }, h("strong", {}, formatCount(sub.members || 0)), h("span", {}, "成员数"))
    ),
    rules && rules.length > 0 ? h(
      "div",
      { class: "sub-info__rules" },
      h("h2", { class: "rail-card__title" }, `r/${sub.name} 规则`),
      h(
        "ol",
        { class: "sub-rules__list" },
        ...rules.slice(0, 9).map((r) =>
          h("li", { class: "sub-rules__row" },
            h(
              "button",
              {
                class: "sub-rules__item",
                type: "button",
                onClick: (e) => {
                  const open = e.currentTarget.getAttribute("aria-expanded") === "true";
                  e.currentTarget.setAttribute("aria-expanded", open ? "false" : "true");
                  body.style.display = open ? "none" : "";
                },
                "aria-expanded": "false",
              },
              h("span", { class: "sub-rules__n" }, r.n),
              h("h3", { class: "sub-rules__title" }, r.title),
              h("span", { class: "sub-rules__caret", html: icon("chevronDown", { size: 14 }) })
            ),
            h("p", { class: "sub-rules__body", style: { display: "none" } }, r.description)
          )
        )
      ),
      h("p", { style: { display: "none" } })
    ) : null
  );
}

function SortPill(value, subName, onChange) {
  const cur = SORT_OPTIONS.find((s) => s.value === value) || SORT_OPTIONS[0];
  const trigger = h("button", { class: "sort-btn", type: "button" },
    h("span", { class: "sort-btn__label" }, "排序"),
    h("span", { class: "sort-btn__value" }, cur.label),
    h("span", { class: "sort-btn__caret", html: icon("chevronDown", { size: 14 }) })
  );
  dropdown(trigger, () => h("div", { class: "dd__panel" },
    ...SORT_OPTIONS.map((o) =>
      h("button", {
        class: ["more-panel__item", o.value === value ? "is-active" : ""],
        onClick: () => { onChange(o.value); document.body.click(); },
      }, o.label)
    )
  ));
  return trigger;
}

function TimePill(value, onChange) {
  const cur = TIME_OPTIONS.find((t) => t.value === value) || TIME_OPTIONS[0];
  const trigger = h("button", { class: "sort-btn", type: "button" },
    h("span", { class: "sort-btn__label" }, "时间"),
    h("span", { class: "sort-btn__value" }, cur.label),
    h("span", { class: "sort-btn__caret", html: icon("chevronDown", { size: 14 }) })
  );
  dropdown(trigger, () => h("div", { class: "dd__panel" },
    ...TIME_OPTIONS.map((o) =>
      h("button", {
        class: ["more-panel__item", o.value === value ? "is-active" : ""],
        onClick: () => { onChange(o.value); document.body.click(); },
      }, o.label)
    )
  ));
  return trigger;
}
