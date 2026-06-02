# Changelog

All notable changes to this project are documented here. Versions follow [SemVer](https://semver.org/).

## v2.0.1 — Critical bugfix: listComments / getRules double-destructure

- Fixed `api.listComments` crashing on `comments.comments.filter(...)` (the
  destructured `comments` was already the array). This broke the entire
  post-detail page.
- Fixed same pattern in `api.getRules` (`rules.rules[name]`).
- Hardened `api.relatedById` against the same class of bug.
- New `scripts/api-test.mjs` — 25 API calls exercised with sample data;
  catches the "returns undefined instead of iterable" class of bug.
  Result: 25 ok, 0 bad.
- This is a regression-only patch. No new features.

## v2.0.0 — Major rewrite, real Reddit clone

- 3-column layout: left nav 272px / main 740px / right rail 316px
- Left navigation rail (new) with 4 sections + collapse state
- 13 new routes (sort URL routing, user sub-routes, /r/:name/about, etc.)
- 4-state vote machine (fixed: up+down → down, not none)
- 3 new modals: award (8 awards + coins), share (8 targets), report (10 reasons)
- Post dropdown extended: hide / save / subscribe / block user / block sub / report / copy
- Post detail right sidebar: signup CTA / related posts / about community
- Subreddit about sub-page with rules, related communities, facts
- User profile: 6 time ranges, 4 sorts, 6 tabs
- State extended: blocked, recentlyViewed, drafts, coins, theme, timeRange
- Mock data: 25 subreddits, 40 posts, 32 comments, 8 awards, 5 cross-posts
- CSS: 3 new files (~680 lines), full responsive breakpoints

## v1.0.0 — Polish & Ship

- Empty / error / loading states for every view.
- 404 page (catch-all route) with friendly CTA.
- Back-to-top floating button (appears after 600px of scroll).
- Async error boundary: any unhandled promise rejection becomes a toast.
- Mock data expanded: 40 posts (was 30), 32 comments (was 23), 24 users, 25
  subreddits, full rules for 21 communities.
- Final visual QA vs. the live Reddit reference.
- README + project structure polished.

## v0.6.0 — Auth & Composition

- Modal primitive (backdrop, focus trap, Esc/overlay close, sm/md/lg).
- Login page (full form + error state + Google/Apple mock buttons) plus an
  `openLoginModal(next)` helper.
- Create-post page (kind picker, subreddit dropdown, validation, success toast,
  redirect to the chosen subreddit).
- Real settings page (account, display toggles, notifications, logout).
- Real notifications page (6 mock items, mark-all-read, unread styling).
- Real communities page (25-card grid with live search).
- Real user page (banner, avatar, karma, tabs, user-filtered feed).
- Real premium page (3 plan cards, hero banner, perk lists).
- Real report page (10 standardized reasons, detail, submit + redirect).
- `openReportModal({ context })` helper.

## v0.5.0 — Subreddit Page

- `/r/:name` route renders the community info card, rules accordion, and the
  same feed as the homepage.
- 21 subreddits ship with rules (r/technology has the full 9-rule set).
- Subreddit data extended with `createdAt`, `type`, `weeklyVisitors`,
  `weeklyContributors`, `category`.
- Sort bar becomes community-scoped.
- "Join" / "Joined" toggle persists in `state.js`.
- `shell.setSortbarVisible(boolean)` API lets the router hide the global sort
  bar on routes that don't need it.

## v0.4.0 — Post Detail & Comments

- Hash-based router (`router.js`) with pattern matching, query parsing, and
  signal-based `current` state. 13 routes wired.
- `/r/:sub/comments/:id` route renders a single post + threaded comment tree.
- Comment voting, collapse / expand, reply box, sort (best / top / new /
  controversial).
- Author chip, time-ago, "edited" tag, action bar.
- Post composer at the bottom of the comment section.

## v0.3.0 — Home Feed

- `/` route renders a feed of 30 mock posts.
- Post card: subreddit chip, vote column, title, body, media, action bar.
- Sort bar (best / hot / new / top / rising) wired to mock data.
- View toggle (card / compact) stored in `state.js`.
- Vote / share / award / hide / save all gated on login.

## v0.2.0 — Sidebar & Footer

- Right rail: "热门社区" with subreddit icon, name, member count.
- Reddit Premium card.
- Footer: 规则 / 隐私政策 / 用户协议 / 辅助功能 / Copyright.
- `api.js` mock layer with `popularSubreddits(n)`, `getSubreddit(name)`,
  `listSubreddits()`.

## v0.1.0 — Top Chrome

- Sticky top navigation: hamburger, logo, search box, login, user menu.
- Sort bar with sort & location dropdowns.
- View toggle button.
- Hamburger drawer with profile, nav, logout.
- Toast notification system.
- State store with `localStorage` persistence.
- Mock auth (any non-empty username / password).

## v0.0.0 — Skeleton

- Project scaffolding (`package.json`, `README.md`, `.gitignore`).
- Folder layout for `src/`, `public/`, `scripts/`, `docs/`.
- Empty `index.html` shell mounting `#app`.
- npm scripts for dev / lint / test / build.
- Initial git commit tagged `v0.0.0`.
