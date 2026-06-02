# AGENTS.md — project memory for `minimax-reddit-clone`

> Read this before doing any non-trivial work on the repo. The user (Pecker)
> iterates quickly: every patch should ship a working SPA, leave the
> repo runnable, and prove it via `node scripts/api-test.mjs` and
> `node scripts/walk.mjs`.

## What this repo is

A high-fidelity, vanilla-JS front-end clone of reddit.com. Zero npm
dependencies at runtime (Node 18+ built-ins only). Mock data for posts,
users, comments, subreddits, rules, related, awards — no real backend.

## Running

```bash
npm run dev          # auto-picks 5173 (or 5174+) and serves from project root
```

The dev server (`scripts/serve.mjs`) auto-finds a free port. Open
`http://localhost:5173/` (or whatever it printed). Hard-refresh
(`Ctrl+Shift+R`) after editing any CSS/JS — no HMR.

## Verification scripts (all must pass before commit)

| Script | Catches | Status |
| --- | --- | --- |
| `node scripts/lint.mjs`  | file non-empty, balanced braces | always |
| `node scripts/test.mjs`  | JSON parse + file-read | always |
| `node scripts/walk.mjs`  | 404 in the SPA import graph (URL-level) | always |
| `node scripts/api-test.mjs` | every public API method returns correct shape (Array / null / object) | **always — added in v2.0.1 after the double-destructure bug** |
| `node scripts/smoke.mjs` | dev server up + key assets 200 | only when server is running |

If you change `src/js/api.js` or any mock JSON, run `api-test.mjs` AND
`walk.mjs`. The `walk.mjs` script has a known false-positive on template
literals in `api.js` (`/src/data/$%7Bname%7D.json`) — ignore that one.

## Architectural gotchas

### `api.js` JSON shape double-destructure trap

The mock JSON files have a top-level wrapper key. When loading them,
destructure ONCE — do not re-access the inner property:

```js
// ✅ correct
const { comments } = await load("comments");
return delay(comments.filter((c) => c.postId === postId));

// ❌ WRONG — `comments.comments` is undefined
const { comments } = await load("comments");
return delay(comments.comments.filter((c) => c.postId === postId));
```

This pattern is what broke v2.0.0 (the post-detail page crashed silently,
appearing as a blank page). `api-test.mjs` exists specifically to
catch this class of bug.

### Hash router (no real backend, no history API)

`src/js/router.js` is a hash-only router. `window.location.hash`
mutations are how the SPA navigates. All `<a href="#/...">` links
work; programmatic navigation uses `location.hash = "#/..."` or
`router.navigate("#/...")`. The user (a Reddit user) sometimes sees
hash URLs as "weird" — that's a real Reddit behavior, not a bug.

### State persistence

`src/js/state.js` writes the entire state to `localStorage` on every
change (key: `reddit-clone::state::v2`). On boot, the state is
rehydrated. If you change the state's field names, bump the key
suffix to force a fresh start for existing users.

## Release workflow (per version)

1. Edit code.
2. `node scripts/lint.mjs && node scripts/test.mjs && node scripts/api-test.mjs` — all green.
3. `git add -A && git commit -m "vX.Y.Z: <theme>"`.
4. `git tag -a vX.Y.Z -m "vX.Y.Z: <theme>"`.
5. `git push origin main && git push origin vX.Y.Z`.
6. Bump `package.json` version field.
7. Write `docs/versions/vX.Y.Z.md` (changelog).
8. Update `CHANGELOG.md` top entry.

Versions follow [SemVer](https://semver.org/). Patch versions (vX.Y.Z)
are regression fixes. Minor versions (vX.Y.0) ship features.

## Files that need extra care

- `src/js/api.js` — every method has a known-input/known-output contract;
  covered by `api-test.mjs`.
- `src/js/components/left-nav.js` — collapsible sidebar; the collapse
  state is persisted to `state.leftNavCollapsed`. The `state.subscribe`
  pattern in this file is the model for other auto-redraw components.
- `src/js/components/dropdown.js` — the dropdown primitive actually
  replaces the trigger with a `.dd` wrapper in the DOM. If you write
  a new dropdown, import this primitive rather than rolling your own.
- `src/data/related.json` — multi-purpose: cross-posts, awards, share
  targets, report reasons, related-posts map. Don't split into multiple
  files just for cleanliness — it's a "domain knowledge" file.
- `docs/analysis/STATE_MACHINE.md` — the canonical FSM. **v2.1.0**: 30
  states with full implementation (no more toast-stub placeholders).
  Every `router.add(...)` in `src/js/main.js` is annotated with a
  `// State: S_xxx` line on the previous line; do a
  `grep -nE "// State: S_" src/js/main.js` to map the route table to the
  FSM one-to-one. When you add a state, append a row to the symbol table
  in `STATE_MACHINE.md` and add a comment to the matching `router.add`.

### v2.1.0 silent-failure trap (read this before touching `main.js`)

The `/r/:name` route used to do this:

```js
// ❌ WRONG — main.js:76 in v2.0.x
const result = await SubredditPage({ name: location.pathname.split("/r/")[1].split("/")[0] });
```

This is a **hash router**, so `location.pathname` is always `/` (the
served `index.html`). The expression evaluates to `undefined.split(...)`
→ `TypeError`. The error was swallowed by `runRoute()` and the user just
saw the home content where the subreddit should be. Always use
`params.name` from the route handler. The same fix applies to any
similar look-the-URL-up-manually code: read from `params`, not from
`location`.

## What's NOT in scope

- Real Reddit API integration — never.
- Build tools (webpack, vite, esbuild) — we explicitly chose vanilla
  + ESM. Don't add a bundler without user approval.
- TypeScript — keep the codebase vanilla JS. The user prefers dynamic
  prototyping speed over compile-time safety.
- A real database — all data is mock JSON in `src/data/`.
