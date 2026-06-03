# M3 — Backend API Contract (v3.0.0)

> Source of truth for every `/api/*` endpoint. The `server/handlers/*.mjs`
> files implement these, and `src/js/api.js` consumes them. If you
> change a shape here, the contract test (`server/test/contract/*.test.mjs`)
> for that endpoint will fail — that is the intended early warning.

## Conventions

- **Auth:** cookie `rc_sid=<sid>.<sig>` (HttpOnly, SameSite=Lax,
  Secure in production). Login/register/logout all return the user
  object on success and clear the cookie on logout.
- **Response envelope (success):** the resource itself, or a small
  wrapper `{ user }` / `{ users }` / `{ post }` when there are sibling
  fields like `sessionExpiresAt`.
- **Response envelope (error):** `{ error: "<code>", message: "<human>", fields?: { ... } }`. Status codes: 400 invalid, 401 unauthorized, 403 forbidden, 404 not_found, 409 conflict, 500 internal.
- **IDs:** all entity IDs are 26-char ULID TEXT. Authors and
  subreddits are referenced by ID in responses; the SPA joins the
  human-readable name client-side.
- **Timestamps:** ISO 8601 strings.
- **Sort orders:** `best` (default), `hot`, `new`, `top`, `rising`,
  `controversial`. Time range `t`: `all` (default), `hour`, `day`,
  `week`, `month`, `year`.

## Endpoints — v3.0.0 M0/M1 done, M2 in progress

### Auth (M1, done)

| Method | Path | Body | 200 | 4xx |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | `{name,email,password}` | `{user, sessionExpiresAt}`, `Set-Cookie: rc_sid=…` | 400 invalid, 409 conflict |
| POST | `/api/auth/login` | `{name,password}` | `{user, sessionExpiresAt}`, `Set-Cookie: rc_sid=…` | 400 invalid, 401 unauthorized |
| POST | `/api/auth/logout` | – | `{ok:true}`, `Set-Cookie: rc_sid=; Max-Age=0` | – |
| GET  | `/api/auth/me` | – | `{user}` | 401 unauthorized |

