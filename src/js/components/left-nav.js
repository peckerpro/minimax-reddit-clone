// Left navigation rail (272px wide, collapsible to 56px).
// Mirrors real Reddit 2026 structure:
//   - Top: 主页 / 受欢迎 / 资讯 / 游览 (4 primary nav items)
//   - 最近访问 (recently viewed, FIFO 10)
//   - 资源 (resources, external + internal)
//   - Reddit 最佳 (i18n links)
//   - 规则 (footer policies)
// State persisted to localStorage (leftNavCollapsed, recentlyViewed).

import { h, mount } from "../utils/dom.js";
import { state } from "../state.js";
import { timeAgo } from "../utils/format.js";
import { icon } from "../utils/icons.js";

const TOP_LINKS = [
  { value: "home",     label: "主页",   href: "#/",         icon: "home" },
  { value: "popular",  label: "受欢迎", href: "#/best/",    icon: "fire" },
  { value: "news",     label: "资讯",   href: "#/news",     icon: "globe" },
  { value: "explore",  label: "游览",   href: "#/explore",  icon: "compass" },
];

const RESOURCE_LINKS = [
  { label: "关于 Reddit",  href: "https://www.redditinc.com", target: "_blank" },
  { label: "广告",        href: "https://ads.reddit.com/register?utm_source=web3x_consumer&utm_name=left_nav_cta", target: "_blank" },
  { label: "开发者平台",  href: "https://developers.reddit.com/?utm_source=reddit&utm_medium=left_nav_resources", target: "_blank" },
  { label: "Reddit Pro",  href: "#/reddit-pro", sub: "测试版" },
  { label: "帮助",        href: "#/help/help" },
  { label: "博客",        href: "#/blog" },
  { label: "职业",        href: "#/jobs" },
  { label: "新闻",        href: "#/news" },
];

const POLICY_LINKS = [
  { label: "Reddit 规则",   href: "#/help/content-policy" },
  { label: "隐私政策",     href: "#/help/privacy-policy" },
  { label: "用户协议",     href: "#/help/user-agreement" },
  { label: "辅助功能",     href: "#/help/accessibility" },
];

const INTERNATIONAL_LINKS = [
  { label: "Reddit 最佳",                 href: "#/best/" },
  { label: "Reddit 最佳（葡萄牙语版）", href: "#/best/?lang=pt-BR" },
  { label: "Reddit 最佳（德语版）",     href: "#/best/?lang=de" },
];

const CATEGORY_ICONS = {
  r: "subreddit", u: "user", p: "post", c: "comment",
};

function NavIcon({ kind, label, color }) {
  const letter = (label || "?")[0]?.toUpperCase() || "?";
  if (kind === "r") {
    return h(
      "span",
      {
        class: "leftnav__icon subicon",
        style: { background: color || "#ff4500" },
      },
      letter
    );
  }
  if (kind === "u") {
    return h(
      "span",
      {
        class: "leftnav__icon leftnav__icon--user",
      },
      letter
    );
  }
  return h("span", { class: "leftnav__icon leftnav__icon--default", html: icon(CATEGORY_ICONS[kind] || "text", { size: 16 }) });
}

function NavLink({ href, label, sub, target, iconName, kind, color, onClick }) {
  const a = h(
    "a",
    {
      class: "leftnav__link",
      href,
      target: target || null,
      rel: target === "_blank" ? "noreferrer noopener" : null,
      onClick: onClick || null,
    },
    iconName ? h("span", { class: "leftnav__icon", html: icon(iconName, { size: 18 }) })
             : (kind ? NavIcon({ kind, label, color }) : null),
    h("span", { class: "leftnav__label" }, label),
    sub ? h("span", { class: "leftnav__sub" }, sub) : null
  );
  return a;
}

function Section({ title, children, defaultOpen = true, storageKey }) {
  const open = state.get()[storageKey] !== false; // default to open
  const head = h(
    "button",
    {
      class: "leftnav__section-head",
      type: "button",
      "aria-expanded": open ? "true" : "false",
      onClick: () => {
        const next = !open;
        state.set({ [storageKey]: next });
      },
    },
    h("span", { class: "leftnav__section-title" }, title),
    h("span", { class: "leftnav__section-caret", html: icon("chevronDown", { size: 14 }) })
  );
  const body = h("div", { class: "leftnav__section-body", style: { display: open ? "" : "none" } }, children);
  state.subscribe((s) => {
    const nowOpen = s[storageKey] !== false;
    if (nowOpen !== (head.getAttribute("aria-expanded") === "true")) {
      head.setAttribute("aria-expanded", nowOpen ? "true" : "false");
      body.style.display = nowOpen ? "" : "none";
    }
  });
  return h("div", { class: "leftnav__section" }, head, body);
}

