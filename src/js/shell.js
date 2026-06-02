// SPA shell: header + sort bar + main slot + sidebar slot + footer.
// Wires the hamburger to the drawer and exposes a `setView(name, ...)` API
// for the router.

import { h, mount } from "../utils/dom.js";
import { Header } from "./components/header.js";
import { SortBar } from "./components/sort-bar.js";
import { openDrawer } from "./components/drawer.js";
import { state } from "./state.js";

export function AppShell() {
  const main = h("main", { class: "main", id: "main-content", tabindex: "-1" });
  const aside = h("aside", { class: "rail", id: "rail" });
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

  const root = h(
    "div",
    { class: "shell" },
    Header({ onHamburger: openDrawer }),
    SortBar(),
    h(
      "div",
      { class: "shell__body" },
      main,
      aside
    ),
    footer
  );

  return {
    root,
    setMain: (node) => mount(main, node),
    setAside: (node) => mount(aside, node || h("span")),
  };
}
