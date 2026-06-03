// server/handlers/users.mjs
// /api/users/:name, /api/users/:name/posts, /api/users/:name/comments

import { sendError, sendJson } from "../lib/errors.mjs";
import { sortPosts, applyTimeRange } from "../lib/posts.mjs";
import { requireAuth } from "../middleware/auth-required.mjs";

function shapeUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    bio: u.bio || "",
    avatarColor: u.avatar_color,
    karma: u.karma,
    role: u.role,
    createdAt: u.created_at,
  };
}

function selectUserByName(ctx, name) {
  return ctx.db.prepare("SELECT * FROM users WHERE name = ? COLLATE NOCASE").get(name);
}

function shapePost(p) {
  return {
    id: p.id, subreddit: p.subreddit_name, author: p.author_name,
    title: p.title, body: p.body || "", kind: p.kind,
    image: p.image, url: p.url, domain: p.domain,
    flair: p.flair, score: p.score, comments: p.comments_count || 0,
    nsfw: !!p.nsfw, spoiler: !!p.spoiler, pinned: !!p.pinned,
    createdAt: p.created_at,
  };
}

function shapeComment(c) {
  return {
    id: c.id, postId: c.post_id, parentId: c.parent_id,
    author: c.author_name,
    body: c.body, score: c.score,
    depth: c.depth, path: c.path,
    createdAt: c.created_at,
  };
}

const POST_JOIN = `
  SELECT p.*, u.name AS author_name, s.name AS subreddit_name,
         (SELECT COUNT(*) FROM comments cm
            WHERE cm.post_id = p.id AND cm.removed_at IS NULL) AS comments_count
    FROM posts p
    JOIN users u       ON u.id = p.author_id
    JOIN subreddits s  ON s.id = p.subreddit_id
`;

export function registerUsers(router) {
  router.get("/api/users/:name", (req, res, ctx, params) => {
    const u = selectUserByName(ctx, params.name);
    if (!u) return sendError(res, "not_found", `user ${params.name} not found`);
    sendJson(res, shapeUser(u));
  });

  router.get("/api/users/:name/posts", (req, res, ctx, params) => {
    const u = selectUserByName(ctx, params.name);
    if (!u) return sendError(res, "not_found", `user ${params.name} not found`);
    const url = new URL(req.url, "http://localhost");
    const sort = url.searchParams.get("sort") || "hot";
    const t = url.searchParams.get("t") || "all";
    const limit = Math.min(Number(url.searchParams.get("limit")) || 25, 100);
    const rows = ctx.db.prepare(`${POST_JOIN} WHERE p.author_id = ? AND p.removed_at IS NULL`).all(u.id);
    const filtered = applyTimeRange(rows, t);
    const sorted = sortPosts(filtered, sort);
    sendJson(res, sorted.slice(0, limit).map(shapePost));
  });

  // ── M8.audit (N2): GET /api/posts/saved + /api/posts/hidden ──
  // Lists the caller's saved / hidden posts so they survive a new
  // device login (the local-only state.saved/state.hidden arrays
  // are only on this device). 401 if not logged in.
  router.get("/api/posts/saved", (req, res, ctx) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    const rows = ctx.db.prepare(`
      SELECT p.*, u.name AS author_name, s.name AS subreddit_name,
             (SELECT COUNT(*) FROM comments cm
                WHERE cm.post_id = p.id AND cm.removed_at IS NULL) AS comments_count
        FROM saved_posts sp
        JOIN posts p       ON p.id = sp.post_id
        JOIN users u       ON u.id = p.author_id
        JOIN subreddits s  ON s.id = p.subreddit_id
       WHERE sp.user_id = ? AND p.removed_at IS NULL
       ORDER BY sp.created_at DESC
       LIMIT 200
    `).all(ctx.user.id);
    sendJson(res, rows.map(shapePost));
  });

  router.get("/api/posts/hidden", (req, res, ctx) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    const rows = ctx.db.prepare(`
      SELECT p.*, u.name AS author_name, s.name AS subreddit_name,
             (SELECT COUNT(*) FROM comments cm
                WHERE cm.post_id = p.id AND cm.removed_at IS NULL) AS comments_count
        FROM hidden_posts hp
        JOIN posts p       ON p.id = hp.post_id
        JOIN users u       ON u.id = p.author_id
        JOIN subreddits s  ON s.id = p.subreddit_id
       WHERE hp.user_id = ? AND p.removed_at IS NULL
       ORDER BY hp.created_at DESC
       LIMIT 200
    `).all(ctx.user.id);
    sendJson(res, rows.map(shapePost));
  });

  router.get("/api/users/:name/comments", (req, res, ctx, params) => {
    const u = selectUserByName(ctx, params.name);
    if (!u) return sendError(res, "not_found", `user ${params.name} not found`);
    const rows = ctx.db.prepare(`
      SELECT c.*, ur.name AS author_name
        FROM comments c
        JOIN users ur ON ur.id = c.author_id
       WHERE c.author_id = ?
       ORDER BY c.created_at DESC LIMIT 50
    `).all(u.id);
    sendJson(res, rows.map(shapeComment));
  });
}
