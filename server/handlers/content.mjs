// server/handlers/content.mjs
// M4 — content writes: posts, comments, drafts, subreddits, reports.
//
// All endpoints require auth (401 if anon). Submission writes
// return the full row in the v2.x mock shape (camelCase, subreddit
// and author as bare names) so the SPA needs zero caller changes.

import { readBody } from "../lib/body.mjs";
import { sendError, sendJson } from "../lib/errors.mjs";
import { tx } from "../db.mjs";
import { requireAuth } from "../middleware/auth-required.mjs";
import { ulid } from "../lib/ulid.mjs";

const SUBREDDIT_NAME_RE = /^[a-z0-9_]{3,21}$/;
const POST_KINDS = new Set(["text", "link", "image", "video"]);
const SUB_CATEGORIES = new Set([
  "tech", "gaming", "news", "sports", "music", "movies", "books",
  "food", "travel", "science", "art", "fashion", "finance", "other",
]);
const SUB_TYPES = new Set(["public", "restricted", "private"]);
const REPORT_TARGETS = new Set(["post", "comment"]);

// ── shapes (match the M2 read endpoints so the SPA can hydrate) ──

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

function shapeSubreddit(s) {
  let rules = [];
  try { rules = JSON.parse(s.rules_json || "[]"); } catch {}
  return {
    id: s.id, name: s.name, display: s.display,
    description: s.description || "",
    color: s.color, iconText: s.icon_text,
    category: s.category, type: s.type, rules,
    weeklyVisitors: s.weekly_visitors,
    weeklyContributors: s.weekly_contributors,
    members: s.members,
    createdAt: s.created_at,
  };
}

function shapeDraft(d) {
  return {
    id: d.id, userId: d.user_id,
    kind: d.kind, subredditId: d.subreddit_id,
    title: d.title || "", body: d.body || "",
    ts: d.ts,
  };
}

function joinPostRow(db, id) {
  return db.prepare(`
    SELECT p.*, u.name AS author_name, s.name AS subreddit_name,
           (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comments_count
      FROM posts p
      JOIN users u       ON u.id = p.author_id
      JOIN subreddits s  ON s.id = p.subreddit_id
     WHERE p.id = ?
  `).get(id);
}

function joinCommentRow(db, id) {
  return db.prepare(`
    SELECT c.*, u.name AS author_name
      FROM comments c
      JOIN users u ON u.id = c.author_id
     WHERE c.id = ?
  `).get(id);
}

// ── helpers ───────────────────────────────────────────────

function validatePostBody(body) {
  const errs = {};
  if (body == null || typeof body !== "object") return { __root: "body must be an object" };
  if (typeof body.subreddit !== "string" || !body.subreddit.trim())
    errs.subreddit = "required";
  if (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.length > 300)
    errs.title = "1-300 chars";
  if (!POST_KINDS.has(body.kind)) errs.kind = `must be one of ${[...POST_KINDS].join(", ")}`;
  if (body.kind === "text"  && (!body.body || !body.body.trim()))  errs.body = "text posts need body";
  if (body.kind === "link"  && !body.url)                          errs.url  = "link posts need url";
  if (body.kind === "image" && !body.image)                        errs.image = "image posts need image";
  return errs;
}

function validateCommentBody(body) {
  const errs = {};
  if (body == null || typeof body !== "object") return { __root: "body must be an object" };
  if (typeof body.body !== "string" || body.body.trim().length < 1 || body.body.length > 10000)
    errs.body = "1-10000 chars";
  if (body.parentId != null && typeof body.parentId !== "string")
    errs.parentId = "must be a string id";
  return errs;
}

function validateSubredditBody(body) {
  const errs = {};
  if (body == null || typeof body !== "object") return { __root: "body must be an object" };
  if (typeof body.name !== "string" || !SUBREDDIT_NAME_RE.test(body.name))
    errs.name = "3-21 chars, lowercase letters / digits / underscore";
  if (typeof body.display !== "string" || body.display.trim().length < 1 || body.display.length > 50)
    errs.display = "1-50 chars";
  if (body.category != null && !SUB_CATEGORIES.has(body.category))
    errs.category = `must be one of ${[...SUB_CATEGORIES].join(", ")}`;
  if (body.type != null && !SUB_TYPES.has(body.type))
    errs.type = `must be one of ${[...SUB_TYPES].join(", ")}`;
  return errs;
}

function validateDraftBody(body) {
  const errs = {};
  if (body == null || typeof body !== "object") return { __root: "body must be an object" };
  if (body.title != null && (typeof body.title !== "string" || body.title.length > 300))
    errs.title = "must be a string up to 300 chars";
  if (body.body != null && (typeof body.body !== "string" || body.body.length > 50000))
    errs.body = "must be a string up to 50000 chars";
  if (body.kind != null && !POST_KINDS.has(body.kind))
    errs.kind = `must be one of ${[...POST_KINDS].join(", ")}`;
  return errs;
}

