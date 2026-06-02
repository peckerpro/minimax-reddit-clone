// Entry point — bootstraps the SPA and wires the router.

import { mount } from "./utils/dom.js";
import { AppShell } from "./shell.js";
import { Sidebar } from "./components/sidebar.js";
import { Feed } from "./components/feed.js";
import { PostDetail } from "./components/post-detail.js";
import { NotFoundPage } from "./components/not-found.js";
import { initBackToTop } from "./components/back-to-top.js";
import { router } from "./router.js";
import { toast } from "./components/toast.js";

console.info(`[reddit-clone] v1.0.3 — header state sync + route awaits`);

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

const shell = AppShell();
mount(app, shell.root);
app.removeAttribute("aria-busy");

// catch async render errors and surface them as toasts
window.addEventListener("unhandledrejection", (e) => {
  console.error("[unhandledrejection]", e.reason);
  toast("操作失败：" + (e.reason?.message || "未知错误"), { kind: "error" });
});

initBackToTop();

/** Run a route handler, showing a toast if it throws. */
async function runRoute(fn) {
  try {
    await fn();
  } catch (err) {
    console.error("[route] threw:", err);
    toast("页面加载失败：" + (err?.message || "未知错误"), { kind: "error" });
  }
}

// ── routes ─────────────────────────────────────────────
//
// Every `setMain` / `setAside` is awaited so we hand an HTMLElement to the
// shell, never a Promise. (replaceChildren(Promise) is what was producing
// the "[object Promise]" text node in the DOM.)

router.add("/", () =>
  runRoute(async () => {
    shell.setSortbarVisible(true);
    shell.setAside(await Sidebar());
    shell.setMain(await Feed({ emptyMessage: "首页没有可显示的帖子。" }));
  })
);

router.add("/r/:name", ({ params }) =>
  runRoute(async () => {
    const { SubredditPage } = await import("./components/subreddit.js");
    shell.setSortbarVisible(false);
    shell.setAside(null);
    shell.setMain(await SubredditPage({ name: params.name }));
  })
);

router.add("/r/:name/comments/:id", ({ params }) =>
  runRoute(async () => {
    shell.setSortbarVisible(false);
    shell.setAside(null);
    shell.setMain(await PostDetail({ postId: params.id }));
  })
);

router.add("/u/:name", ({ params }) =>
  runRoute(async () => {
    const { UserPage } = await import("./components/user.js");
    shell.setSortbarVisible(false);
    shell.setAside(null);
    shell.setMain(await UserPage({ name: params.name }));
  })
);

router.add("/search", ({ query }) =>
  runRoute(async () => {
    const { SearchPage } = await import("./components/search.js");
    shell.setSortbarVisible(true);
    shell.setAside(null);
    shell.setMain(await SearchPage({ q: query.q || "" }));
  })
);

router.add("/login", ({ query }) =>
  runRoute(async () => {
    const { LoginPage } = await import("./components/login.js");
    shell.setSortbarVisible(false);
    shell.setAside(null);
    shell.setMain(LoginPage({ next: query.next || "#/" }));
  })
);

router.add("/submit", () =>
  runRoute(async () => {
    const { SubmitPage } = await import("./components/submit.js");
    shell.setSortbarVisible(false);
    shell.setAside(null);
    shell.setMain(SubmitPage());
  })
);

router.add("/settings", () =>
  runRoute(async () => {
    const { SettingsPage } = await import("./components/settings.js");
    shell.setSortbarVisible(false);
    shell.setAside(null);
    shell.setMain(SettingsPage());
  })
);

router.add("/notifications", () =>
  runRoute(async () => {
    const { NotificationsPage } = await import("./components/notifications.js");
    shell.setSortbarVisible(false);
    shell.setAside(null);
    shell.setMain(NotificationsPage());
  })
);

router.add("/communities", () =>
  runRoute(async () => {
    const { CommunitiesPage } = await import("./components/communities.js");
    shell.setSortbarVisible(false);
    shell.setAside(null);
    shell.setMain(await CommunitiesPage());
  })
);

router.add("/premium", () =>
  runRoute(async () => {
    const { PremiumPage } = await import("./components/premium.js");
    shell.setSortbarVisible(false);
    shell.setAside(null);
    shell.setMain(PremiumPage());
  })
);

router.add("/help/:slug", ({ params }) =>
  runRoute(async () => {
    const { HelpPage } = await import("./components/help.js");
    shell.setSortbarVisible(false);
    shell.setAside(null);
    shell.setMain(HelpPage({ slug: params.slug }));
  })
);

router.add("/report", () =>
  runRoute(async () => {
    const { ReportPage } = await import("./components/report.js");
    shell.setSortbarVisible(false);
    shell.setAside(null);
    shell.setMain(ReportPage());
  })
);

// Catch-all 404 — registered via the noMatch handler.
router.setNoMatchHandler(({ path }) =>
  runRoute(async () => {
    shell.setSortbarVisible(false);
    shell.setAside(null);
    shell.setMain(NotFoundPage({ path }));
  })
);

router.start();

if (import.meta.env?.DEV) {
  // @ts-ignore
  window.__app = { shell, router };
}
