// Entry point — bootstraps the SPA.

import { mount } from "./utils/dom.js";
import { AppShell } from "./shell.js";

console.info(`[reddit-clone] v0.1.0 — top chrome online`);

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

const shell = AppShell();
mount(app, shell.root);
app.removeAttribute("aria-busy");

// v0.1.0 doesn't have a router yet. Drop a placeholder into the main slot
// so it's obvious what to click.
import { h } from "./utils/dom.js";
shell.setMain(
  h(
    "div",
    { class: "boot-screen" },
    h("h1", {}, "MiniMax Reddit Clone"),
    h("p", {}, "顶部导航 + 排序栏已就位。"),
    h("p", {}, "v0.2.0 将填充侧边栏，v0.3.0 将接入主 feed。"),
    h("p", {}, "试试："),
    h(
      "ul",
      { class: "hint-list" },
      h("li", {}, "点击左上角 ☰ 打开抽屉导航"),
      h("li", {}, "点击排序 / 全球 下拉切换排序方式"),
      h("li", {}, "点击右上角 头像 / 登录 按钮"),
      h("li", {}, "试试键盘：Tab 聚焦，Esc 关闭菜单")
    )
  )
);

// expose for debugging in dev
if (import.meta.env?.DEV) {
  // @ts-ignore
  window.__app = { shell };
}
