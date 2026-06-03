// server/handlers/social.mjs
// M5 — social graph + notifications + direct messages.
//
// All endpoints require auth (401 if anon). Vote math, karma, and
// transactional invariants live in their own files (interactions.mjs
// etc.); social endpoints are pure read / toggle writes.

import { readBody } from "../lib/body.mjs";
import { sendError, sendJson } from "../lib/errors.mjs";
import { tx } from "../db.mjs";
import { requireAuth } from "../middleware/auth-required.mjs";
import { ulid } from "../lib/ulid.mjs";
import { fireNotification } from "../lib/notifications.mjs";

// ── shapes ───────────────────────────────────────────────

function shapeNotification(n) {
  return {
    id: n.id,
    userId: n.user_id,
    kind: n.kind,
    sourceKind: n.source_kind,
    sourceId: n.source_id,
    read: !!n.read,
    createdAt: n.created_at,
  };
}

function shapeMessage(m) {
  return {
    id: m.id,
    from: m.from_name,
    to: m.to_name,
    subject: m.subject,
    body: m.body,
    read: !!m.read,
    createdAt: m.created_at,
  };
}

function validateMessageBody(body) {
  const errs = {};
  if (body == null || typeof body !== "object") return { __root: "body must be an object" };
  if (typeof body.to !== "string" || !body.to.trim()) errs.to = "required (recipient username)";
  if (typeof body.subject !== "string" || body.subject.trim().length < 1 || body.subject.length > 200)
    errs.subject = "1-200 chars";
  if (typeof body.body !== "string" || body.body.trim().length < 1 || body.body.length > 10000)
    errs.body = "1-10000 chars";
  return errs;
}

const VALID_NOTIF_KINDS = new Set([
  "reply", "upvote", "follow", "mention", "mod", "award",
]);
const VALID_NOTIF_SOURCE_KINDS = new Set([
  "post", "comment", "user", "subreddit",
]);

// ── register ─────────────────────────────────────────────

