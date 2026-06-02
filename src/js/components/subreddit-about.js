// Subreddit "关于" sub-page (/r/:name/about).
// Shows full description, rules, related communities, contributors, mods,
// apps — extended info compared to the sidebar card on the feed.

import { h, mount } from "../utils/dom.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { formatCount } from "../utils/format.js";
import { icon } from "../utils/icons.js";
import { dropdown } from "./dropdown.js";
import { toast } from "./toast.js";
import { openModal } from "./modal.js";

export async function SubredditAboutPage({ name }) {
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
  const [rules, related, posts] = await Promise.all([
    api.getRules(sub.name),
    api.relatedSubreddits(sub.name, 6),
    api.listPosts({ subreddit: sub.name, limit: 5 }),
  ]);

  const joined = state.isJoined(sub.name);
  const notifyLevel = state.getNotifyLevel(sub.name);

  const JoinBtn = () => {
    const btn = h(
      "button",
      {
        class: ["btn", joined ? "btn--ghost" : "btn--primary"],
        type: "button",
        onClick: () => {
          if (!state.get().user) {
            toast("登录后即可加入社区", { kind: "info" });
            location.hash = "#/login?next=" + encodeURIComponent(location.hash || "#/");
            return;
          }
          state.toggleJoin(sub.name);
          toast(joined ? `已退出 ${sub.display}` : `已加入 ${sub.display}`, { kind: "success" });
        },
      },
      joined ? "✓ 已加入" : "加入"
    );
    state.subscribe((s) => {
      const j = s.joined.includes(sub.name);
      btn.textContent = j ? "✓ 已加入" : "加入";
      btn.classList.toggle("btn--primary", !j);
      btn.classList.toggle("btn--ghost", j);
    });
    return btn;
  };

  const NotifyBtn = () => {
    const trigger = h(
      "button",
      {
        class: "btn btn--ghost",
        type: "button",
        "aria-label": "通知设置",
      },
      h("span", { html: icon("bell", { size: 16 }) }),
      h("span", {}, "通知"),
      h("span", { html: icon("chevronDown", { size: 14 }) })
    );
    dropdown(trigger, () => {
      const opts = [
        { v: "all",    label: "所有帖子" },
        { v: "posts",  label: "仅精选" },
        { v: "none",   label: "不接收" },
      ];
      return h("div", { class: "dd__panel" },
        ...opts.map((o) =>
          h("button", {
            class: ["more-panel__item", notifyLevel === o.v ? "is-active" : ""],
            onClick: () => {
              state.setNotifyLevel(sub.name, o.v);
              toast(`通知设置：${o.label}`, { kind: "success" });
              document.body.click();
            },
          }, o.label)
        )
      );
    });
    return trigger;
  };

  const tabBar = h("div", { class: "subreddit__tabs" },
    h("a", { class: "subreddit__tab", href: `#/r/${sub.name}` }, "信息流"),
    h("a", { class: "subreddit__tab is-active", href: `#/r/${sub.name}/about` }, "关于")
  );

  const rulesList = h("ol", { class: "sub-rules__list" });
  for (const r of rules) {
    rulesList.appendChild(
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
          h("span", { class: "sub-rules__caret", html: icon("chevronDown", { size: 16 }) })
        ),
        h("p", { class: "sub-rules__body", style: { display: "none" } }, r.description)
      )
    );
  }

  const body = h("p", { class: "sub-rules__body", style: { display: "none" } });

  const relatedGrid = h("div", { class: "related-grid" });
  for (const r of related) {
    relatedGrid.appendChild(
      h(
        "a",
        { class: "related-card", href: `#/r/${r.name}` },
        h(
          "span",
          {
            class: "subicon subicon--md",
            style: { background: r.color || "#ff4500" },
            "aria-hidden": "true",
          },
          r.iconText || r.name[0].toUpperCase()
        ),
        h(
          "div",
          { class: "related-card__body" },
          h("h3", { class: "related-card__name" }, r.display),
          h("p", { class: "related-card__desc" }, r.description?.slice(0, 80) || ""),
          h("span", { class: "related-card__meta" }, `${formatCount(r.members)} 成员`)
        )
      )
    );
  }

  const mods = posts.slice(0, 5).map((p) => p.author);

  return h(
    "div",
    { class: "subreddit-about" },
    h(
      "div",
      { class: "subreddit-about__head" },
      h(
        "div",
        { class: "subreddit-about__hero" },
        h(
          "span",
          {
            class: "subicon subicon--xl",
            style: { background: sub.color || "#ff4500" },
            "aria-hidden": "true",
          },
          sub.iconText || sub.name[0].toUpperCase()
        ),
        h(
          "div",
          { class: "subreddit-about__heading" },
          h("h1", { class: "subreddit-about__name" }, sub.display),
          h("p", { class: "subreddit-about__handle" }, `r/${sub.name}`)
        )
      ),
      h("div", { class: "subreddit-about__actions" }, JoinBtn(), NotifyBtn())
    ),
    tabBar,
    h(
      "section",
      { class: "subreddit-about__section" },
      h("h2", {}, "描述"),
      h("p", { class: "subreddit-about__desc" }, sub.description)
    ),
    h(
      "section",
      { class: "subreddit-about__section" },
      h("h2", {}, `规则 (${rules.length})`),
      rulesList,
      rules.length === 0 ? h("p", {}, "该社区尚未发布规则。") : null
    ),
    h(
      "section",
      { class: "subreddit-about__section" },
      h("h2", {}, "相关社区"),
      related.length > 0 ? relatedGrid : h("p", {}, "暂无相关社区。")
    ),
    h(
      "section",
      { class: "subreddit-about__section" },
      h("h2", {}, "社区信息"),
      h(
        "ul",
        { class: "subreddit-about__facts" },
        h("li", {}, h("strong", {}, "创建于："), ` ${sub.createdAt}`),
        h("li", {}, h("strong", {}, "类型："), ` ${sub.type === "public" ? "公共" : "受限"}`),
        h("li", {}, h("strong", {}, "成员数："), ` ${formatCount(sub.members)}`),
        h("li", {}, h("strong", {}, "每周访客："), ` ${formatCount(sub.weeklyVisitors || 0)}`),
        h("li", {}, h("strong", {}, "每周贡献："), ` ${formatCount(sub.weeklyContributors || 0)}`),
        h("li", {}, h("strong", {}, "分类："), ` ${sub.category || "其他"}`)
      )
    )
  );
}
