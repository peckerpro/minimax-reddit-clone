// Entry point — bootstraps the SPA and wires the router.
//
// State IDs (S_xxx) refer to the FSM documented in
// docs/analysis/STATE_MACHINE.md (v2.1.0). Each route is annotated with its
// target state ID so a one-shot grep maps routes ↔ FSM states:
//   grep -nE "// State: S_" src/js/main.js

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

console.info(`[reddit-clone] v2.1.0 — FSM-aligned routes, real News/Explore/Reddit Pro/Compose, comment permalinks`);

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
//
// Note on URL choices: this clone uses `/u/...` and `/r/...` (no `user/` or
// `r/<name>/comments/.../.../` slug) which differs from reddit.com. The FSM
// state semantics are the same — the URLs are a local naming choice kept
// for backwards-compat with the v2.0.x state-key suffix. See FSM §6.

router.add("/", () =>
  // State: S_HOME
  runRoute(async () => {
    shell.setSortbarVisible(true);
    shell.setAside(await Sidebar());
    return applyResult(await Feed({ emptyMessage: "首页没有可显示的帖子。" }));
  })
);

router.add("/best/", () =>
  // State: S_BEST
  runRoute(async () => {
    shell.setSortbarVisible(true);
    shell.setAside(await Sidebar());
    state.setSort("best");
    return applyResult(await Feed({ sort: "best", emptyMessage: "没有最佳帖子。" }));
  })
);

router.add("/r/:name", ({ params }) =>
  // State: S_SUBREDDIT
  // Fix v2.1.0: was `location.pathname.split("/r/")[1]…` which silently threw
  // in the hash router (pathname is the static `index.html`, not the route).
  runRoute(async () => {
    const { SubredditPage } = await import("./components/subreddit.js");
    const result = await SubredditPage({ name: params.name });
    shell.setSortbarVisible(false);
    return applyResult({ main: result, aside: null });
  })
);

router.add("/r/:name/:sort", ({ params, query }) =>
  // State: S_SUBREDDIT_SORTED  (sort ∈ {best, hot, new, top, rising}, timeRange ∈ query.t)
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
  // State: S_SUBREDDIT_ABOUT
  runRoute(async () => {
    const { SubredditAboutPage } = await import("./components/subreddit-about.js");
    shell.setSortbarVisible(false);
    return applyResult(await SubredditAboutPage({ name: params.name }));
  })
);

router.add("/r/:name/comments/:id", ({ params, query }) =>
  // State: S_POST
  // ?sort=…        → S_POST_SORTED_COMMENTS
  // ?context=N&cid → S_COMMENT_PERMALINK  (focus + expand a single comment)
  runRoute(async () => {
    shell.setSortbarVisible(false);
    if (query.sort) state.setCommentSort(query.sort);
    return applyResult(
      await PostDetailPage({
        postId: params.id,
        contextCid: query.cid || null,
      })
    );
  })
);

router.add("/u/:name", ({ params, query }) =>
  // State: S_USER
  runRoute(async () => {
    const { UserPage } = await import("./components/user.js");
    state.setSort(query.sort || "hot");
    state.setTimeRange(query.t || "all");
    shell.setSortbarVisible(false);
    return applyResult(await UserPage({ name: params.name, tab: "" }));
  })
);

router.add("/u/:name/posts", ({ params, query }) =>
  // State: S_USER_POSTS
  runRoute(async () => {
    const { UserPage } = await import("./components/user.js");
    state.setSort(query.sort || "hot");
    state.setTimeRange(query.t || "all");
    shell.setSortbarVisible(false);
    return applyResult(await UserPage({ name: params.name, tab: "/posts" }));
  })
);

router.add("/u/:name/comments", ({ params, query }) =>
  // State: S_USER_COMMENTS
  runRoute(async () => {
    const { UserPage } = await import("./components/user.js");
    state.setSort(query.sort || "hot");
    state.setTimeRange(query.t || "all");
    shell.setSortbarVisible(false);
    return applyResult(await UserPage({ name: params.name, tab: "/comments" }));
  })
);

router.add("/u/:name/saved", ({ params, query }) =>
  // State: S_USER_SAVED
  runRoute(async () => {
    const { UserPage } = await import("./components/user.js");
    state.setSort(query.sort || "hot");
    state.setTimeRange(query.t || "all");
    shell.setSortbarVisible(false);
    return applyResult(await UserPage({ name: params.name, tab: "/saved" }));
  })
);

router.add("/u/:name/hidden", ({ params, query }) =>
  // State: S_USER_HIDDEN
  runRoute(async () => {
    const { UserPage } = await import("./components/user.js");
    state.setSort(query.sort || "hot");
    state.setTimeRange(query.t || "all");
    shell.setSortbarVisible(false);
    return applyResult(await UserPage({ name: params.name, tab: "/hidden" }));
  })
);

