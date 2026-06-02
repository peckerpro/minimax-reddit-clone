# Changelog

All notable changes to this project are documented here. Versions follow [SemVer](https://semver.org/).

## v1.0.0 — Polish & Ship

- Empty / error / loading states for every view.
- Keyboard navigation for menus, modals, and the comment tree.
- Accessibility: focus traps, ARIA roles, prefers-reduced-motion, semantic landmarks.
- Image lazy-loading, route prefetch, hot-path performance pass.
- Final visual QA vs. the live Reddit reference.

## v0.6.0 — Auth & Composition

- Login modal (mock auth — accepts any non-empty username / password).
- Create-post modal with kind selector (text / link / image).
- User menu (profile, settings, logout) anchored to the avatar.
- Share dialog (copy link, share to "social" mock targets).
- Notification toasts for every state-changing action.

## v0.5.0 — Subreddit Page

- `/r/:name` route renders the community info card, rules accordion, and the
  same feed as the homepage.
- Sort bar becomes community-scoped.
- "Join" / "Joined" toggle persists in `state.js`.

## v0.4.0 — Post Detail & Comments

- `/r/:sub/comments/:id` route renders a single post + threaded comment tree.
- Comment voting, collapse / expand, reply box, sort (best / top / new / controversial).
- Author chip, mod / op / admin badges, awards line.

## v0.3.0 — Home Feed

- `/` route renders a feed of mock posts.
- Post card: subreddit chip, vote column, title, body, media, action bar.
- Sort bar (best / hot / new / top / rising) wired to mock data.
- View toggle (card / compact) stored in `state.js`.

## v0.2.0 — Sidebar & Footer

- Right rail: "热门社区" with subreddit icon, name, member count.
- Footer: 规则 / 隐私政策 / 用户协议 / 辅助功能 / Copyright.

## v0.1.0 — Top Chrome

- Sticky top navigation: hamburger, logo, search box, login, user menu.
- Sort bar with sort & location dropdowns.
- View toggle button.

## v0.0.0 — Skeleton

- Project scaffolding (`package.json`, `README.md`, `.gitignore`).
- Folder layout for `src/`, `public/`, `scripts/`, `docs/`.
- Empty `index.html` shell mounting `#app`.
- npm scripts for dev / lint / test.
- Initial git commit tagged `v0.0.0`.
