# minimax-reddit-clone

A high-fidelity Reddit clone. Vanilla-JS SPA + Node 22 HTTP backend +
SQLite (`node:sqlite`). **Zero npm dependencies at runtime** — the
whole repo clones and runs without `npm install`.

> **Why this exists**
> - v3.0.0 rewrote the backend (v2.x was a pure SPA on mock JSON).
>   The frontend shell, FSM, and component structure stayed
>   compatible; only `src/js/api.js` swapped from reading
>   `src/data/*.json` to fetching `/api/*`.
> - All design tokens live as CSS variables — dark mode is one
>   `[data-theme="dark"]` block in `src/css/variables.css`.

## Highlights

- **Full Reddit surface area in a single Node process** — auth,
  posts, comments, votes, save/hide, subscriptions, follow,
  block, notifications, direct messages, mod queue, drafts.
- **Real Karma triggers** — voting in a single SQLite transaction
  applies the delta to `posts.score` and `users.karma`
  atomically (no drift).
- **M5 social graph + M6 mod actions + M7 dark mode / admin
  page** are all wired in.
- **Production-grade deploy** — `Dockerfile` + `docker-compose.yml`
  + systemd unit + nginx + TLS + SQLite `sqlite3 .backup` cron
  (see `docs/DEPLOY.md`).
- **126-case contract test suite** (auth / interactions / content
  / social / admin / removed-content) + 5 in-process smoke
  scripts + an end-to-end pipeline test (`scripts/_e2e.mjs`).

## Tech Stack

| Layer      | Choice                                | Why                                       |
| ---------- | ------------------------------------- | ----------------------------------------- |
| Runtime    | **Node 22 LTS** (>=22.5)              | Built-in `node:sqlite`, no native binding |
| HTTP       | Hand-rolled router on `node:http`     | Zero deps; no Express / no helmet         |
| Database   | Built-in `node:sqlite`, single file   | WAL mode; trivially backable              |
| Sessions   | scrypt + per-user salt + HMAC cookie  | OWASP-grade without JWT                   |
| Frontend   | Vanilla JS + ESM + hash router (kept) | FSM + components from v2.x, 100% reused  |
| Migrations | `migrations/NNNN_*.sql` + `scripts/migrate.mjs` | Idempotent, tracked in `_migrations` table |
| Tests      | `node:test` + `node --test`           | Zero deps                                  |

## Quick Start (vibe coding mode)

```bash
# 0. need Node 22.5 or later (nvm install 22 && nvm use 22)
node --version          # must show v22.5+

# 1. clone and run — no `npm install` needed
git clone https://github.com/peckerpro/minimax-reddit-clone.git
cd minimax-reddit-clone
npm run dev            # → http://localhost:5173
#  - first boot auto-creates data/reddit.db
#  - if the DB is empty, seeds from src/data/*.json (24 users / 25 subs / 40 posts)
#  - listens on $PORT (default 5173, auto-falls-back via scripts/serve.mjs)

# 2. reset the DB (DESTRUCTIVE — wipes your writes, re-seeds from JSON)
npm run reset

# 3. (optional) production deploy
docker compose up -d    # SESSION_SECRET=...  env required
# see docs/DEPLOY.md for systemd + nginx + TLS + SQLite backup
```

## npm scripts

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm start`         | `node server/index.mjs` (production-style)                |
| `npm run dev`       | `node scripts/serve.mjs` (auto-port + runs migrations)   |
| `npm run migrate`   | Apply pending SQL migrations + seed from `src/data/*.json` if empty |
| `npm run reset`     | Delete `data/reddit.db` and re-migrate (DESTRUCTIVE)     |
| `npm test`          | `lint` + `test` (in-process; no server)                   |
| `npm run api-test`  | SPA-side API contract via the fetch stub                   |
| `npm run contract`   | All 6 server-side contract test files (126 cases)        |
| `npm run smoke`      | 5 in-process smoke scripts (m2 / m3 / m4 / m5 / m6)      |
| `npm run e2e`        | Full pipeline test: register → post → vote → comment → report → mod resolves |
| `npm run bench`      | Perf baseline (p50/p95/p99/rps per endpoint)              |
| `npm run build`      | Placeholder — no bundling step (zero deps)                |

## Project Layout

```
minimax-reddit-clone/
├── index.html                  # SPA shell
├── package.json                # npm scripts (no runtime deps)
├── Dockerfile + docker-compose.yml    # production deploy
├── README.md
├── CHANGELOG.md
├── docs/
│   ├── M3_BACKEND.md           # full API contract (every endpoint)
│   ├── DEPLOY.md               # systemd + nginx + TLS + SQLite backup
│   ├── V3_PLAN.md              # v3.0.0 master plan (M0–M8)
│   ├── REDDIT_FSM.md           # upstream Reddit FSM baseline
│   ├── STATE_MACHINE.md        # SPA's UI state machine (v2.1.0)
│   └── versions/               # one .md per release
├── migrations/                 # SQL schema (idempotent)
│   ├── 0001_init.sql           # 19 tables (users, sessions, posts, comments, votes, ...)
│   ├── 0002_moderation.sql     # removed_at / resolved_at on posts / comments / reports
│   └── 0003_notif_dedup.sql    # UNIQUE index on notifications (M8.audit B2)
├── server/                     # Node 22 backend
│   ├── index.mjs               # entry: serve frontend + /api/*
│   ├── router.mjs              # method+path matcher + middleware chain
│   ├── db.mjs                  # node:sqlite handle + tx() helper
│   ├── auth.mjs                # scrypt + HMAC session
│   ├── handlers/               # 9 modules: auth, posts, users, subreddits, content, ...
│   ├── lib/                    # errors, ulid, body, notifications
│   └── middleware/             # auth-required, rate-limit
├── src/                        # vanilla-JS SPA (unchanged from v2.x except api.js)
│   ├── js/
│   │   ├── main.js             # router + boot (theme, /me, etc)
│   │   ├── api.js              # M2.5+: fetch('/api/*')  instead of JSON files
│   │   ├── auth.js             # register / login / me / logout
│   │   ├── state.js            # single source of truth (persisted to localStorage)
│   │   ├── components/         # header, sidebar, post-card, vote-column, admin, ...
│   │   └── utils/              # dom, format, icons, theme
│   ├── css/                    # design tokens + per-component styles + admin + dark mode
│   └── data/                   # seed JSON (read on first boot only)
├── scripts/                    # dev tooling
│   ├── serve.mjs               # auto-port dev server
│   ├── migrate.mjs             # apply migrations + seed
│   ├── reset-db.mjs            # wipe data/reddit.db
│   ├── health.mjs              # probe /api/health
│   ├── lint.mjs / test.mjs    # in-process gates
│   ├── api-test.mjs            # SPA fetch-stub regression
│   ├── _smoke-m2..m6.mjs       # per-milestone in-process smoke
│   ├── _e2e.mjs                # end-to-end pipeline
│   ├── _bench.mjs              # perf baseline
│   └── test/contract/          # 6 contract test files
└── data/                       # runtime SQLite (gitignored)
    └── reddit.db
```

## Versioning

This repo uses [SemVer](https://semver.org/). v3.0.0 is a **major**
because the backend is a real network service (v2.x was a pure SPA).
v3.x.x is the v3 line; the current HEAD is `v3.0.0`.

| Tag    | Theme                                                              |
| ------ | ------------------------------------------------------------------ |
| v2.1.0 | FSM-aligned SPA on mock JSON                                       |
| v3.0.0 | **Full-stack**: real backend, real auth, real persistence, dark mode, admin page, hardening |

## License

MIT