function validateReportBody(body) {
  const errs = {};
  if (body == null || typeof body !== "object") return { __root: "body must be an object" };
  if (!REPORT_TARGETS.has(body.targetKind)) errs.targetKind = "must be 'post' or 'comment'";
  if (typeof body.targetId !== "string" || !body.targetId.trim()) errs.targetId = "required";
  if (typeof body.reason !== "string" || !body.reason.trim()) errs.reason = "required";
  if (body.detail != null && typeof body.detail !== "string") errs.detail = "must be a string";
  return errs;
}

// Compute the materialized path for a comment. Top-level comments
// have path "/<id>"; replies to a comment have path
// "<parent.path>/<id>". Used to build the depth field and the
// SPA's nested tree.
function computeCommentPath(db, parentId, newId) {
  if (!parentId) return `/${newId}`;
  const parent = db.prepare("SELECT path FROM comments WHERE id = ?").get(parentId);
  if (!parent) return null;             // parent missing — caller 404s
  return `${parent.path}/${newId}`;
}

function computeDepthFromPath(path) {
  if (!path) return 0;
  // count slashes minus the leading one. "/c_abc" -> 0; "/c_abc/c_def" -> 1.
  const parts = path.split("/").filter(Boolean);
  return Math.max(0, parts.length - 1);
}

// ── register ───────────────────────────────────────────────

