// Hamburger drawer — opens from the left, lists the same items you'd see in
// the live Reddit hamburger menu. Mostly a stub in v0.1.0; gets filled in
// later versions.

import { h, mount } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { state } from "../state.js";
import { auth } from "../auth.js";
import { toast } from "./toast.js";

let overlay = null;
let drawer = null;

function build() {
  const close = () => teardown();

  const header = h(
    "div",
    { class: "drawer__head" },
    h(
      "span",
      { class: "drawer__title" },
      h("span", { class: "drawer__logo", html: icon("user", { size: 24 }) }),
      "导航"
    ),
    h(
      "button",
      {
        class: "icon-btn",
        type: "button",
        "aria-label": "关闭",
        onClick: close,
      },
      h("span", { class: "icon-btn__inner", html: icon("close", { size: 20 }) })
    )
  );

  const user = state.get().user;
  const profile = h(
    "div",
    { class: "drawer__profile" },
    user
      ? h(
          "div",
          { class: "drawer__profile-row" },
          h("span", {
            class: "avatar",
            style: { background: user.avatarColor || "#ff4500" },
          }, user.name?.[0]?.toUpperCase() || "U"),
          h(
            "div",
            {},
            h("strong", {}, user.name),
            h("div", { class: "drawer__sub" }, `${(user.karma || 0).toLocaleString()} karma`)
          )
        )
      : h(
          "button",
          {
            class: "btn btn--primary btn--block",
            type: "button",
            onClick: () => {
              close();
              location.hash = "#/login";
            },
          },
          "登录"
        )
  );

  const items = [
    { icon: "user",    label: "我的主页",    hash: user ? `#/u/${user.name}` : "#/login" },
    { icon: "plus",    label: "创建帖子",   hash: "#/submit" },
    { icon: "bell",    label: "通知",       hash: "#/notifications" },
    { icon: "settings", label: "设置",      hash: "#/settings" },
    { icon: "help",    label: "帮助中心",   hash: "#/help" },
  ];
  const list = h("ul", { class: "drawer__list" });
  for (const it of items) {
    const li = h(
      "li",
      {},
      h(
        "a",
        {
          href: it.hash,
          class: "drawer__item",
          onClick: close,
        },
        h("span", { class: "drawer__item-icon", html: icon(it.icon, { size: 20 }) }),
        h("span", {}, it.label)
      )
    );
    list.appendChild(li);
  }

  const footer = h(
    "div",
    { class: "drawer__foot" },
    user
      ? h(
          "button",
          {
            class: "btn btn--ghost btn--block",
            type: "button",
            onClick: async () => {
              await auth.logout();
              state.logout();
              toast("已退出登录", { kind: "info" });
              close();
            },
          },
          "退出登录"
        )
      : null
  );

  return h(
    "aside",
    { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": "导航菜单" },
    header,
    profile,
    list,
    footer
  );
}

export function openDrawer() {
  if (drawer) return;
  overlay = h("div", { class: "drawer-overlay", onClick: teardown });
  drawer = build();
  document.body.append(overlay, drawer);
  document.body.classList.add("body--no-scroll");
  requestAnimationFrame(() => {
    overlay.classList.add("drawer-overlay--in");
    drawer.classList.add("drawer--in");
  });
  document.addEventListener("keydown", onKey);
}

function onKey(e) {
  if (e.key === "Escape") teardown();
}

export function teardown() {
  if (!drawer) return;
  document.body.classList.remove("body--no-scroll");
  overlay.classList.remove("drawer-overlay--in");
  drawer.classList.remove("drawer--in");
  document.removeEventListener("keydown", onKey);
  const d = drawer;
  const o = overlay;
  drawer = null;
  overlay = null;
  setTimeout(() => {
    d.remove();
    o.remove();
  }, 200);
}
