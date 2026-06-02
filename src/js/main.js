// Entry point — bootstraps the SPA and wires the router.

import { mount } from "./utils/dom.js";
import { AppShell } from "./shell.js";
import { Sidebar } from "./components/sidebar.js";
import { Feed } from "./components/feed.js";
import { PostDetailPage } from "./components/post-detail.js";
import { NotFoundPage } from "./components/not-found.js";
import { initBackToTop } from "./components/back-to-top.js";
import { router } from "./router.js";
import { state } from "./state.js";
import { toast } from "./components/toast.js";

console.info(`[reddit-clone] v2.0.0 — major rewrite, 3-column layout, real interactions`);

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

const shell = AppShell();
mount(app, shell.root);
app.removeAttribute("aria-busy");

window.addEventListener("unhandledrejection", (e) => {
  console.error("[unhandledrejection]", e.reason);
  toast("操作失败：" + (e.reason?.message || "未知错误"), { kind: "error" });
});

initBackToTop();

async function runRoute(fn) {
  try {
    const result = await fn();
    return result;
  } catch (err) {
    console.error("[route] threw:", err);
    toast("页面加载失败：" + (err?.message || "未知错误"), { kind: "error" });
    return null;
  }
}

/**
 * Apply a result that may be { main, aside } or a single node.
 */
function applyResult(result) {
  if (!result) return;
  if (result && typeof result === "object" && "main" in result) {
    shell.setMain(result.main);
    shell.setAside(result.aside);
  } else {
    shell.setMain(result);
  }
}

// ── routes ─────────────────────────────────────────────

router.add("/", () =>
  runRoute(async () => {
    shell.setSortbarVisible(true);
    shell.setAside(await Sidebar());
    return applyResult(await Feed({ emptyMessage: "首页没有可显示的帖子。" }));
  })
);

router.add("/best/", () =>
  runRoute(async () => {
    shell.setSortbarVisible(true);
    shell.setAside(await Sidebar());
    state.setSort("best");
    return applyResult(await Feed({ sort: "best", emptyMessage: "没有最佳帖子。" }));
  })
);

router.add("/r/:name", () =>
  runRoute(async () => {
    const { SubredditPage } = await import("./components/subreddit.js");
    const result = await SubredditPage({ name: location.pathname.split("/r/")[1].split("/")[0] });
    shell.setSortbarVisible(false);
    return applyResult({ main: result, aside: null });
  })
);

router.add("/r/:name/:sort", ({ params, query }) =>
  runRoute(async () => {
    const { SubredditPage } = await import("./components/subreddit.js");
    const result = await SubredditPage({
      name: params.name,
      sort: params.sort,
      timeRange: query.t,
    });
    shell.setSortbarVisible(false);
    return applyResult({ main: result, aside: null });
  })
);

router.add("/r/:name/about", ({ params }) =>
  runRoute(async () => {
    const { SubredditAboutPage } = await import("./components/subreddit-about.js");
    shell.setSortbarVisible(false);
    return applyResult(await SubredditAboutPage({ name: params.name }));
  })
);

router.add("/r/:name/comments/:id", ({ params }) =>
  runRoute(async () => {
    shell.setSortbarVisible(false);
    return applyResult(await PostDetailPage({ postId: params.id }));
  })
);

router.add("/u/:name", ({ params, query }) =>
  runRoute(async () => {
    const { UserPage } = await import("./components/user.js");
    state.setSort(query.sort || "hot");
    state.setTimeRange(query.t || "all");
    shell.setSortbarVisible(false);
    return applyResult(await UserPage({ name: params.name, tab: "" }));
  })
);

router.add("/u/:name/posts", ({ params, query }) =>
  runRoute(async () => {
    const { UserPage } = await import("./components/user.js");
    state.setSort(query.sort || "hot");
    state.setTimeRange(query.t || "all");
    shell.setSortbarVisible(false);
    return applyResult(await UserPage({ name: params.name, tab: "/posts" }));
  })
);

router.add("/u/:name/comments", ({ params, query }) =>
  runRoute(async () => {
    const { UserPage } = await import("./components/user.js");
    state.setSort(query.sort || "hot");
    state.setTimeRange(query.t || "all");
    shell.setSortbarVisible(false);
    return applyResult(await UserPage({ name: params.name, tab: "/comments" }));
  })
);

router.add("/u/:name/saved", ({ params, query }) =>
  runRoute(async () => {
    const { UserPage } = await import("./components/user.js");
    state.setSort(query.sort || "hot");
    state.setTimeRange(query.t || "all");
    shell.setSortbarVisible(false);
    return applyResult(await UserPage({ name: params.name, tab: "/saved" }));
  })
);