### Health (M0, done)

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{ok, db, uptime, version, node}` |

### Subreddits (M2)

| Method | Path | Returns | Notes |
| --- | --- | --- | --- |
| GET | `/api/subreddits` | `Subreddit[]` | `?q=` substring search, `?limit=` (default 100) |
| GET | `/api/subreddits/:name` | `Subreddit` or 404 | `:name` is the bare name (no `r/` prefix) |
| GET | `/api/subreddits/:name/posts` | `Post[]` | `?sort=&t=&limit=&after=` |
| GET | `/api/subreddits/:name/related` | `Subreddit[]` | same category, top N |
| GET | `/api/subreddits/:name/rules` | `Rule[]` | parsed from `rules_json` |

`Subreddit` shape (camelCase, matches the v2.x mock so the SPA needs zero changes):
```json
{
  "id": "s_xxx", "name": "aviation", "display": "Aviation",
  "description": "…", "color": "#ff4500", "iconText": "A",
  "category": "tech", "type": "public",
  "rules": [{"n":1,"title":"Be respectful","description":"…"}],
  "weeklyVisitors": 1234, "weeklyContributors": 56, "members": 7890,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### Posts (M2)

| Method | Path | Returns | Notes |
| --- | --- | --- | --- |
| GET | `/api/posts` | `Post[]` | `?subreddit=&author=&sort=&t=&limit=&after=` (default limit 25) |
| GET | `/api/posts/:id` | `Post` or 404 | `:id` is the ULID |
| GET | `/api/posts/:id/comments` | `Comment[]` | flat list, client builds the tree |
| GET | `/api/posts/:id/related` | `Post[]` | same subreddit, top by score |
| GET | `/api/posts/:id/crossposts` | `Crosspost[]` | from `related.json` `crossposts` |

`Post` shape:
```json
{
  "id": "p_xxx", "subreddit": "aviation", "author": "alice",
  "title": "…", "body": "…", "kind": "text|image|link|video",
  "image": "https://…", "url": "https://…", "domain": "…",
  "flair": "Discussion",
  "score": 1234, "comments": 56,
  "nsfw": false, "spoiler": false, "pinned": false,
  "createdAt": "2026-05-30T12:00:00.000Z"
}
```

Note: `subreddit` and `author` are the bare **name** (not id) to match the
v2.x mock shape. The SPA does the join client-side via `getUser` /
`getSubreddit`. M3+ can change this to `{ subreddit: {id, name}, author: {id, name} }` once the SPA is ready for hydration.

### Users (M2)

| Method | Path | Returns | Notes |
| --- | --- | --- | --- |
| GET | `/api/users/:name` | `User` or 404 | |
| GET | `/api/users/:name/posts` | `Post[]` | submitted by user; `?sort=&t=&limit=&after=` |
| GET | `/api/users/:name/comments` | `Comment[]` | M2 empty (mock has no user comments); real data in M4 |
| GET | `/api/users/:name/overview` | `{posts, comments, saved, hidden, upvoted}` | aggregated counts (M3+) |

`User` shape:
```json
{
  "id": "u_xxx", "name": "alice", "email": "a@x.com",
  "bio": "…", "avatarColor": "#ff4500",
  "karma": 1234, "role": "user",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### Comments (M2 read)

| Method | Path | Returns | Notes |
| --- | --- | --- | --- |
| GET | `/api/posts/:id/comments` | `Comment[]` | flat; SPA builds the tree |
| POST | `/api/posts/:id/comments` | `Comment` | M4 (write) |

`Comment` shape:
```json
{
  "id": "c_xxx", "postId": "p_xxx", "parentId": null,
  "author": "alice", "body": "…",
  "score": 12, "depth": 0, "path": "/c_xxx",
  "createdAt": "2026-05-30T12:00:00.000Z"
}
```

### Search (M2)

| Method | Path | Returns | Notes |
| --- | --- | --- | --- |
| GET | `/api/search?q=…&type=posts&limit=30` | `{posts?, users?, comments?, subreddits?}` | `type` may be a comma-list |

## Endpoints — v3.0.0 M3+ (to be implemented)

### M3 (writes — votes / save / hide) — DONE

All endpoints in this section require auth (401 unauthorized if
anon). 400 invalid on bad body. 404 not_found if the target id
doesn't exist. 403 forbidden on self-vote.

#### Vote semantics

- Client sends the **resolved** new vote state: `direction` is `1`
  (upvote), `-1` (downvote), or `0` (clear). The client computes the
  resolved value from its 4-state machine (`none + up = up`,
  `up + up = none`, `up + down = down`, `down + up = up`, etc.).
- Server looks up the previous row in `post_votes` / `comment_votes`
  and computes `delta = new - prev` (where missing prev is `0`).
- In a single transaction the server:
  1. UPSERTs the `*_votes` row (or DELETEs it for `direction=0`).
  2. Adjusts `posts.score` / `comments.score` by `delta`.
  3. Adjusts the **author's** `users.karma` by `delta` (so upvote
     bumps author karma, downvote drops it, and switching from down
     to up adds 2).
- Self-vote returns 403 — the SPA prevents the call by checking
  `post.author !== state.user.name`, but the backend enforces it.
- Response: `{score, userVote, authorKarma, prev, delta}`.

#### Save / hide semantics

- A single `POST` endpoint toggles the row. Response is the new
  state: `{saved: true|false}` or `{hidden: true|false}`.
- No karma side-effect.
- 404 if the target id doesn't exist.

#### Endpoints

| Method | Path | Body | 200 | 4xx |
| --- | --- | --- | --- | --- |
| POST | `/api/posts/:id/vote` | `{direction: 1\|-1\|0}` | `{score, userVote, authorKarma, prev, delta}` | 400 invalid (bad `direction`), 401 unauthorized, 403 forbidden (self-vote), 404 not_found |
| POST | `/api/comments/:id/vote` | `{direction: 1\|-1\|0}` | same | same |
| POST | `/api/posts/:id/save` | `{}` (empty) | `{saved: true\|false}` | 401 unauthorized, 404 not_found |
| POST | `/api/posts/:id/hide` | `{}` (empty) | `{hidden: true\|false}` | same |

**Deferred to M5+:** comment save / hide (no `saved_comments` table
yet, and the SPA's comment save button is still a MOCK toast);
follow / block / subscribe (these are M5 "social").

### M4 (writes — content) — DONE

All endpoints require auth (401 if anon). 400 invalid on bad
body. 404 not_found when the target (subreddit / post / parent
comment) is missing. 409 conflict on duplicate subreddit name.

#### `POST /api/posts`  — create a new post

Request body:
```json
{
  "subreddit": "technology",   // bare name, no r/ prefix
  "kind": "text" | "link" | "image" | "video",
  "title": "1-300 chars",
  "body": "optional (text posts: required, 1-50000 chars)",
  "url":  "optional (link posts: required, valid URL)",
  "image": "optional (image posts: required, valid URL)"
}
```
Returns 201 with the new `Post` shape (camelCase, `subreddit`
and `author` as bare names, `score=1` from the implicit author
upvote, members count of the subreddit bumped by 1).

#### `POST /api/posts/:id/comments`  — create a comment

Request body:
```json
{ "body": "1-10000 chars", "parentId": "<comment-id> | null" }
```
Returns 201 with the new `Comment` shape, including computed
`path` (`/<id>` for top-level, `<parent.path>/<id>` for replies)
and `depth` (0 for top-level, 1 for a direct reply, …).

#### `POST /api/subreddits`  — create a community

Request body:
```json
{
  "name": "3-21 chars, lowercase letters/digits/underscore",
  "display": "1-50 chars",
  "description": "optional",
  "color": "#hex (default #ff4500)",
  "iconText": "1-4 chars (default first 2 letters of name)",
  "category": "tech|gaming|news|sports|music|movies|books|food|travel|science|art|fashion|finance|other",
  "type":    "public|restricted|private (default public)"
}
```
Returns 201 with the new `Subreddit` shape. 409 conflict on
duplicate name (case-insensitive).

#### `/api/drafts`  — drafts (CRUD, caller-only)

| Method | Path | Body | 200 | 4xx |
| --- | --- | --- | --- | --- |
| POST   | `/api/drafts`        | `{kind, subredditId?, title?, body?}` | `Draft` (201) | 400 invalid |
| PATCH  | `/api/drafts/:id`    | `{title?, body?, kind?, subredditId?}` | `Draft` (ts refreshed) | 400 / 404 (not yours) |
| DELETE | `/api/drafts/:id`    | `{}` | `{ok:true}` | 404 (not yours) |
| GET    | `/api/drafts`        | — | `Draft[]` (newest first, 50 max) | 401 |

A `Draft` is `{id, userId, kind, subredditId, title, body, ts}`.
Caller only — PATCH / DELETE on someone else's draft 404s (so the
endpoint doesn't leak draft ids).

#### `POST /api/reports`  — report content

Request body:
```json
{ "targetKind": "post" | "comment", "targetId": "<id>", "reason": "...", "detail": "optional" }
```
Returns 201 with `{id, ok, targetExists}` — even missing targets
are recorded (so a mod can spot spam waves hitting random ids),
but `targetExists: false` so the M6 mod queue can filter.

**Out of scope for M4:** post / comment **edit** + **delete** (the
UI doesn't surface these yet, the schema has no `deleted_at` /
`edited_at` columns). Deferred to M7 polish or M8 hardening.

### M5 (writes — social) — DONE

All endpoints require auth (401 if anon). 400 invalid on bad
body / bad `action`. 404 not_found when the target (user /
subreddit) is missing. 403 forbidden on self-follow / self-block
/ self-message. The toggle endpoints are idempotent — repeated
`action: "join"` returns `{subscribed: true}` each time without
inserting duplicate rows.

#### Subscribe

`POST /api/subreddits/:name/subscribe`  body `{action: "join" | "leave"}` → 200 `{subscribed, level}`

#### Follow

`POST /api/users/:name/follow`  body `{action: "follow" | "unfollow"}` → 200 `{following}` (403 on self-follow, 404 on missing user)

#### Block (user + subreddit)

| Method | Path | Body | 200 | 4xx |
| --- | --- | --- | --- | --- |
| POST | `/api/users/:name/block`        | `{action: "block" \| "unblock"}` | `{blocked}` | 400 / 403 (self) / 404 |
| POST | `/api/subreddits/:name/block`   | `{action: "block" \| "unblock"}` | `{blocked}` | 400 / 404 |

The DB schema's `CHECK (user_id <> blocked_id)` enforces the
self-block invariant as a backstop; the handler returns 403 first
so the SPA gets a clean error code.

#### Notifications

| Method | Path | Returns | Notes |
| --- | --- | --- | --- |
| GET    | `/api/notifications`                  | `Notification[]` (newest first, 50 max) | `?unread=true` filters, `?limit=` caps |
| POST   | `/api/notifications/:id/read`         | `{ok: true}` | 404 on someone else's id (no leak) |
| POST   | `/api/notifications/mark-all-read`    | `{ok: true, count}` | count = how many rows flipped |

`Notification` shape (camelCase): `{id, userId, kind, sourceKind,
sourceId, read, createdAt}`. `kind` is one of `reply` / `upvote`
/ `follow` / `mention` / `mod` / `award`. The trigger that
**creates** a notification row lives outside M5 — that's wired in
M6 (e.g. comment-create fires a `reply` notification, vote fires
`upvote`, follow fires `follow`).

#### Messages

| Method | Path | Body | 200 | 4xx |
| --- | --- | --- | --- | --- |
| GET  | `/api/messages?box=inbox\|sent` | — | `Message[]` (newest first, 100 max) | 400 (bad box) |
| POST | `/api/messages`                 | `{to, subject, body}` | `Message` (201) | 400 / 403 (self) / 404 (recipient) |

`Message` shape: `{id, from, to, subject, body, read, createdAt}`
where `from` / `to` are bare usernames (not ids).

### M6 (admin / safety) — DONE

All endpoints require auth (401 if anon) AND the caller's
`users.role = "admin"` (403 otherwise). The role gate is enforced
in `server/handlers/admin.mjs`'s `requireAdmin(ctx)` helper.

#### Notification triggers (write side of M5's read API)

M5 shipped `GET /api/notifications` but the trigger side was M6.
Three existing handlers now fire notif rows on every state change
that warrants one:

| Trigger                     | Kind     | Source kind | Source id      | Dedup |
| --------------------------- | -------- | ----------- | -------------- | ----- |
| `POST /api/posts/:id/comments` (top-level) | `reply` | `post`    | the post id    | `(recipient, "reply", postId)` |
| `POST /api/posts/:id/comments` (with parentId) | `reply` | `comment` | the parent cmt id | `(recipient, "reply", parentId)` |
| `POST /api/posts/:id/vote`     | `upvote` | `post`    | the post id    | `(recipient, "upvote", postId)` |
| `POST /api/comments/:id/vote`  | `upvote` | `comment` | the comment id | `(recipient, "upvote", commentId)` |
| `POST /api/users/:name/follow` (action=follow) | `follow` | `user` | the follower's user id | `(recipient, "follow", followerId)` |

Self-actions never fire (self-reply, self-vote is already 403,
self-follow is already 403). `direction: 0` on a vote (clear) is
a no-op for notifs (delta = 0 path doesn't fire).

Dedup is `(user_id, kind, source_kind, source_id)` via an O(log n)
SELECT-then-INSERT in `server/lib/notifications.mjs`. No UNIQUE
index needed because the dedup is per-call race-safe enough (a
concurrent vote from the same user is an edge case that just
leaves a single row either way).

#### Migration 0002_moderation.sql

Adds the columns the mod queue reads:

```sql
ALTER TABLE posts    ADD COLUMN removed_at TEXT;
ALTER TABLE posts    ADD COLUMN removed_by TEXT REFERENCES users(id);
ALTER TABLE comments ADD COLUMN removed_at TEXT;
ALTER TABLE comments ADD COLUMN removed_by TEXT REFERENCES users(id);
ALTER TABLE reports  ADD COLUMN resolved_at TEXT;
ALTER TABLE reports  ADD COLUMN resolved_by TEXT REFERENCES users(id);
ALTER TABLE reports  ADD COLUMN resolution   TEXT;  -- 'dismissed' | 'removed'
```

Idempotent: tracked by `migrations/_migrations` table, so running
the migration on an already-M6'd DB is a no-op.

#### Mod queue endpoints

| Method | Path | Body | 200 | 4xx |
| --- | --- | --- | --- | --- |
| GET  | `/api/admin/reports`                 | — | `Report[]` (default: unresolved only, newest first, 200 max) | 401 / 403 |
| GET  | `/api/admin/reports?resolved=true`  | — | includes resolved reports too | 401 / 403 |
| POST | `/api/admin/reports/:id/resolve`     | `{action: "dismiss" \| "remove_content"}` | `{ok: true, id, action}` | 400 bad action / 401 / 403 / 404 / 409 already-resolved |

`action: "dismiss"` — marks the report resolved, leaves content
visible.
`action: "remove_content"` — marks the report resolved AND sets
`posts.removed_at` / `posts.removed_by` (or comments.*) so the
public read API can filter it out (M7 will wire the filter; for
M6 the flag is set, but `/api/posts/:id` and
`/api/posts/:id/comments` still return removed content — the
SPA doesn't have a "removed" UI yet).

`Report` shape:
```json
{
  "id": "r_xxx",
  "reporter": "alice",
  "targetKind": "post",
  "targetId": "p_xxx",
  "targetAuthor": "bob",
  "targetRemoved": false,
  "reason": "spam",
  "detail": "",
  "resolved": false,
  "resolvedAt": null,
  "resolvedBy": null,
  "resolution": null,
  "createdAt": "2026-06-02T05:14:00.000Z"
}
```

**Out of scope for M6:** admin user mgmt (ban / suspend / promote),
removed-content filtering in public read APIs, mod-assigned
notifications (e.g. "your post was removed" notif to the
offending user). Deferred to M7/M8.

### M7 (polish) — DONE

#### Removed-content filter (the second half of M6's "set the flag" half)

M6's `remove_content` action sets `posts.removed_at` /
`posts.removed_by` (or comments.*). M7 wires the **read side** so
those flags actually hide the content from public API consumers:

| Endpoint                                          | Behavior with `removed_at` set |
| ------------------------------------------------- | ------------------------------ |
| `GET /api/posts`                                  | removed post NOT in list |
| `GET /api/posts/:id`                              | **404** (not 410; no info leak) |
| `GET /api/posts/:id/comments`                     | **404** (the post is gone; the comment list is part of its public view) |
| `GET /api/posts/:id/related`                      | **404** (the source for "related" is gone) |
| `GET /api/subreddits/:name/posts`                 | removed post NOT in subreddit feed |
| `GET /api/users/:name/posts`                      | removed post NOT in user profile |
| `GET /api/search?type=posts`                      | removed post NOT in search results |
| `Post.comments` field on a visible post           | excludes removed comments (subquery filter) |
| `POST /api/posts/:id/vote` / `save` / `hide`      | **404** (the target is gone) — mod can still inspect via DB |

The 404 instead of 410 is deliberate: a 410 would tell an attacker
"this id existed and was removed" vs "this id never existed" — same
404 for both is a small information-leak hardening.

Implementation: each handler that reads posts / comments appends
`AND p.removed_at IS NULL` (or `c.removed_at IS NULL`) to the
WHERE clause. The `POST_JOIN` macro in `posts.mjs` and `users.mjs`
also embeds `WHERE ... removed_at IS NULL` inside the
`comments_count` subquery so the displayed count matches the
public comment list (a removed comment is gone from both).

**Out of scope for M7:** the SPA doesn't yet surface a "removed
content" placeholder to admin users (a mod who visits a
removed post via the URL just sees 404 like everyone else). A
"view as mod" toggle is deferred to M8.

#### SPA: dark mode (auto / light / dark)

`state.theme` is one of `"auto" | "light" | "dark"`. The new
`src/js/utils/theme.js` module subscribes to state changes and
sets `<html data-theme="light|dark">` (or removes the attribute
for auto). The CSS in `src/css/variables.css` defines the dark
token set under `[data-theme="dark"]`, plus a fallback
`@media (prefers-color-scheme: dark)` block for auto-mode users
who haven't picked explicitly.

Theme toggle lives in the header (icon button next to the user
menu) with a 3-option dropdown: 跟随系统 / 浅色 / 深色. The icon
flips sun ↔ moon based on the resolved theme.

#### SPA: admin / mod queue page

`#/admin` route (admin only — the page bounces non-admins with a
"需要管理员权限" empty state). Uses the M6 endpoints:
- `GET /api/admin/reports[?resolved=true]` — list
- `POST /api/admin/reports/:id/resolve` — dismiss / remove_content
buttons render inline per row. The "unresolved / resolved" tab
switches the filter. Admins get a "管理面板" entry in their user
menu (in `components/header.js`).

