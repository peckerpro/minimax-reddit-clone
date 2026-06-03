// server/handlers/posts.mjs
// /api/posts, /api/posts/:id, /api/posts/:id/comments,
// /api/posts/:id/related, /api/posts/:id/crossposts

import { sendError, sendJson } from "../lib/errors.mjs";
import { sortPosts, applyTimeRange } from "../lib/posts.mjs";

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
         (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comments_count
    FROM posts p
    JOIN users u       ON u.id = p.author_id
    JOIN subreddits s  ON s.id = p.subreddit_id
`;

export function registerPosts(router) {
  router.get("/api/posts", (req, res, ctx) => {
    const url = new URL(req.url, "http://localhost");
    const subreddit = url.searchParams.get("subreddit") || "";
    const author = url.searchParams.get("author") || "";
    const sort = url.searchParams.get("sort") || "best";
    const t = url.searchParams.get("t") || "all";
    const limit = Math.min(Number(url.searchParams.get("limit")) || 25, 100);
    const after = url.searchParams.get("after") || null;
    const filters = [];
    const params = [];
    if (subreddit) {
      filters.push("s.name = ? COLLATE NOCASE");
      params.push(subreddit.replace(/^r\//, ""));
    }
    if (author) {
      filters.push("u.name = ? COLLATE NOCASE");
      params.push(author.replace(/^u\//, "").replace(/^u_/, ""));
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = ctx.db.prepare(`${POST_JOIN} ${where}`).all(...params);
    const filtered = applyTimeRange(rows, t);
    const sorted = sortPosts(filtered, sort);
    let idx = 0;
    if (after) {
      const found = sorted.findIndex((r) => r.id === after);
      if (found >= 0) idx = found + 1;
    }
    sendJson(res, sorted.slice(idx, idx + limit).map(shapePost));
  });

  router.get("/api/posts/:id", (req, res, ctx, params) => {
    const row = ctx.db.prepare(`${POST_JOIN} WHERE p.id = ?`).get(params.id);
    if (!row) return sendError(res, "not_found", `post ${params.id} not found`);
    sendJson(res, shapePost(row));
  });

  router.get("/api/posts/:id/comments", (req, res, ctx, params) => {
    const exists = ctx.db.prepare("SELECT 1 FROM posts WHERE id = ?").get(params.id);
    if (!exists) return sendError(res, "not_found", `post ${params.id} not found`);
    const rows = ctx.db.prepare(`
      SELECT c.*, u.name AS author_name
        FROM comments c
        JOIN users u ON u.id = c.author_id
       WHERE c.post_id = ?
       ORDER BY c.created_at ASC
    `).all(params.id);
    sendJson(res, rows.map(shapeComment));
  });

  router.get("/api/posts/:id/related", (req, res, ctx, params) => {
    const url = new URL(req.url, "http://localhost");
    const n = Math.min(Number(url.searchParams.get("n")) || 4, 30);
    const post = ctx.db.prepare("SELECT subreddit_id FROM posts WHERE id = ?").get(params.id);
    if (!post) return sendError(res, "not_found", `post ${params.id} not found`);
    const rows = ctx.db.prepare(`
      ${POST_JOIN}
       WHERE p.subreddit_id = ? AND p.id <> ?
       ORDER BY p.score DESC LIMIT ?
    `).all(post.subreddit_id, params.id, n);
    sendJson(res, rows.map(shapePost));
  });

  router.get("/api/posts/:id/crossposts", (req, res, ctx, params) => {
    // No dedicated table for crossposts in M2; return empty list.
    // v2.x mock pulled from related.json.crossposts. Will populate
    // from a `crossposts` table in M3+.
    sendJson(res, []);
  });
}
