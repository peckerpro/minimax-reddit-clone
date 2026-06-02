// SPA shell: header + left nav + main slot + right rail + footer.
// 3-column layout: left 272px (or 56px collapsed) / main flex / right 316px
// Total content 1624px centered with 148px margins on each side at 1920px.

import { h, mount } from "./utils/dom.js";
import { Header } from "./components/header.js";
import { SortBar } from "./components/sort-bar.js";
import { LeftNav } from "./components/left-nav.js";
import { openDrawer } from "./components/drawer.js";
import { state } from "./state.js";

export function AppShell() {
  const main = h("main", { class: "main", id: "main-content", tabindex: "-1" });
  const aside = h("aside", { class: "rail", id: "right-sidebar-container" });
  const leftNav = LeftNav();
  const sortbar = SortBar();
  const footer = h(
    "footer",
    { class: "footer" },
    h(
      "ul",
      { class: "footer__links" },
      h("li", {}, h("a", { href: "#/help/content-policy" }, "Reddit 规则")),
      h("li", {}, h("a", { href: "#/help/privacy-policy" }, "隐私政策")),
      h("li", {}, h("a", { href: "#/help/user-agreement" }, "用户协议")),
      h("li", {}, h("a", { href: "#/help/accessibility" }, "辅助功能")),
      h("li", {}, h("a", { href: "#/help/inc" }, "Reddit, Inc. © 2026。保留所有权利。"))
    )
  );

  // header hamburger on desktop now toggles the left nav collapse
  const root = h(
    "div",
    { class: "shell" },
    Header({ onHamburger: () => state.setLeftNavCollapsed(!state.get().leftNavCollapsed) }),
    sortbar,
    h(
      "div",
      { class: "shell__body" },
      leftNav,
      main,
      aside
    ),
    footer
  );

  return {
    root,
    setMain: (node) => mount(main, node),
    setAside: (node) => mount(aside, node || h("span")),
    setSortbarVisible: (v) => {
      sortbar.style.display = v ? "" : "none";
    },
  };
}