#### SPA: mobile responsive

Added a `< 600px` @media block in `src/css/shell.css` that:
- Shrinks the header search box
- Hides the word "reddit" next to the logo
- Reduces main padding from `var(--spacer-4)` to `var(--spacer-2)`
- Hides the "评论" / domain sublabels on each post action row
  (saves ~50px per card on the home feed)

The `< 960px` block (already in v2.x) hides the left nav and the
right rail, so phones get a single-column feed. The hamburger
drawer was already wired in v2.x.

## Sort/filter algorithm (canonical)

Server-side sort/filter matches the v2.x mock exactly so the SPA
behaves identically. Pseudo-code for `listPosts`:

```js
const SORTS = {
  best:   (a, b) => b.score - a.score,
  hot:    (a, b) => (b.score / Math.max(1, hoursSince(b.createdAt) + 2))
                 - (a.score / Math.max(1, hoursSince(a.createdAt) + 2)),
  new:    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  top:    (a, b) => b.score - a.score,
  rising: (a, b) => (b.comments - a.comments) - (a.comments - b.comments),
  controversial: (a, b) => Math.abs(b.score) - Math.abs(a.score),  // simplified
};
const T_RANGES_MS = { hour: 3600e3, day: 86400e3, week: 7*86400e3, month: 30*86400e3, year: 365*86400e3 };
```

Pagination uses `?limit=&after=<postId>` (cursor, not offset) so
inserts don't shift pages.