export function registerContent(router) {
  // ── POST /api/posts ────────────────────────────────────
  router.post("/api/posts", async (req, res, ctx) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    let body;
    try { body = await readBody(req); }
    catch { return sendError(res, "invalid", "malformed JSON body"); }
    const errs = validatePostBody(body);
    if (Object.keys(errs).length) return sendError(res, "invalid", "validation failed", errs);

    const result = tx(ctx.db, () => {
      const sub = ctx.db.prepare(
        "SELECT id FROM subreddits WHERE name = ? COLLATE NOCASE"
      ).get(body.subreddit.replace(/^r\//, ""));
      if (!sub) return { __notFound: `subreddit ${body.subreddit}` };
      const id = `p_${ulid()}`;
      const now = new Date().toISOString();
      let domain = null;
      if (body.kind === "link" && body.url) {
        try { domain = new URL(body.url).hostname.replace(/^www\./, ""); } catch {}
      }
      ctx.db.prepare(`
        INSERT INTO posts (id, subreddit_id, author_id, title, body, kind, image, url, domain, score, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        id, sub.id, ctx.user.id,
        body.title.trim(), (body.body || "").trim(),
        body.kind, body.image || null, body.url || null, domain,
        now
      );
      // bump subreddit members counter (denormalized; cheap to keep
      // roughly accurate — exact count only matters in M5+)
      ctx.db.prepare("UPDATE subreddits SET members = members + 1 WHERE id = ?").run(sub.id);
      return { id };
    });
    if (result?.__notFound) return sendError(res, "not_found", result.__notFound);
    const row = joinPostRow(ctx.db, result.id);
    return sendJson(res, shapePost(row), 201);
  });

  // ── POST /api/posts/:id/comments ───────────────────────
  router.post("/api/posts/:id/comments", async (req, res, ctx, params) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    let body;
    try { body = await readBody(req); }
    catch { return sendError(res, "invalid", "malformed JSON body"); }
    const errs = validateCommentBody(body);
    if (Object.keys(errs).length) return sendError(res, "invalid", "validation failed", errs);

    const result = tx(ctx.db, () => {
      const post = ctx.db.prepare("SELECT id FROM posts WHERE id = ?").get(params.id);
      if (!post) return { __postNotFound: true };
      const id = `c_${ulid()}`;
      const path = computeCommentPath(ctx.db, body.parentId, id);
      if (path == null) return { __parentNotFound: true };
      const depth = computeDepthFromPath(path);
      ctx.db.prepare(`
        INSERT INTO comments (id, post_id, parent_id, author_id, body, score, depth, path, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(id, post.id, body.parentId || null, ctx.user.id, body.body.trim(), depth, path, new Date().toISOString());
      return { id };
    });
    if (result?.__postNotFound) return sendError(res, "not_found", `post ${params.id} not found`);
    if (result?.__parentNotFound) return sendError(res, "not_found", `parent comment ${body.parentId} not found`);
    const row = joinCommentRow(ctx.db, result.id);
    return sendJson(res, shapeComment(row), 201);
  });

  // ── POST /api/subreddits ───────────────────────────────
  router.post("/api/subreddits", async (req, res, ctx) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    let body;
    try { body = await readBody(req); }
    catch { return sendError(res, "invalid", "malformed JSON body"); }
    const errs = validateSubredditBody(body);
    if (Object.keys(errs).length) return sendError(res, "invalid", "validation failed", errs);

    const result = tx(ctx.db, () => {
      const dup = ctx.db.prepare("SELECT id FROM subreddits WHERE name = ? COLLATE NOCASE")
        .get(body.name);
      if (dup) return { __dup: true };
      const id = `s_${ulid()}`;
      const now = new Date().toISOString();
      ctx.db.prepare(`
        INSERT INTO subreddits (id, name, display, description, color, icon_text, category, type,
                                rules_json, weekly_visitors, weekly_contributors, members, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', 0, 0, 1, ?)
      `).run(
        id, body.name, body.display.trim(),
        (body.description || "").trim(),
        body.color || "#ff4500",
        (body.iconText || body.name.slice(0, 2).toUpperCase()).slice(0, 4),
        body.category || "other",
        body.type || "public",
        now
      );
      return { id };
    });
    if (result?.__dup) return sendError(res, "conflict", `subreddit r/${body.name} already exists`);
    const row = ctx.db.prepare("SELECT * FROM subreddits WHERE id = ?").get(result.id);
    return sendJson(res, shapeSubreddit(row), 201);
  });

  // ── POST /api/drafts ───────────────────────────────────
  router.post("/api/drafts", async (req, res, ctx) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    let body;
    try { body = await readBody(req); }
    catch { return sendError(res, "invalid", "malformed JSON body"); }
    const errs = validateDraftBody(body);
    if (Object.keys(errs).length) return sendError(res, "invalid", "validation failed", errs);

    const id = `d_${ulid()}`;
    const now = new Date().toISOString();
    ctx.db.prepare(`
      INSERT INTO drafts (id, user_id, kind, subreddit_id, title, body, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, ctx.user.id, body.kind || "text", body.subredditId || null,
           body.title || "", body.body || "", now);
    const row = ctx.db.prepare("SELECT * FROM drafts WHERE id = ?").get(id);
    return sendJson(res, shapeDraft(row), 201);
  });

  // ── PATCH /api/drafts/:id ──────────────────────────────
  router.patch("/api/drafts/:id", async (req, res, ctx, params) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    let body;
    try { body = await readBody(req); }
    catch { return sendError(res, "invalid", "malformed JSON body"); }
    const errs = validateDraftBody(body);
    if (Object.keys(errs).length) return sendError(res, "invalid", "validation failed", errs);

    const existing = ctx.db.prepare("SELECT * FROM drafts WHERE id = ?").get(params.id);
    if (!existing || existing.user_id !== ctx.user.id)
      return sendError(res, "not_found", `draft ${params.id} not found`);

    const next = {
      kind: body.kind ?? existing.kind,
      subreddit_id: body.subredditId !== undefined ? body.subredditId : existing.subreddit_id,
      title: body.title ?? existing.title,
      body: body.body ?? existing.body,
      ts: new Date().toISOString(),
    };
    ctx.db.prepare(`
      UPDATE drafts SET kind = ?, subreddit_id = ?, title = ?, body = ?, ts = ?
       WHERE id = ?
    `).run(next.kind, next.subreddit_id, next.title, next.body, next.ts, params.id);
    const row = ctx.db.prepare("SELECT * FROM drafts WHERE id = ?").get(params.id);
    return sendJson(res, shapeDraft(row));
  });

  // ── DELETE /api/drafts/:id ─────────────────────────────
  router.delete("/api/drafts/:id", (req, res, ctx, params) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    const existing = ctx.db.prepare("SELECT user_id FROM drafts WHERE id = ?").get(params.id);
    if (!existing || existing.user_id !== ctx.user.id)
      return sendError(res, "not_found", `draft ${params.id} not found`);
    ctx.db.prepare("DELETE FROM drafts WHERE id = ?").run(params.id);
    return sendJson(res, { ok: true });
  });

  // ── GET /api/drafts ────────────────────────────────────
  router.get("/api/drafts", (req, res, ctx) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    const rows = ctx.db.prepare(`
      SELECT * FROM drafts WHERE user_id = ? ORDER BY ts DESC LIMIT 50
    `).all(ctx.user.id);
    sendJson(res, rows.map(shapeDraft));
  });

  // ── POST /api/reports ──────────────────────────────────
  router.post("/api/reports", async (req, res, ctx) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    let body;
    try { body = await readBody(req); }
    catch { return sendError(res, "invalid", "malformed JSON body"); }
    const errs = validateReportBody(body);
    if (Object.keys(errs).length) return sendError(res, "invalid", "validation failed", errs);

    // Verify the target exists. We don't 404 on missing — that would
    // leak which ids exist; just record the report and let a mod
    // (M6) clean it up.
    const table = body.targetKind === "post" ? "posts" : "comments";
    const tgt = ctx.db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(body.targetId);

    const id = `r_${ulid()}`;
    const now = new Date().toISOString();
    ctx.db.prepare(`
      INSERT INTO reports (id, reporter_id, target_kind, target_id, reason, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, ctx.user.id, body.targetKind, body.targetId,
           body.reason, body.detail || "", now);
    return sendJson(res, { ok: true, id, targetExists: !!tgt }, 201);
  });
}
