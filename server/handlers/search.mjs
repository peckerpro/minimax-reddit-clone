// server/handlers/search.mjs
// /api/search?q=…&type=posts&limit=30
// type may be a comma-list: "posts,users,comments,subreddits".
// Always returns all four lists; missing types come back as [].

import { sendJson } from "../lib/errors.mjs";

function shapePost(p) {
  return {
    id: p.id, subreddit: p.subreddit_name, author: p.author_name,
    title: p.title, body: p.body || "", kind: p.kind,
    image: p.image, url: p.url, domain: p.domain,
    flair: p.flair, score: p.score, comments: 0,
    nsfw: !!p.nsfw, spoiler: !!p.spoiler, pinned: !!p.pinned,
    createdAt: p.created_at,
  };
}

function shapeUser(u) {
  return { id: u.id, name: u.name, email: u.email,
           bio: u.bio || "", avatarColor: u.avatar_color,
           karma: u.karma, role: u.role, createdAt: u.created_at };
}

function shapeComment(c) {
  return { id: c.id, postId: c.post_id, parentId: c.parent_id,
           author: c.author_name, body: c.body, score: c.score,
           depth: c.depth, path: c.path, createdAt: c.created_at };
}

function shapeSubreddit(s) {
  return { id: s.id, name: s.name, display: s.display,
           description: s.description, color: s.color, iconText: s.icon_text,
           category: s.category, type: s.type, rules: [],
           weeklyVisitors: s.weekly_visitors,
           weeklyContributors: s.weekly_contributors,
           members: s.members, createdAt: s.created_at };
}

export function registerSearch(router) {
  router.get("/api/search", (req, res, ctx) => {
    const url = new URL(req.url, "http://localhost");
    const q = (url.searchParams.get("q") || "").trim();
    const type = (url.searchParams.get("type") || "posts,users,comments,subreddits").toLowerCase();
    const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 50);
    const types = new Set(type.split(",").map((t) => t.trim()).filter(Boolean));
    const out = { posts: [], users: [], comments: [], subreddits: [] };
    if (!q) return sendJson(res, out);
    const like = `%${q.toLowerCase()}%`;

    if (types.has("posts")) {
      const rows = ctx.db.prepare(`
        SELECT p.*, u.name AS author_name, s.name AS subreddit_name
          FROM posts p
          JOIN users u       ON u.id = p.author_id
          JOIN subreddits s  ON s.id = p.subreddit_id
         WHERE p.removed_at IS NULL
           AND (LOWER(p.title) LIKE ? OR LOWER(IFNULL(p.body,'')) LIKE ?)
         ORDER BY p.score DESC LIMIT ?
      `).all(like, like, limit);
      out.posts = rows.map(shapePost);
    }
    if (types.has("users")) {
      out.users = ctx.db.prepare(`
        SELECT * FROM users
         WHERE LOWER(name) LIKE ? OR LOWER(IFNULL(bio,'')) LIKE ?
         ORDER BY karma DESC LIMIT ?
      `).all(like, like, limit).map(shapeUser);
    }
    if (types.has("comments")) {
      out.comments = ctx.db.prepare(`
        SELECT c.*, u.name AS author_name
          FROM comments c JOIN users u ON u.id = c.author_id
         WHERE LOWER(c.body) LIKE ?
         ORDER BY c.score DESC LIMIT ?
      `).all(like, limit).map(shapeComment);
    }
    if (types.has("subreddits")) {
      out.subreddits = ctx.db.prepare(`
        SELECT * FROM subreddits
         WHERE LOWER(name) LIKE ? OR LOWER(display) LIKE ?
         ORDER BY members DESC LIMIT ?
      `).all(like, like, limit).map(shapeSubreddit);
    }
    sendJson(res, out);
  });
}
