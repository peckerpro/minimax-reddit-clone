// Header — sticky top bar with hamburger, logo, search, login/user menu.

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { state } from "../state.js";
import { auth } from "../auth.js";
import { toast } from "./toast.js";
import { dropdown } from "./dropdown.js";

const SEARCH_PLACEHOLDER = "搜索 Reddit";

function Logo() {
  return h(
    "a",
    {
      class: "header__logo",
      href: "#/",
      "aria-label": "Reddit 主页",
    },
    h("span", { class: "header__logo-snoo", "aria-hidden": "true" },
      // minimal snoo face — orange circle + alien eyes
      h("span", { class: "snoo-face" })
    ),
    h("span", { class: "header__logo-text" }, "reddit")
  );
}

function HamburgerButton({ onOpen }) {
  return h(
    "button",
    {
      class: "icon-btn header__hamburger",
      type: "button",
      "aria-label": "打开菜单",
      onClick: () => onOpen?.(),
    },
    h("span", { class: "icon-btn__inner", html: icon("menu", { size: 20 }) })
  );
}

function SearchBox() {
  const form = h("form", { class: "header__search", role: "search" });
  const input = h("input", {
    class: "header__search-input",
    type: "search",
    placeholder: SEARCH_PLACEHOLDER,
    "aria-label": "搜索",
    autocomplete: "off",
  });
  form.appendChild(
    h("span", { class: "header__search-icon", html: icon("search", { size: 18 }) })
  );
  form.appendChild(input);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    location.hash = `#/search?q=${encodeURIComponent(q)}`;
  });
  return form;
}

function LoginButton() {
  const btn = h(
    "button",
    {
      class: "btn btn--primary header__login",
      type: "button",
      onClick: () => {
        location.hash = "#/login";
      },
    },
    "登录"
  );
  return btn;
}

function Avatar({ user, size = 32 }) {
  return h("span", {
    class: "avatar",
    style: { background: user.avatarColor || "#ff4500", width: `${size}px`, height: `${size}px` },
    "aria-hidden": "true",
  }, user.name?.[0]?.toUpperCase() || "U");
}

function UserMenuButton() {
  const user = state.get().user;
  if (!user) return LoginButton();
  const trigger = h(
    "button",
    {
      class: "header__usermenu",
      type: "button",
      "aria-label": "展开用户菜单",
    },
    Avatar({ user, size: 32 })
  );
  dropdown(trigger, () => UserMenuPanel());
  return trigger;
}

function UserMenuPanel() {
  const user = state.get().user;
  const wrap = h("div", { class: "user-panel" });

  const head = h(
    "div",
    { class: "user-panel__head" },
    Avatar({ user, size: 40 }),
    h(
      "div",
      { class: "user-panel__id" },
      h("strong", {}, user.name),
      h("span", { class: "user-panel__karma" }, `${(user.karma || 0).toLocaleString()}  karma`)
    )
  );
  wrap.appendChild(head);

  wrap.appendChild(
    h(
      "button",
      {
        class: "user-panel__item",
        role: "menuitem",
        onClick: () => {
          location.hash = `#/u/${user.name}`;
        },
      },
      h("span", { html: icon("user", { size: 18 }) }),
      "个人主页"
    )
  );
  wrap.appendChild(
    h(
      "button",
      {
        class: "user-panel__item",
        role: "menuitem",
        onClick: () => {
          location.hash = "#/settings";
        },
      },
      h("span", { html: icon("settings", { size: 18 }) }),
      "设置"
    )
  );
  wrap.appendChild(
    h(
      "button",
      {
        class: "user-panel__item",
        role: "menuitem",
        onClick: () => {
          location.hash = "#/notifications";
        },
      },
      h("span", { html: icon("bell", { size: 18 }) }),
      "通知"
    )
  );
  wrap.appendChild(h("hr", { class: "user-panel__sep" }));
  wrap.appendChild(
    h(
      "button",
      {
        class: "user-panel__item user-panel__item--danger",
        role: "menuitem",
        onClick: async () => {
          await auth.logout();
          state.logout();
          toast("已退出登录", { kind: "info" });
          location.hash = "#/";
        },
      },
      h("span", { html: icon("logout", { size: 18 }) }),
      "退出登录"
    )
  );

  return wrap;
}

/**
 * Build the header.
 * @param {{ onHamburger: () => void }} [handlers]
 */
export function Header({ onHamburger } = {}) {
  const root = h(
    "header",
    { class: "header", role: "banner" },
    h(
      "nav",
      { class: "header__nav" },
      HamburgerButton({ onOpen: onHamburger }),
      Logo(),
      SearchBox(),
      h("div", { class: "header__right" }, UserMenuButton())
    )
  );
  return root;
}