export function registerSocial(router) {
  // ── POST /api/subreddits/:name/subscribe ──────────────
  router.post("/api/subreddits/:name/subscribe", async (req, res, ctx, params) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    let body;
    try { body = await readBody(req); } catch { return sendError(res, "invalid", "malformed JSON body"); }
    if (!body || !["join", "leave"].includes(body.action)) {
      return sendError(res, "invalid", "action must be 'join' or 'leave'");
    }
    const result = tx(ctx.db, () => {
      const sub = ctx.db.prepare("SELECT id, name FROM subreddits WHERE name = ? COLLATE NOCASE")
        .get(params.name);
      if (!sub) return { __notFound: true };
      const existing = ctx.db.prepare(
        "SELECT level FROM subscriptions WHERE user_id = ? AND subreddit_id = ?"
      ).get(ctx.user.id, sub.id);
      if (body.action === "join") {
        if (!existing) {
          ctx.db.prepare(
            "INSERT INTO subscriptions (user_id, subreddit_id, level, created_at) VALUES (?, ?, 'all', ?)"
          ).run(ctx.user.id, sub.id, new Date().toISOString());
        }
        return { subscribed: true, level: "all" };
      } else {
        if (existing) {
          ctx.db.prepare(
            "DELETE FROM subscriptions WHERE user_id = ? AND subreddit_id = ?"
          ).run(ctx.user.id, sub.id);
        }
        return { subscribed: false, level: "none" };
      }
    });
    if (result?.__notFound) return sendError(res, "not_found", `subreddit r/${params.name} not found`);
    return sendJson(res, result);
  });

  // ── POST /api/users/:name/follow ──────────────────────
  router.post("/api/users/:name/follow", async (req, res, ctx, params) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    let body;
    try { body = await readBody(req); } catch { return sendError(res, "invalid", "malformed JSON body"); }
    if (!body || !["follow", "unfollow"].includes(body.action)) {
      return sendError(res, "invalid", "action must be 'follow' or 'unfollow'");
    }
    const result = tx(ctx.db, () => {
      const target = ctx.db.prepare("SELECT id, name FROM users WHERE name = ? COLLATE NOCASE")
        .get(params.name);
      if (!target) return { __notFound: true };
      if (target.id === ctx.user.id) return { __self: true };
      const existing = ctx.db.prepare(
        "SELECT 1 FROM followed_users WHERE follower_id = ? AND followee_id = ?"
      ).get(ctx.user.id, target.id);
      if (body.action === "follow") {
        if (!existing) {
          ctx.db.prepare(
            "INSERT INTO followed_users (follower_id, followee_id, created_at) VALUES (?, ?, ?)"
          ).run(ctx.user.id, target.id, new Date().toISOString());
          // M6: fire a "follow" notification to the followee. Dedup
          // means a user can only get one "follow" notif per
          // follower (so unfollow + refollow doesn't spam).
          fireNotification(ctx.db, {
            userId: target.id,
            kind: "follow",
            sourceKind: "user",
            sourceId: ctx.user.id,
          });
        }
        return { following: true };
      } else {
        if (existing) {
          ctx.db.prepare(
            "DELETE FROM followed_users WHERE follower_id = ? AND followee_id = ?"
          ).run(ctx.user.id, target.id);
        }
        return { following: false };
      }
    });
    if (result?.__notFound) return sendError(res, "not_found", `user u/${params.name} not found`);
    if (result?.__self) return sendError(res, "forbidden", "cannot follow yourself");
    return sendJson(res, result);
  });

  // ── POST /api/users/:name/block ───────────────────────
  router.post("/api/users/:name/block", async (req, res, ctx, params) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    let body;
    try { body = await readBody(req); } catch { return sendError(res, "invalid", "malformed JSON body"); }
    if (!body || !["block", "unblock"].includes(body.action)) {
      return sendError(res, "invalid", "action must be 'block' or 'unblock'");
    }
    const result = tx(ctx.db, () => {
      const target = ctx.db.prepare("SELECT id, name FROM users WHERE name = ? COLLATE NOCASE")
        .get(params.name);
      if (!target) return { __notFound: true };
      if (target.id === ctx.user.id) return { __self: true };
      const existing = ctx.db.prepare(
        "SELECT 1 FROM blocked_users WHERE user_id = ? AND blocked_id = ?"
      ).get(ctx.user.id, target.id);
      if (body.action === "block") {
        if (!existing) {
          ctx.db.prepare(
            "INSERT INTO blocked_users (user_id, blocked_id, created_at) VALUES (?, ?, ?)"
          ).run(ctx.user.id, target.id, new Date().toISOString());
        }
        return { blocked: true };
      } else {
        if (existing) {
          ctx.db.prepare(
            "DELETE FROM blocked_users WHERE user_id = ? AND blocked_id = ?"
          ).run(ctx.user.id, target.id);
        }
        return { blocked: false };
      }
    });
    if (result?.__notFound) return sendError(res, "not_found", `user u/${params.name} not found`);
    if (result?.__self) return sendError(res, "forbidden", "cannot block yourself");
    return sendJson(res, result);
  });

  // ── POST /api/subreddits/:name/block ─────────────────
  router.post("/api/subreddits/:name/block", async (req, res, ctx, params) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    let body;
    try { body = await readBody(req); } catch { return sendError(res, "invalid", "malformed JSON body"); }
    if (!body || !["block", "unblock"].includes(body.action)) {
      return sendError(res, "invalid", "action must be 'block' or 'unblock'");
    }
    const result = tx(ctx.db, () => {
      const sub = ctx.db.prepare("SELECT id, name FROM subreddits WHERE name = ? COLLATE NOCASE")
        .get(params.name);
      if (!sub) return { __notFound: true };
      const existing = ctx.db.prepare(
        "SELECT 1 FROM blocked_subreddits WHERE user_id = ? AND subreddit_id = ?"
      ).get(ctx.user.id, sub.id);
      if (body.action === "block") {
        if (!existing) {
          ctx.db.prepare(
            "INSERT INTO blocked_subreddits (user_id, subreddit_id, created_at) VALUES (?, ?, ?)"
          ).run(ctx.user.id, sub.id, new Date().toISOString());
        }
        return { blocked: true };
      } else {
        if (existing) {
          ctx.db.prepare(
            "DELETE FROM blocked_subreddits WHERE user_id = ? AND subreddit_id = ?"
          ).run(ctx.user.id, sub.id);
        }
        return { blocked: false };
      }
    });
    if (result?.__notFound) return sendError(res, "not_found", `subreddit r/${params.name} not found`);
    return sendJson(res, result);
  });

  // ── GET /api/notifications ────────────────────────────
  router.get("/api/notifications", (req, res, ctx) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    const url = new URL(req.url, "http://localhost");
    const unreadOnly = url.searchParams.get("unread") === "true";
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
    const sql = `
      SELECT * FROM notifications
       WHERE user_id = ? ${unreadOnly ? "AND read = 0" : ""}
       ORDER BY created_at DESC LIMIT ?
    `;
    const rows = ctx.db.prepare(sql).all(ctx.user.id, limit);
    sendJson(res, rows.map(shapeNotification));
  });

  // ── POST /api/notifications/:id/read ─────────────────
  router.post("/api/notifications/:id/read", (req, res, ctx, params) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    const result = ctx.db.prepare(`
      UPDATE notifications SET read = 1
       WHERE id = ? AND user_id = ?
    `).run(params.id, ctx.user.id);
    if (result.changes === 0) {
      return sendError(res, "not_found", `notification ${params.id} not found`);
    }
    return sendJson(res, { ok: true });
  });

  // ── POST /api/notifications/mark-all-read ────────────
  router.post("/api/notifications/mark-all-read", (req, res, ctx) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    const result = ctx.db.prepare(
      "UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0"
    ).run(ctx.user.id);
    return sendJson(res, { ok: true, count: result.changes });
  });

  // ── GET /api/messages ─────────────────────────────────
  router.get("/api/messages", (req, res, ctx) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    const url = new URL(req.url, "http://localhost");
    const box = (url.searchParams.get("box") || "inbox").toLowerCase();
    if (!["inbox", "sent"].includes(box)) {
      return sendError(res, "invalid", "box must be 'inbox' or 'sent'");
    }
    const field = box === "inbox" ? "to_user_id" : "from_user_id";
    const joinField = box === "inbox" ? "to_user_id" : "from_user_id";
    const otherJoinField = box === "inbox" ? "from_user_id" : "to_user_id";
    const sql = `
      SELECT m.*, u_from.name AS from_name, u_to.name AS to_name
        FROM messages m
        JOIN users u_from ON u_from.id = m.from_user_id
        JOIN users u_to   ON u_to.id   = m.to_user_id
       WHERE m.${field} = ?
       ORDER BY m.created_at DESC LIMIT 100
    `;
    const rows = ctx.db.prepare(sql).all(ctx.user.id);
    sendJson(res, rows.map(shapeMessage));
  });

  // ── POST /api/messages ────────────────────────────────
  router.post("/api/messages", async (req, res, ctx) => {
    try { requireAuth(ctx); } catch { return sendError(res, "unauthorized", "login required"); }
    let body;
    try { body = await readBody(req); } catch { return sendError(res, "invalid", "malformed JSON body"); }
    const errs = validateMessageBody(body);
    if (Object.keys(errs).length) return sendError(res, "invalid", "validation failed", errs);

    const result = tx(ctx.db, () => {
      const recipient = ctx.db.prepare("SELECT id, name FROM users WHERE name = ? COLLATE NOCASE")
        .get(body.to.replace(/^u\//, "").replace(/^u_/, ""));
      if (!recipient) return { __notFound: true };
      if (recipient.id === ctx.user.id) return { __self: true };
      const id = `m_${ulid()}`;
      const now = new Date().toISOString();
      ctx.db.prepare(`
        INSERT INTO messages (id, from_user_id, to_user_id, subject, body, read, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?)
      `).run(id, ctx.user.id, recipient.id, body.subject.trim(), body.body.trim(), now);
      return { id, recipientName: recipient.name };
    });
    if (result?.__notFound) return sendError(res, "not_found", `user u/${body.to} not found`);
    if (result?.__self) return sendError(res, "forbidden", "cannot message yourself");
    const row = ctx.db.prepare(`
      SELECT m.*, u_from.name AS from_name, u_to.name AS to_name
        FROM messages m
        JOIN users u_from ON u_from.id = m.from_user_id
        JOIN users u_to   ON u_to.id = m.to_user_id
       WHERE m.id = ?
    `).get(result.id);
    return sendJson(res, shapeMessage(row), 201);
  });

  // ── (helper, not exposed via the public API) ─────────
  // Test-only / future-endpoint utility for inserting a notification
  // from another handler (e.g. a comment-create should fire a "reply"
  // notification). We don't expose this yet — M5 is read/toggle only.
  // See comments.mjs / posts.mjs for the future wiring point.
}