router.add("/u/:name/upvoted", ({ params, query }) =>
  // State: S_USER_UPVOTED
  runRoute(async () => {
    const { UserPage } = await import("./components/user.js");
    state.setSort(query.sort || "hot");
    state.setTimeRange(query.t || "all");
    shell.setSortbarVisible(false);
    return applyResult(await UserPage({ name: params.name, tab: "/upvoted" }));
  })
);

router.add("/search", ({ query }) =>
  // State: S_SEARCH
  runRoute(async () => {
    const { SearchPage } = await import("./components/search.js");
    shell.setSortbarVisible(true);
    return applyResult(await SearchPage({ q: query.q || "" }));
  })
);

router.add("/login", ({ query }) =>
  // State: S_LOGIN
  runRoute(async () => {
    const { LoginPage } = await import("./components/login.js");
    shell.setSortbarVisible(false);
    return applyResult(LoginPage({ next: query.next || "#/" }));
  })
);

router.add("/register", () =>
  // State: S_REGISTER
  runRoute(async () => {
    const { LoginPage } = await import("./components/login.js");
    shell.setSortbarVisible(false);
    return applyResult(LoginPage({ next: "#/", title: "注册" }));
  })
);

router.add("/submit", () =>
  // State: S_SUBMIT
  runRoute(async () => {
    const { SubmitPage } = await import("./components/submit.js");
    shell.setSortbarVisible(false);
    return applyResult(SubmitPage());
  })
);

router.add("/settings", () =>
  // State: S_SETTINGS
  runRoute(async () => {
    const { SettingsPage } = await import("./components/settings.js");
    shell.setSortbarVisible(false);
    return applyResult(SettingsPage());
  })
);

router.add("/notifications", () =>
  // State: S_NOTIFICATIONS
  runRoute(async () => {
    const { NotificationsPage } = await import("./components/notifications.js");
    shell.setSortbarVisible(false);
    return applyResult(NotificationsPage());
  })
);

router.add("/communities", () =>
  // State: S_COMMUNITIES
  runRoute(async () => {
    const { CommunitiesPage } = await import("./components/communities.js");
    shell.setSortbarVisible(false);
    return applyResult(await CommunitiesPage());
  })
);

router.add("/premium", () =>
  // State: S_PREMIUM
  runRoute(async () => {
    const { PremiumPage } = await import("./components/premium.js");
    shell.setSortbarVisible(false);
    return applyResult(PremiumPage());
  })
);

router.add("/help/:slug", ({ params }) =>
  // State: S_HELP  (slug = "content-policy" | "privacy-policy" | …)
  runRoute(async () => {
    const { HelpPage } = await import("./components/help.js");
    shell.setSortbarVisible(false);
    return applyResult(HelpPage({ slug: params.slug }));
  })
);

router.add("/help", () =>
  // State: S_HELP  (default slug = "help")
  runRoute(async () => {
    const { HelpPage } = await import("./components/help.js");
    shell.setSortbarVisible(false);
    return applyResult(HelpPage({ slug: "help" }));
  })
);

router.add("/report", () =>
  // State: S_REPORT
  runRoute(async () => {
    const { ReportPage } = await import("./components/report.js");
    shell.setSortbarVisible(false);
    return applyResult(ReportPage());
  })
);

router.add("/message/compose", ({ query }) =>
  // State: S_MESSAGE_COMPOSE  (v2.1.0: was a toast + back-to-home stub)
  runRoute(async () => {
    const { ComposePage } = await import("./components/compose.js");
    shell.setSortbarVisible(false);
    return applyResult(ComposePage({ to: query.to || "" }));
  })
);

router.add("/news", () =>
  // State: S_NEWS  (v2.1.0: was a toast + back-to-home stub)
  runRoute(async () => {
    const { NewsPage } = await import("./components/news.js");
    shell.setSortbarVisible(true);
    return applyResult(await NewsPage());
  })
);

router.add("/explore", () =>
  // State: S_EXPLORE  (v2.1.0: was a toast + back-to-home stub)
  runRoute(async () => {
    const { ExplorePage } = await import("./components/explore.js");
    shell.setSortbarVisible(true);
    return applyResult(await ExplorePage());
  })
);

router.add("/reddit-pro", () =>
  // State: S_REDDIT_PRO  (v2.1.0: was a toast + back-to-home stub)
  runRoute(async () => {
    const { RedditProPage } = await import("./components/reddit-pro.js");
    shell.setSortbarVisible(false);
    return applyResult(RedditProPage());
  })
);

router.add("/coins", () =>
  // State: S_COINS  (v2.1.0: reuses PremiumPage but with coins header copy)
  runRoute(async () => {
    const { CoinsPage } = await import("./components/coins.js");
    shell.setSortbarVisible(false);
    return applyResult(CoinsPage());
  })
);

router.setNoMatchHandler(({ path }) =>
  // State: S_NOT_FOUND
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
