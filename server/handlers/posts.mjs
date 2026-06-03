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

// M7: filter removed posts + removed comments from the public read
// API. The "removed" check is enforced in the WHERE clause the caller
// appends, so POST_JOIN stays a pure FROM+JOIN block.
//
// We can't add `AND cm.removed_at IS NULL` inside the comments_count
// subquery if POST_JOIN also embeds a `WHERE p.removed_at IS NULL` —
// the resulting SQL would have two WHERE clauses. So the subquery
// filters at the call site too (see listComments for the comment-side
// version that filters by `c.removed_at IS NULL`).
// M7: filter removed posts + removed comments from the public read
// API. The "removed" check on the post is enforced in the WHERE
// clause the caller appends (so POST_JOIN stays a pure FROM+JOIN
// block — adding `WHERE p.removed_at IS NULL` here would conflict
// with the caller's appended WHERE). The comments_count subquery
// does have its own WHERE since subqueries are independent of the
// outer query's WHERE.
const POST_JOIN = `
  SELECT p.*, u.name AS author_name, s.name AS subreddit_name,
         (SELECT COUNT(*) FROM comments cm
            WHERE cm.post_id = p.id AND cm.removed_at IS NULL) AS comments_count
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
    const filters = ["p.removed_at IS NULL"];
    const params = [];
    if (subreddit) {
      filters.push("s.name = ? COLLATE NOCASE");
      params.push(subreddit.replace(/^r\//, ""));
    }
    if (author) {
      filters.push("u.name = ? COLLATE NOCASE");
      params.push(author.replace(/^u\//, "").replace(/^u_/, ""));
    }
    const where = `WHERE ${filters.join(" AND ")}`;
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
    // Filter removed_at: returns 404 so the SPA can't tell removed
    // from never-existed (no information leak).
    const row = ctx.db.prepare(`${POST_JOIN} WHERE p.id = ? AND p.removed_at IS NULL`).get(params.id);
    if (!row) return sendError(res, "not_found", `post ${params.id} not found`);
    sendJson(res, shapePost(row));
  });

  router.get("/api/posts/:id/comments", (req, res, ctx, params) => {
    // If the post itself is removed, 404 — the comment list is part
    // of the public view of the post.
    const exists = ctx.db.prepare("SELECT 1 FROM posts WHERE id = ? AND removed_at IS NULL").get(params.id);
    if (!exists) return sendError(res, "not_found", `post ${params.id} not found`);
    const rows = ctx.db.prepare(`
      SELECT c.*, u.name AS author_name
        FROM comments c
        JOIN users u ON u.id = c.author_id
       WHERE c.post_id = ? AND c.removed_at IS NULL
       ORDER BY c.created_at ASC
    `).all(params.id);
    sendJson(res, rows.map(shapeComment));
  });

  router.get("/api/posts/:id/related", (req, res, ctx, params) => {
    const url = new URL(req.url, "http://localhost");
    const n = Math.min(Number(url.searchParams.get("n")) || 4, 30);
    const post = ctx.db.prepare("SELECT subreddit_id FROM posts WHERE id = ? AND removed_at IS NULL").get(params.id);
    if (!post) return sendError(res, "not_found", `post ${params.id} not found`);
    const rows = ctx.db.prepare(`
      ${POST_JOIN}
       WHERE p.subreddit_id = ? AND p.id <> ? AND p.removed_at IS NULL
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
