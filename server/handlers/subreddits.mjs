// server/handlers/subreddits.mjs
// /api/subreddits, /api/subreddits/:name, /api/subreddits/:name/posts,
// /api/subreddits/:name/related, /api/subreddits/:name/rules

import { sendError, sendJson } from "../lib/errors.mjs";
import { sortPosts, applyTimeRange, paginate } from "../lib/posts.mjs";

function shapeSubreddit(row) {
  return {
    id: row.id,
    name: row.name,
    display: row.display,
    description: row.description,
    color: row.color,
    iconText: row.icon_text,
    category: row.category,
    type: row.type,
    rules: row.rules_json ? JSON.parse(row.rules_json) : [],
    weeklyVisitors: row.weekly_visitors,
    weeklyContributors: row.weekly_contributors,
    members: row.members,
    createdAt: row.created_at,
  };
}

function selectSubredditByName(ctx, name) {
  return ctx.db.prepare("SELECT * FROM subreddits WHERE name = ? COLLATE NOCASE").get(name);
}

export function registerSubreddits(router) {
  router.get("/api/subreddits", (req, res, ctx) => {
    const url = new URL(req.url, "http://localhost");
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 200);
    let rows;
    if (q) {
      rows = ctx.db.prepare(`
        SELECT * FROM subreddits
        WHERE LOWER(name) LIKE ? OR LOWER(display) LIKE ?
        ORDER BY members DESC LIMIT ?
      `).all(`%${q}%`, `%${q}%`, limit);
    } else {
      rows = ctx.db.prepare(`SELECT * FROM subreddits ORDER BY members DESC LIMIT ?`).all(limit);
    }
    sendJson(res, rows.map(shapeSubreddit));
  });

  router.get("/api/subreddits/:name", (req, res, ctx, params) => {
    const row = selectSubredditByName(ctx, params.name);
    if (!row) return sendError(res, "not_found", `subreddit ${params.name} not found`);
    sendJson(res, shapeSubreddit(row));
  });

  router.get("/api/subreddits/:name/posts", (req, res, ctx, params) => {
    const sub = selectSubredditByName(ctx, params.name);
    if (!sub) return sendError(res, "not_found", `subreddit ${params.name} not found`);
    const url = new URL(req.url, "http://localhost");
    const sort = url.searchParams.get("sort") || "best";
    const t = url.searchParams.get("t") || "all";
    const { limit, after } = paginate(url);
    const rows = ctx.db.prepare(`
      SELECT p.*, u.name AS author_name, s.name AS subreddit_name
        FROM posts p
        JOIN users u       ON u.id = p.author_id
        JOIN subreddits s  ON s.id = p.subreddit_id
       WHERE p.subreddit_id = ?
    `).all(sub.id);
    const filtered = applyTimeRange(rows, t);
    const sorted = sortPosts(filtered, sort);
    const sliced = paginateRows(sorted, limit, after);
    sendJson(res, sliced.map(shapePostWithNames));
  });

  router.get("/api/subreddits/:name/related", (req, res, ctx, params) => {
    const sub = selectSubredditByName(ctx, params.name);
    if (!sub) return sendError(res, "not_found", `subreddit ${params.name} not found`);
    const url = new URL(req.url, "http://localhost");
    const n = Math.min(Number(url.searchParams.get("n")) || 6, 30);
    const rows = ctx.db.prepare(`
      SELECT * FROM subreddits
       WHERE name <> ? AND category = ?
       ORDER BY members DESC LIMIT ?
    `).all(params.name, sub.category, n);
    sendJson(res, rows.map(shapeSubreddit));
  });

  router.get("/api/subreddits/:name/rules", (req, res, ctx, params) => {
    const sub = selectSubredditByName(ctx, params.name);
    if (!sub) return sendError(res, "not_found", `subreddit ${params.name} not found`);
    sendJson(res, sub.rules_json ? JSON.parse(sub.rules_json) : []);
  });
}

function paginateRows(rows, limit, after) {
  let idx = 0;
  if (after) {
    const found = rows.findIndex((r) => r.id === after);
    if (found >= 0) idx = found + 1;
  }
  return rows.slice(idx, idx + limit);
}

function shapePostWithNames(p) {
  return {
    id: p.id, subreddit: p.subreddit_name, author: p.author_name,
    title: p.title, body: p.body || "", kind: p.kind,
    image: p.image, url: p.url, domain: p.domain,
    flair: p.flair, score: p.score, comments: p.comments_count || 0,
    nsfw: !!p.nsfw, spoiler: !!p.spoiler, pinned: !!p.pinned,
    createdAt: p.created_at,
  };
}
