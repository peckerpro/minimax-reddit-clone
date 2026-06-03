// Header — sticky top bar with hamburger, logo, search, login/user menu.

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { state } from "../state.js";
import { auth } from "../auth.js";
import { toast } from "./toast.js";
import { dropdown } from "./dropdown.js";

// M7: theme toggle (auto / light / dark). Lives in the header so
// it's always reachable. The actual color swap happens via
// utils/theme.js -> state.setTheme.
function ThemeToggle() {
  const cur = state.get().theme || "auto";
  const trigger = h(
    "button",
    {
      class: "icon-btn header__theme",
      type: "button",
      "aria-label": "主题设置",
      title: "主题设置",
    },
    h("span", { class: "icon-btn__inner", html: icon(cur === "dark" ? "moon" : "sun", { size: 18 }) })
  );
  dropdown(trigger, () => {
    const opts = [
      { value: "auto",  label: "跟随系统", icon: "circle" },
      { value: "light", label: "浅色",     icon: "sun" },
      { value: "dark",  label: "深色",     icon: "moon" },
    ];
    return h(
      "div",
      { class: "dd__panel", role: "menu" },
      ...opts.map((o) =>
        h(
          "button",
          {
            class: ["user-panel__item", o.value === cur ? "is-active" : ""].join(" "),
            onClick: () => {
              state.setTheme(o.value);
              document.body.click();
            },
          },
          h("span", { html: icon(o.icon, { size: 16 }) }),
          o.label
        )
      )
    );
  });
  return trigger;
}

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
  if (user.role === "admin") {
    wrap.appendChild(
      h(
        "button",
        {
          class: "user-panel__item",
          role: "menuitem",
          onClick: () => {
            location.hash = "#/admin";
          },
        },
        h("span", { html: icon("shield", { size: 18 }) }),
        "管理面板"
      )
    );
  }
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
  const right = h("div", { class: "header__right" });
  function renderRight() {
    right.replaceChildren(ThemeToggle(), UserMenuButton());
  }
  renderRight();

  // Re-render the right side whenever the auth state changes (login, logout,
  // or any other state mutation that touches the user).
  let lastUser = state.get().user;
  state.subscribe((s) => {
    if (s.user !== lastUser) {
      lastUser = s.user;
      renderRight();
    }
  });

  const root = h(
    "header",
    { class: "header", role: "banner" },
    h(
      "nav",
      { class: "header__nav" },
      HamburgerButton({ onOpen: onHamburger }),
      Logo(),
      SearchBox(),
      right
    )
  );
  return root;
}
