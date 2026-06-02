// Subreddit page — community info, rules, posts.

import { h, mount } from "../utils/dom.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { icon } from "../utils/icons.js";
import { formatCount, formatScore } from "../utils/format.js";
import { PostCard } from "./post-card.js";
import { toast } from "./toast.js";
import { dropdown } from "./dropdown.js";

function dateStr(iso) {
  if (!iso) return "未知";
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function CommunityInfoCard(sub) {
  const joined = state.isJoined(sub.name);

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
        toast(joined ? `已退出 ${sub.display}` : `已加入 ${sub.display}`, { kind: "success" });
      },
    },
    joined ? "✓ 已加入" : "加入"
  );

  // re-render join button on state change
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
          "aria-hidden": "true",
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
      h(
        "div",
        { class: "sub-info__stat" },
        h("strong", {}, formatCount(sub.weeklyVisitors || 0)),
        h("span", {}, "每周访客数")
      ),
      h(
        "div",
        { class: "sub-info__stat" },
        h("strong", {}, formatCount(sub.weeklyContributors || 0)),
        h("span", {}, "每周贡献数")
      ),
      h(
        "div",
        { class: "sub-info__stat" },
        h("strong", {}, formatCount(sub.members || 0)),
        h("span", {}, "成员数")
      )
    ),
    h(
      "div",
      { class: "sub-info__meta" },
      h(
        "div",
        { class: "sub-info__meta-row" },
        h("span", { html: icon("bell", { size: 14 }) }),
        h("span", {}, "创建于 " + dateStr(sub.createdAt))
      ),
      h(
        "div",
        { class: "sub-info__meta-row" },
        h("span", { html: icon("globe", { size: 14 }) }),
        h("span", {}, sub.type === "public" ? "公共" : sub.type === "restricted" ? "受限" : "私密")
      ),
      sub.category
        ? h(
            "div",
            { class: "sub-info__meta-row" },
            h("span", { html: icon("pin", { size: 14 }) }),
            h("span", {}, `分类：${sub.category}`)
          )
        : null
    )
  );
}

function RulesCard(rules) {
  if (!rules || rules.length === 0) {
    return h(
      "section",
      { class: "rail-card sub-rules" },
      h("h2", { class: "rail-card__title" }, "社区规则"),
      h("p", { class: "sub-rules__empty" }, "该社区尚未发布规则。")
    );
  }

  const list = h("ol", { class: "sub-rules__list" });
  for (const r of rules) {
    const head = h(
      "button",
      {
        class: "sub-rules__item",
        type: "button",
        "aria-expanded": "false",
        onClick: (e) => {
          const open = e.currentTarget.getAttribute("aria-expanded") === "true";
          e.currentTarget.setAttribute("aria-expanded", open ? "false" : "true");
          body.style.display = open ? "none" : "";
        },
      },
      h("span", { class: "sub-rules__n" }, r.n),
      h("h3", { class: "sub-rules__title" }, r.title),
      h("span", { class: "sub-rules__caret", html: icon("chevronDown", { size: 16 }) })
    );
    const body = h(
      "p",
      { class: "sub-rules__body", style: { display: "none" } },
      r.description
    );
    list.appendChild(h("li", { class: "sub-rules__row" }, head, body));
  }

  return h(
    "section",
    { class: "rail-card sub-rules" },
    h("h2", { class: "rail-card__title" }, `${rules[0].n ? "r/" : ""}社区规则`),
    list
  );
}

function SortPill({ value, options, onChange }) {
  const trigger = h(
    "button",
    {
      class: "sort-btn",
      type: "button",
    },
    h("span", { class: "sort-btn__label" }, "排序方式"),
    h("span", { class: "sort-btn__value" }, options.find((o) => o.value === value)?.label || value),
    h("span", { class: "sort-btn__caret", html: icon("chevronDown", { size: 16 }) })
  );
  dropdown(trigger, () => {
    const list = h("div", { class: "sort-list", role: "listbox" });
    for (const opt of options) {
      list.appendChild(
        h(
          "button",
          {
            class: ["sort-list__item", opt.value === value ? "is-active" : ""],
            role: "option",
            onClick: () => {
              onChange(opt.value);
              document.body.click();
            },
          },
          h("span", {}, opt.label),
          opt.value === value ? h("span", { class: "sort-list__check" }, "✓") : null
        )
      );
    }
    return list;
  });
  return trigger;
}

/**
 * @param {{ name: string }} params
 */
export async function SubredditPage({ name }) {
  const root = h("div", { class: "subreddit" });
  mount(root, h("p", { class: "rail-loading" }, "正在加载社区…"));

  const sub = await api.getSubreddit(name);
  if (!sub) {
    mount(
      root,
      h(
        "div",
        { class: "empty-state" },
        h("div", { class: "empty-state__icon", html: "🚫" }),
        h("h3", { class: "empty-state__title" }, "未找到此社区"),
        h("p", { class: "empty-state__copy" }, `r/${name} 不存在，或已被封禁。`),
        h("a", { class: "btn btn--secondary", href: "#/" }, "返回首页")
      )
    );
    return root;
  }

  const rules = await api.getRules(sub.name);

  // left column: feed
  const main = h("div", { class: "subreddit__main" });
  const subhead = h(
    "div",
    { class: "subreddit__subhead" },
    h("h2", { class: "subreddit__heading" }, "帖子"),
    h(
      "div",
      { class: "subreddit__sort" },
      SortPill({
        value: state.get().sort,
        options: [
          { value: "best",   label: "最佳" },
          { value: "hot",    label: "热门" },
          { value: "new",    label: "最新" },
          { value: "top",    label: "最热" },
          { value: "rising", label: "上升" },
        ],
        onChange: (v) => {
          state.setSort(v);
        },
      })
    )
  );
  main.appendChild(subhead);

  const list = h("div", { class: "feed__list feed__list--card" });
  main.appendChild(list);

  async function loadAndRender() {
    const posts = await api.listPosts({ subreddit: sub.name, sort: state.get().sort });
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
  await loadAndRender();
  state.subscribe(loadAndRender);

  // right column: info + rules
  const aside = h("aside", { class: "subreddit__aside" });
  aside.appendChild(CommunityInfoCard(sub));
  aside.appendChild(RulesCard(rules));

  mount(root, h("div", { class: "subreddit__body" }, main, aside));
  return root;
}