router.add("/u/:name/hidden", ({ params, query }) =>
  runRoute(async () => {
    const { UserPage } = await import("./components/user.js");
    state.setSort(query.sort || "hot");
    state.setTimeRange(query.t || "all");
    shell.setSortbarVisible(false);
    return applyResult(await UserPage({ name: params.name, tab: "/hidden" }));
  })
);

router.add("/u/:name/upvoted", ({ params, query }) =>
  runRoute(async () => {
    const { UserPage } = await import("./components/user.js");
    state.setSort(query.sort || "hot");
    state.setTimeRange(query.t || "all");
    shell.setSortbarVisible(false);
    return applyResult(await UserPage({ name: params.name, tab: "/upvoted" }));
  })
);

router.add("/search", ({ query }) =>
  runRoute(async () => {
    const { SearchPage } = await import("./components/search.js");
    shell.setSortbarVisible(true);
    return applyResult(await SearchPage({ q: query.q || "" }));
  })
);

router.add("/login", ({ query }) =>
  runRoute(async () => {
    const { LoginPage } = await import("./components/login.js");
    shell.setSortbarVisible(false);
    return applyResult(LoginPage({ next: query.next || "#/" }));
  })
);

router.add("/register", () =>
  runRoute(async () => {
    const { LoginPage } = await import("./components/login.js");
    shell.setSortbarVisible(false);
    return applyResult(LoginPage({ next: "#/", title: "注册" }));
  })
);

router.add("/submit", () =>
  runRoute(async () => {
    const { SubmitPage } = await import("./components/submit.js");
    shell.setSortbarVisible(false);
    return applyResult(SubmitPage());
  })
);

router.add("/settings", () =>
  runRoute(async () => {
    const { SettingsPage } = await import("./components/settings.js");
    shell.setSortbarVisible(false);
    return applyResult(SettingsPage());
  })
);

router.add("/notifications", () =>
  runRoute(async () => {
    const { NotificationsPage } = await import("./components/notifications.js");
    shell.setSortbarVisible(false);
    return applyResult(NotificationsPage());
  })
);

router.add("/communities", () =>
  runRoute(async () => {
    const { CommunitiesPage } = await import("./components/communities.js");
    shell.setSortbarVisible(false);
    return applyResult(await CommunitiesPage());
  })
);

router.add("/premium", () =>
  runRoute(async () => {
    const { PremiumPage } = await import("./components/premium.js");
    shell.setSortbarVisible(false);
    return applyResult(PremiumPage());
  })
);

router.add("/help/:slug", ({ params }) =>
  runRoute(async () => {
    const { HelpPage } = await import("./components/help.js");
    shell.setSortbarVisible(false);
    return applyResult(HelpPage({ slug: params.slug }));
  })
);

router.add("/help", () =>
  runRoute(async () => {
    const { HelpPage } = await import("./components/help.js");
    shell.setSortbarVisible(false);
    return applyResult(HelpPage({ slug: "help" }));
  })
);

router.add("/report", () =>
  runRoute(async () => {
    const { ReportPage } = await import("./components/report.js");
    shell.setSortbarVisible(false);
    return applyResult(ReportPage());
  })
);

router.add("/message/compose", () =>
  runRoute(async () => {
    toast("私信功能尚未实现（mock）", { kind: "info" });
    location.hash = "#/";
  })
);

router.add("/news", () =>
  runRoute(async () => {
    toast("资讯 tab 暂未实现", { kind: "info" });
    location.hash = "#/";
  })
);

router.add("/explore", () =>
  runRoute(async () => {
    toast("游览 tab 暂未实现", { kind: "info" });
    location.hash = "#/";
  })
);

router.add("/reddit-pro", () =>
  runRoute(async () => {
    toast("Reddit Pro 暂未实现", { kind: "info" });
    location.hash = "#/";
  })
);

router.add("/coins", () =>
  runRoute(async () => {
    const { PremiumPage } = await import("./components/premium.js");
    shell.setSortbarVisible(false);
    return applyResult(PremiumPage());
  })
);

router.setNoMatchHandler(({ path }) =>
  runRoute(async () => {
    shell.setSortbarVisible(false);
    return applyResult(NotFoundPage({ path }));
  })
);

router.start();

// mark routes as recently-viewed
router.subscribe(({ pattern, params }) => {
  if (!pattern) return;
  if (pattern === "/r/:name" || pattern === "/r/:name/:sort") {
    state.pushRecent("r", params.name);
  } else if (pattern === "/u/:name" || pattern.startsWith("/u/:name")) {
    state.pushRecent("u", params.name);
  }
});
