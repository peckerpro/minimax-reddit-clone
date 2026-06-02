# minimax-reddit-clone

A high-fidelity front-end clone of [Reddit](https://www.reddit.com/) built as a maintainable engineering project. All data is mocked locally — no real Reddit API calls — so the project runs completely offline.

> **Why this exists**
> - Learning exercise: study Reddit's information architecture, design tokens, and component breakdown.
> - Reference implementation: a clean vanilla-JS / ES-modules / CSS-variables codebase without React/Vue overhead.
> - Engineering practice: every release is git-tagged for instant rollback.

## Highlights

- **Pixel-aware layout** — top-bar, sort-bar, three-column feed, sticky right rail, infinite scroll, modals, dropdowns, hover/focus states.
- **Full interaction set** — up-vote / down-vote, join community, expand user menu, share, award, sort selector, view toggle, login modal, create-post modal, comment tree (collapse/expand/reply), subreddit rules accordion, hash-based router.
- **Realistic mock data** — 60+ posts, 30+ subreddits, 200+ comments, several users, rules, awards. Lives under `src/data/` as plain JSON so it's easy to extend.
- **Zero build step** — pure HTML / ES modules / CSS variables. Open `index.html` over any static server and it works.
- **Versioned releases** — every milestone is a git tag (`v0.0.0` → `v1.0.0`) so any state is one command away.

## Tech Stack

| Layer       | Choice                                  | Why                                            |
| ----------- | --------------------------------------- | ---------------------------------------------- |
| Markup      | Hand-written HTML5                      | Maximum control, no framework noise.           |
| Styling     | CSS variables + per-component CSS files | Mirrors Reddit's design-token system.           |
| Behavior    | ES2022 modules                          | Native browser support, no transpile needed.   |
| Data        | Static JSON + an in-memory store        | No backend required, easy to inspect / edit.   |
| Tooling     | Node 18+ scripts for dev / lint / test  | Stays close to the platform.                   |

## Project Layout

```
minimax-reddit-clone/
├── index.html                # SPA shell (mounts #app)
├── package.json              # npm scripts
├── .gitignore
├── README.md
├── CHANGELOG.md              # human-friendly release notes
├── public/                   # static assets served at root
├── src/
│   ├── css/                  # design tokens + per-component styles
│   ├── js/
│   │   ├── main.js           # entry, bootstraps router + state
│   │   ├── router.js         # hash-based router
│   │   ├── state.js          # in-memory store (subscribers, vote counts, …)
│   │   ├── api.js            # mock API (reads from /src/data)
│   │   ├── components/       # header, sidebar, post-card, modal, …
│   │   └── utils/            # formatters, dom helpers, icons
│   ├── data/                 # mock JSON (posts, users, subreddits, comments)
│   └── assets/               # inline SVG icons
├── scripts/                  # dev server, lint, test runners
└── docs/
    └── versions/             # one markdown file per release
```

## Quick Start

```bash
# 1. install nothing — pure node scripts
# 2. start a local dev server
npm run dev            # → http://localhost:5173
```

Or open `index.html` from any static server (e.g. `python -m http.server`).

## Versioning

This repo uses [SemVer](https://semver.org/). Every release is a git **annotated tag** that points to a single commit, so any historical state can be checked out with:

```bash
git checkout v0.4.0      # jump to a milestone
git checkout main         # back to head
```

Tag history:

| Tag    | Theme                                                                 |
| ------ | --------------------------------------------------------------------- |
| v0.0.0 | Project skeleton, tooling, README, empty SPA shell.                   |
| v0.1.0 | Top navigation, search, sort bar, view toggle.                        |
| v0.2.0 | Right-rail sidebar (popular communities) + footer.                    |
| v0.3.0 | Home feed with mock posts, vote buttons, subreddit chrome.            |
| v0.4.0 | Post detail page + nested comment tree.                               |
| v0.5.0 | Subreddit page (community info, rules accordion, posts).              |
| v0.6.0 | Login modal, create-post modal, user menu, share dialog.              |
| v1.0.0 | Polish pass: empty states, error boundary, accessibility, perf.       |

## License

MIT
