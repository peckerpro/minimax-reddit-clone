// server/handlers/interactions.mjs
// M3 — write endpoints for votes / save / hide on posts and comments.
//
// All endpoints require auth (401 if anon). Vote applies a delta to
// the target's `score` and the author's `karma` in a single SQLite
// transaction so the two never drift. Save / hide are toggle-on-
// row-exists and don't touch karma.
//
// Comment save / hide are deferred (no `saved_comments` /
// `hidden_comments` table yet, and the SPA's comment.js save button
// is a MOCK toast). Comment vote IS implemented because the SPA
// ships a working comment vote column.

import { readBody } from "../lib/body.mjs";
import { sendError, sendJson } from "../lib/errors.mjs";
import { tx } from "../db.mjs";
import { requireAuth } from "../middleware/auth-required.mjs";

function validateVoteBody(body) {
  const errs = {};
  if (body == null || typeof body !== "object") {
    return { direction: "body must be a JSON object with {direction}" };
  }
  if (![1, -1, 0].includes(body.direction)) {
    errs.direction = "must be 1, -1, or 0";
  }
  return errs;
}

// Apply a (prev, newDir) pair to the votes table. Returns the delta
// (= newDir - prevVal, where prevVal defaults to 0 if no row). The
// caller uses the delta to update the target's score and the
// author's karma in the same transaction.
function applyVoteDelta(db, table, targetCol, targetId, userId, newDir) {
  const prev = db.prepare(
    `SELECT value FROM ${table} WHERE user_id = ? AND ${targetCol} = ?`
  ).get(userId, targetId);
  const prevVal = prev?.value || 0;
  const delta = newDir - prevVal;

  if (newDir === 0) {
    if (prev) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND ${targetCol} = ?`)
        .run(userId, targetId);
    }
  } else if (prev) {
    db.prepare(
      `UPDATE ${table} SET value = ? WHERE user_id = ? AND ${targetCol} = ?`
    ).run(newDir, userId, targetId);
  } else {
    db.prepare(
      `INSERT INTO ${table} (user_id, ${targetCol}, value, created_at) VALUES (?, ?, ?, ?)`
    ).run(userId, targetId, newDir, new Date().toISOString());
  }
  return { prev: prevVal, delta };
}

export function registerInteractions(router) {
  // ── POST /api/posts/:id/vote ──────────────────────────
  router.post("/api/posts/:id/vote", async (req, res, ctx, params) => {
    try { requireAuth(ctx); }
    catch { return sendError(res, "unauthorized", "login required"); }
    let body;
    try { body = await readBody(req); }
    catch { return sendError(res, "invalid", "malformed JSON body"); }
    const errs = validateVoteBody(body);
    if (Object.keys(errs).length) return sendError(res, "invalid", "validation failed", errs);

    const result = tx(ctx.db, () => {
      const post = ctx.db.prepare(
        "SELECT id, author_id, score FROM posts WHERE id = ?"
      ).get(params.id);
      if (!post) return { __notFound: true };
      if (post.author_id === ctx.user.id) return { __selfVote: true };
      const { prev, delta } = applyVoteDelta(
        ctx.db, "post_votes", "post_id", params.id, ctx.user.id, body.direction
      );
      if (delta !== 0) {
        ctx.db.prepare("UPDATE posts SET score = score + ? WHERE id = ?")
          .run(delta, params.id);
        ctx.db.prepare("UPDATE users SET karma = karma + ? WHERE id = ?")
          .run(delta, post.author_id);
      }
      const after = ctx.db.prepare("SELECT score FROM posts WHERE id = ?").get(params.id);
      const author = ctx.db.prepare("SELECT karma FROM users WHERE id = ?").get(post.author_id);
      return {
        score: after.score,
        userVote: body.direction,
        authorKarma: author.karma,
        prev,
        delta,
      };
    });
    if (result?.__notFound) return sendError(res, "not_found", `post ${params.id} not found`);
    if (result?.__selfVote) return sendError(res, "forbidden", "cannot vote on your own post");
    return sendJson(res, result);
  });

  // ── POST /api/comments/:id/vote ───────────────────────
  router.post("/api/comments/:id/vote", async (req, res, ctx, params) => {
    try { requireAuth(ctx); }
    catch { return sendError(res, "unauthorized", "login required"); }
    let body;
    try { body = await readBody(req); }
    catch { return sendError(res, "invalid", "malformed JSON body"); }
    const errs = validateVoteBody(body);
    if (Object.keys(errs).length) return sendError(res, "invalid", "validation failed", errs);

    const result = tx(ctx.db, () => {
      const c = ctx.db.prepare(
        "SELECT id, author_id, score FROM comments WHERE id = ?"
      ).get(params.id);
      if (!c) return { __notFound: true };
      if (c.author_id === ctx.user.id) return { __selfVote: true };
      const { prev, delta } = applyVoteDelta(
        ctx.db, "comment_votes", "comment_id", params.id, ctx.user.id, body.direction
      );
      if (delta !== 0) {
        ctx.db.prepare("UPDATE comments SET score = score + ? WHERE id = ?")
          .run(delta, params.id);
        ctx.db.prepare("UPDATE users SET karma = karma + ? WHERE id = ?")
          .run(delta, c.author_id);
      }
      const after = ctx.db.prepare("SELECT score FROM comments WHERE id = ?").get(params.id);
      const author = ctx.db.prepare("SELECT karma FROM users WHERE id = ?").get(c.author_id);
      return {
        score: after.score,
        userVote: body.direction,
        authorKarma: author.karma,
        prev,
        delta,
      };
    });
    if (result?.__notFound) return sendError(res, "not_found", `comment ${params.id} not found`);
    if (result?.__selfVote) return sendError(res, "forbidden", "cannot vote on your own comment");
    return sendJson(res, result);
  });

  // ── POST /api/posts/:id/save (toggle) ─────────────────
  router.post("/api/posts/:id/save", (req, res, ctx, params) => {
    try { requireAuth(ctx); }
    catch { return sendError(res, "unauthorized", "login required"); }
    const result = tx(ctx.db, () => {
      const post = ctx.db.prepare("SELECT id FROM posts WHERE id = ?").get(params.id);
      if (!post) return { __notFound: true };
      const existing = ctx.db.prepare(
        "SELECT 1 FROM saved_posts WHERE user_id = ? AND post_id = ?"
      ).get(ctx.user.id, params.id);
      if (existing) {
        ctx.db.prepare(
          "DELETE FROM saved_posts WHERE user_id = ? AND post_id = ?"
        ).run(ctx.user.id, params.id);
        return { saved: false };
      } else {
        ctx.db.prepare(
          "INSERT INTO saved_posts (user_id, post_id, created_at) VALUES (?, ?, ?)"
        ).run(ctx.user.id, params.id, new Date().toISOString());
        return { saved: true };
      }
    });
    if (result?.__notFound) return sendError(res, "not_found", `post ${params.id} not found`);
    return sendJson(res, result);
  });

  // ── POST /api/posts/:id/hide (toggle) ─────────────────
  router.post("/api/posts/:id/hide", (req, res, ctx, params) => {
    try { requireAuth(ctx); }
    catch { return sendError(res, "unauthorized", "login required"); }
    const result = tx(ctx.db, () => {
      const post = ctx.db.prepare("SELECT id FROM posts WHERE id = ?").get(params.id);
      if (!post) return { __notFound: true };
      const existing = ctx.db.prepare(
        "SELECT 1 FROM hidden_posts WHERE user_id = ? AND post_id = ?"
      ).get(ctx.user.id, params.id);
      if (existing) {
        ctx.db.prepare(
          "DELETE FROM hidden_posts WHERE user_id = ? AND post_id = ?"
        ).run(ctx.user.id, params.id);
        return { hidden: false };
      } else {
        ctx.db.prepare(
          "INSERT INTO hidden_posts (user_id, post_id, created_at) VALUES (?, ?, ?)"
        ).run(ctx.user.id, params.id, new Date().toISOString());
        return { hidden: true };
      }
    });
    if (result?.__notFound) return sendError(res, "not_found", `post ${params.id} not found`);
    return sendJson(res, result);
  });
}
