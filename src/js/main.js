// Entry point — bootstraps the SPA.

import { mount, h } from "./utils/dom.js";
import { AppShell } from "./shell.js";
import { Sidebar } from "./components/sidebar.js";

console.info(`[reddit-clone] v0.2.0 — sidebar online`);

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

const shell = AppShell();
mount(app, shell.root);
app.removeAttribute("aria-busy");

// async sidebar
shell.setAside(Sidebar());

// v0.2.0 placeholder in the main slot
shell.setMain(
  h(
    "div",
    { class: "boot-screen" },
    h("h1", {}, "MiniMax Reddit Clone"),
    h("p", {}, "顶部导航 + 排序栏 + 侧边栏均已就位。"),
    h("p", {}, "v0.3.0 将接入主 feed（帖子卡片 + 投票）。"),
    h(
      "ul",
      { class: "hint-list" },
      h("li", {}, "点击左上角 ☰ 打开抽屉导航"),
      h("li", {}, "点击 热门社区 中的任一社区尝试跳到 r/:name（v0.5.0 实现）"),
      h("li", {}, "试试键盘：Tab 聚焦，Esc 关闭菜单")
    )
  )
);

if (import.meta.env?.DEV) {
  // @ts-ignore
  window.__app = { shell };
}
