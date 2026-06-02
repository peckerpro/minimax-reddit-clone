// Entry point — bootstraps the SPA and wires the router.

import { mount, h } from "./utils/dom.js";
import { AppShell } from "./shell.js";
import { Sidebar } from "./components/sidebar.js";
import { Feed } from "./components/feed.js";
import { PostDetail } from "./components/post-detail.js";
import { router } from "./router.js";

console.info(`[reddit-clone] v0.5.0 — subreddit page + rules online`);

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

const shell = AppShell();
mount(app, shell.root);
app.removeAttribute("aria-busy");

// ── routes ─────────────────────────────────────────────

router.add("/", async ({ query }) => {
  shell.setSortbarVisible(true);
  shell.setAside(Sidebar());
  shell.setMain(Feed({ emptyMessage: "首页没有可显示的帖子。" }));
});

router.add("/r/:name", async ({ params }) => {
  const { SubredditPage } = await import("./components/subreddit.js");
  shell.setSortbarVisible(false); // subreddit has its own subhead sort
  shell.setAside(null);
  shell.setMain(SubredditPage({ name: params.name }));
});

router.add("/r/:name/comments/:id", async ({ params }) => {
  shell.setSortbarVisible(false);
  shell.setAside(null);
  shell.setMain(PostDetail({ postId: params.id }));
});

router.add("/u/:name", async ({ params }) => {
  const { UserPage } = await import("./components/user.js");
  shell.setSortbarVisible(false);
  shell.setAside(null);
  shell.setMain(UserPage({ name: params.name }));
});

router.add("/search", async ({ query }) => {
  const { SearchPage } = await import("./components/search.js");
  shell.setSortbarVisible(true);
  shell.setAside(null);
  shell.setMain(SearchPage({ q: query.q || "" }));
});

router.add("/login", async ({ query }) => {
  const { LoginPage } = await import("./components/login.js");
  shell.setSortbarVisible(false);
  shell.setAside(null);
  shell.setMain(LoginPage({ next: query.next || "#/" }));
});

router.add("/submit", async () => {
  const { SubmitPage } = await import("./components/submit.js");
  shell.setSortbarVisible(false);
  shell.setAside(null);
  shell.setMain(SubmitPage({}));
});

router.add("/settings", async () => {
  const { SettingsPage } = await import("./components/settings.js");
  shell.setSortbarVisible(false);
  shell.setAside(null);
  shell.setMain(SettingsPage({}));
});

router.add("/notifications", async () => {
  const { NotificationsPage } = await import("./components/notifications.js");
  shell.setSortbarVisible(false);
  shell.setAside(null);
  shell.setMain(NotificationsPage({}));
});

router.add("/communities", async () => {
  const { CommunitiesPage } = await import("./components/communities.js");
  shell.setSortbarVisible(false);
  shell.setAside(null);
  shell.setMain(CommunitiesPage({}));
});

router.add("/premium", async () => {
  const { PremiumPage } = await import("./components/premium.js");
  shell.setSortbarVisible(false);
  shell.setAside(null);
  shell.setMain(PremiumPage({}));
});

router.add("/help/:slug", async ({ params }) => {
  const { HelpPage } = await import("./components/help.js");
  shell.setSortbarVisible(false);
  shell.setAside(null);
  shell.setMain(HelpPage({ slug: params.slug }));
});

router.add("/report", async () => {
  const { ReportPage } = await import("./components/report.js");
  shell.setSortbarVisible(false);
  shell.setAside(null);
  shell.setMain(ReportPage({}));
});

router.start();

if (import.meta.env?.DEV) {
  // @ts-ignore
  window.__app = { shell, router };
}
