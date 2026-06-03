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

### M3 (writes — votes / saved / hidden)
- `POST /api/posts/:id/vote` `{value: ±1}` → `{score, userVote}`
- `DELETE /api/posts/:id/vote`
- `POST /api/comments/:id/vote` `{value: ±1}`
- `DELETE /api/comments/:id/vote`
- `POST /api/posts/:id/save` / `DELETE`
- `POST /api/posts/:id/hide` / `DELETE`
- `POST /api/subreddits/:name/join` / `DELETE`
- `POST /api/users/:name/follow` / `DELETE`
- `POST /api/users/:name/block` / `DELETE`
- `POST /api/subreddits/:name/block` / `DELETE`

### M4 (writes — content)
- `POST /api/posts` `{subredditId, kind, title, body, …}` → `Post`
- `POST /api/posts/:id/comments` `{parentId?, body}` → `Comment`
- `POST /api/drafts` / `PATCH /api/drafts/:id` / `DELETE /api/drafts/:id`
- `POST /api/reports` `{targetKind, targetId, reason, detail}`

### M5 (social)
- `GET /api/notifications` (unauth → 401)
- `POST /api/notifications/:id/read`
- `POST /api/notifications/mark-all-read`
- `GET /api/messages?box=inbox|sent`
- `POST /api/messages` `{to, subject, body}`

### M6 (admin / safety)
- `GET /api/admin/reports` (admin only)
- `POST /api/admin/reports/:id/resolve`

### M8 (economy)
- `GET /api/coins/balance` → `{balance}`
- `POST /api/coins/purchase` `{packId}` → mock stripe
- `POST /api/awards/give` `{target, awardId}` → `{success, balance}`

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