function TopNav() {
  const user = state.get().user;
  return h(
    "div",
    { class: "leftnav__top" },
    ...TOP_LINKS.map((it) => NavLink(it)),
    user
      ? h("hr", { class: "leftnav__hr" })
      : null,
    user
      ? h(
          "a",
          {
            class: "leftnav__link leftnav__link--profile",
            href: `#/u/${user.name}`,
          },
          NavIcon({ kind: "u", label: user.name, color: user.color }),
          h(
            "div",
            { class: "leftnav__profile-text" },
            h("span", { class: "leftnav__label" }, user.name),
            h("span", { class: "leftnav__sub" }, `${(user.karma || 0).toLocaleString()} karma`)
          )
        )
      : null
  );
}

function RecentSection() {
  const list = h("ul", { class: "leftnav__list" });
  function render() {
    list.replaceChildren();
    const items = state.get().recentlyViewed;
    for (const e of items) {
      const href = e.kind === "r" ? `#/r/${e.ref}` : e.kind === "u" ? `#/u/${e.ref}` : "#/";
      list.appendChild(
        h(
          "li",
          {},
          NavLink({
            href,
            label: e.kind === "r" ? `r/${e.ref}` : e.kind === "u" ? `u/${e.ref}` : e.ref,
            kind: e.kind,
            color: "#ff4500",
          })
        )
      );
    }
    if (items.length === 0) {
      list.appendChild(
        h("li", { class: "leftnav__empty" }, "暂无最近访问")
      );
    }
  }
  render();
  state.subscribe(render);
  return Section({
    title: "最近访问",
    children: list,
    storageKey: "leftNavRecentOpen",
  });
}

function ResourcesSection() {
  return Section({
    title: "资源",
    children: h(
      "ul",
      { class: "leftnav__list" },
      ...RESOURCE_LINKS.map((it) => h("li", {}, NavLink(it)))
    ),
    storageKey: "leftNavResourcesOpen",
  });
}

function InternationalSection() {
  return Section({
    title: "Reddit 最佳",
    children: h(
      "ul",
      { class: "leftnav__list" },
      ...INTERNATIONAL_LINKS.map((it) => h("li", {}, NavLink(it)))
    ),
    storageKey: "leftNavInternationalOpen",
  });
}

function PolicySection() {
  return h(
    "div",
    { class: "leftnav__policies" },
    h("hr", { class: "leftnav__hr" }),
    h(
      "ul",
      { class: "leftnav__list leftnav__list--policies" },
      ...POLICY_LINKS.map((it) => h("li", {}, NavLink(it)))
    ),
    h(
      "p",
      { class: "leftnav__copyright" },
      "Reddit, Inc. © 2026。保留所有权利。"
    )
  );
}

function HamburgerButton() {
  return h(
    "button",
    {
      class: "leftnav__hamburger",
      type: "button",
      "aria-label": "展开导航",
      onClick: () => state.setLeftNavCollapsed(!state.get().leftNavCollapsed),
    },
    h("span", { class: "leftnav__hamburger-icon", html: icon("menu", { size: 18 }) })
  );
}

export function LeftNav() {
  const wrap = h("nav", { class: "leftnav", id: "left-sidebar-container", "aria-label": "主要" });

  function render() {
    const collapsed = state.get().leftNavCollapsed;
    wrap.classList.toggle("leftnav--collapsed", collapsed);
    if (collapsed) {
      mount(wrap, h(
        "div",
        { class: "leftnav__collapsed" },
        HamburgerButton(),
        ...TOP_LINKS.map((it) =>
          h(
            "a",
            { class: "leftnav__collapsed-link", href: it.href, "aria-label": it.label, title: it.label, html: icon(it.icon, { size: 20 }) }
          )
        )
      ));
    } else {
      mount(wrap, h(
        "div",
        { class: "leftnav__expanded" },
        h(
          "div",
          { class: "leftnav__head" },
          h(
            "a",
            { class: "leftnav__logo", href: "#/", "aria-label": "Reddit 主页" },
            h("span", { class: "leftnav__logo-text" }, "reddit")
          ),
          h(
            "button",
            {
              class: "leftnav__collapse-btn",
              type: "button",
              "aria-label": "折叠导航",
              onClick: () => state.setLeftNavCollapsed(true),
              html: icon("menu", { size: 18 }),
            }
          )
        ),
        TopNav(),
        h("hr", { class: "leftnav__hr" }),
        RecentSection(),
        h("hr", { class: "leftnav__hr" }),
        ResourcesSection(),
        h("hr", { class: "leftnav__hr" }),
        InternationalSection(),
        PolicySection()
      ));
    }
  }
  render();
  state.subscribe(render);
  return wrap;
}
