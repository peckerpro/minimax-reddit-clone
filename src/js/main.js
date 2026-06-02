// Entry point — bootstraps the SPA.

import { mount, h } from "./utils/dom.js";
import { AppShell } from "./shell.js";
import { Sidebar } from "./components/sidebar.js";
import { Feed } from "./components/feed.js";

console.info(`[reddit-clone] v0.3.0 — feed online`);

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

const shell = AppShell();
mount(app, shell.root);
app.removeAttribute("aria-busy");

// async: mount sidebar and feed
shell.setAside(Sidebar());
shell.setMain(Feed());

if (import.meta.env?.DEV) {
  // @ts-ignore
  window.__app = { shell };
}
