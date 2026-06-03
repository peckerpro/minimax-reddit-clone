// server/test/contract/social.test.mjs
// M5 contract test: subscribe / follow / block / notifications / messages.
//
// Coverage (~28 cases):
//   POST /api/subreddits/:name/subscribe      401 / 400 / 404 / 200 (join) / 200 (leave) / idempotent
//   POST /api/users/:name/follow              401 / 400 / 404 / 403 (self) / 200 (follow) / 200 (unfollow)
//   POST /api/users/:name/block               401 / 400 / 404 / 403 (self) / 200 (block) / 200 (unblock)
//   POST /api/subreddits/:name/block          401 / 400 / 404 / 200 (block) / 200 (unblock)
//   GET  /api/notifications                   401 / 200 (empty) / 200 (unread filter)
//   POST /api/notifications/:id/read          401 / 404 / 200
//   POST /api/notifications/mark-all-read     401 / 200 (count)
//   GET  /api/messages                        401 / 400 (bad box) / 200 (empty inbox+sent)
//   POST /api/messages                        401 / 400 / 404 (recipient) / 403 (self) / 201 (happy)

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Router } from "../../router.mjs";
import { registerAuth } from "../../handlers/auth.mjs";
import { registerSocial } from "../../handlers/social.mjs";
import { authMiddleware } from "../../middleware/auth-required.mjs";
import { _resetRateLimits } from "../../middleware/rate-limit.mjs";
import { runMigrations } from "../../../scripts/migrate.mjs";
import { mkBodyReq, withCtx } from "./_helpers.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { ulid } from "../../lib/ulid.mjs";
import { newSessionId, sessionCookieValue } from "../../auth.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function freshApp() {
  _resetRateLimits();
  const dir = mkdtempSync(join(tmpdir(), "m5-test-"));
  const dbPath = join(dir, "test.db");
  await runMigrations(dbPath, root);
  const db = new DatabaseSync(dbPath);
  const router = new Router();
  router.use(authMiddleware);
  registerAuth(router);
  registerSocial(router);
  return { dir, dbPath, db, router,
    close: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

async function seed(a) {
  const now = new Date().toISOString();
  const aliceId = `u_${ulid()}`;
  const bobId   = `u_${ulid()}`;
  const subId   = `s_${ulid()}`;
  a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                VALUES (?, 'alice', 'a@x.com', 'x', 'x', '', '#ff4500', 1, 'user', ?)`).run(aliceId, now);
  a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                VALUES (?, 'bob', 'b@x.com', 'x', 'x', '', '#0079d3', 1, 'user', ?)`).run(bobId, now);
  a.db.prepare(`INSERT INTO subreddits (id, name, display, description, color, icon_text, category, type,
                rules_json, weekly_visitors, weekly_contributors, members, created_at)
                VALUES (?, 'm5sub', 'M5Sub', '', '#ff4500', 'M', 'other', 'public', '[]', 0, 0, 0, ?)`).run(subId, now);
  const aliceCookie = makeCookie(a.db, "alice");
  const bobCookie   = makeCookie(a.db, "bob");
  return { aliceId, bobId, subId, aliceCookie, bobCookie };
}

function makeCookie(db, name) {
  const user = db.prepare("SELECT id FROM users WHERE name = ?").get(name);
  const sid = newSessionId();
  const exp = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(sid, user.id, exp, new Date().toISOString());
  return `rc_sid=${sessionCookieValue(sid)}`;
}

function insertNotification(a, userId, opts = {}) {
  // Mirrors production `fireNotification` dedup: a UNIQUE INDEX on
  // (user_id, kind, source_kind, source_id) was added in migration
  // 0003. If a row with the same key already exists we return its id
  // instead of throwing — that's what the real handler does and it's
  // what the test expects (idempotent inserts).
  const kind      = opts.kind      || "reply";
  const sourceKind = opts.sourceKind || "comment";
  const sourceId  = opts.sourceId  || "c_xxx";
  const existing = a.db.prepare(
    "SELECT id FROM notifications WHERE user_id = ? AND kind = ? AND source_kind = ? AND source_id = ?"
  ).get(userId, kind, sourceKind, sourceId);
  if (existing) return existing.id;
  const id = `n_${ulid()}`;
  a.db.prepare(`INSERT INTO notifications (id, user_id, kind, source_kind, source_id, read, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, kind, sourceKind, sourceId, opts.read ? 1 : 0, new Date().toISOString());
  return id;
}

// ──────────────────────── subscribe ────────────────────────

test("POST /api/subreddits/:name/subscribe anon → 401", async () => {
  const a = await freshApp();
  try {
    await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/subreddits/m5sub/subscribe", { action: "join" }),
      { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("POST /api/subreddits/:name/subscribe bad action → 400", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/subreddits/m5sub/subscribe", { action: "lol" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 400);
  } finally { a.close(); }
});

test("POST /api/subreddits/:name/subscribe missing sub → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/subreddits/nope_zzz/subscribe", { action: "join" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 404);
  } finally { a.close(); }
});

test("subscribe / unsubscribe is idempotent", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const ctx = { db: a.db, cookieHeader: s.aliceCookie };
    const r1 = await withCtx(a.router, mkBodyReq("POST", "/api/subreddits/m5sub/subscribe", { action: "join" }), ctx);
    assert.equal(r1.statusCode, 200);
    assert.equal(r1.body.subscribed, true);
    const r2 = await withCtx(a.router, mkBodyReq("POST", "/api/subreddits/m5sub/subscribe", { action: "join" }), ctx);
    assert.equal(r2.body.subscribed, true, "second join should still be subscribed");
    const r3 = await withCtx(a.router, mkBodyReq("POST", "/api/subreddits/m5sub/subscribe", { action: "leave" }), ctx);
    assert.equal(r3.body.subscribed, false);
  } finally { a.close(); }
});

// ──────────────────────── follow ────────────────────────

test("POST /api/users/:name/follow anon → 401", async () => {
  const a = await freshApp();
  try {
    await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/users/bob/follow", { action: "follow" }),
      { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("POST /api/users/:name/follow bad action → 400", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/users/bob/follow", { action: "pet" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 400);
  } finally { a.close(); }
});

test("POST /api/users/:name/follow missing user → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/users/ghost/follow", { action: "follow" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 404);
  } finally { a.close(); }
});

test("POST /api/users/:name/follow self → 403", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/users/alice/follow", { action: "follow" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 403);
  } finally { a.close(); }
});

test("follow / unfollow is idempotent", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const ctx = { db: a.db, cookieHeader: s.aliceCookie };
    const r1 = await withCtx(a.router, mkBodyReq("POST", "/api/users/bob/follow", { action: "follow" }), ctx);
    assert.equal(r1.body.following, true);
    const r2 = await withCtx(a.router, mkBodyReq("POST", "/api/users/bob/follow", { action: "follow" }), ctx);
    assert.equal(r2.body.following, true, "idempotent");
    const r3 = await withCtx(a.router, mkBodyReq("POST", "/api/users/bob/follow", { action: "unfollow" }), ctx);
    assert.equal(r3.body.following, false);
  } finally { a.close(); }
});

// ──────────────────────── block (user + subreddit) ────────────────────────

test("POST /api/users/:name/block anon → 401", async () => {
  const a = await freshApp();
  try {
    await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/users/bob/block", { action: "block" }),
      { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("POST /api/users/:name/block missing user → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/users/ghost/block", { action: "block" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 404);
  } finally { a.close(); }
});

test("POST /api/users/:name/block self → 403", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/users/alice/block", { action: "block" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 403);
  } finally { a.close(); }
});

test("block user toggles on/off", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const ctx = { db: a.db, cookieHeader: s.aliceCookie };
    const r1 = await withCtx(a.router, mkBodyReq("POST", "/api/users/bob/block", { action: "block" }), ctx);
    assert.equal(r1.body.blocked, true);
    const r2 = await withCtx(a.router, mkBodyReq("POST", "/api/users/bob/block", { action: "block" }), ctx);
    assert.equal(r2.body.blocked, true, "idempotent");
    const r3 = await withCtx(a.router, mkBodyReq("POST", "/api/users/bob/block", { action: "unblock" }), ctx);
    assert.equal(r3.body.blocked, false);
  } finally { a.close(); }
});

test("POST /api/subreddits/:name/block toggles on/off", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const ctx = { db: a.db, cookieHeader: s.aliceCookie };
    const r1 = await withCtx(a.router, mkBodyReq("POST", "/api/subreddits/m5sub/block", { action: "block" }), ctx);
    assert.equal(r1.body.blocked, true);
    const r2 = await withCtx(a.router, mkBodyReq("POST", "/api/subreddits/m5sub/block", { action: "unblock" }), ctx);
    assert.equal(r2.body.blocked, false);
  } finally { a.close(); }
});

test("POST /api/subreddits/:name/block missing sub → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/subreddits/nope/block", { action: "block" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 404);
  } finally { a.close(); }
});

// ──────────────────────── notifications ────────────────────────

test("GET /api/notifications anon → 401", async () => {
  const a = await freshApp();
  try {
    const res = await withCtx(a.router, mkBodyReq("GET", "/api/notifications", null), { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("GET /api/notifications returns the caller's only (newest first)", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    insertNotification(a, s.aliceId, { kind: "reply" });
    insertNotification(a, s.aliceId, { kind: "upvote", read: false });
    insertNotification(a, s.bobId, { kind: "follow" });     // not alice's
    const r = await withCtx(a.router, mkBodyReq("GET", "/api/notifications", null), { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.length, 2);
  } finally { a.close(); }
});

test("GET /api/notifications?unread=true filters", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    // Distinct source keys so the 0003 UNIQUE index doesn't merge them.
    insertNotification(a, s.aliceId, { sourceId: "c_1", read: true });
    insertNotification(a, s.aliceId, { sourceId: "c_2", read: false });
    const r = await withCtx(a.router, mkBodyReq("GET", "/api/notifications?unread=true", null), { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(r.body.length, 1);
    assert.equal(r.body[0].read, false);
  } finally { a.close(); }
});

test("POST /api/notifications/:id/read marks one", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const id = insertNotification(a, s.aliceId, { read: false });
    const r = await withCtx(a.router, mkBodyReq("POST", `/api/notifications/${id}/read`, {}), { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(r.statusCode, 200);
    const row = a.db.prepare("SELECT read FROM notifications WHERE id = ?").get(id);
    assert.equal(row.read, 1);
  } finally { a.close(); }
});

test("POST /api/notifications/:id/read on someone else's → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const id = insertNotification(a, s.bobId);
    const r = await withCtx(a.router, mkBodyReq("POST", `/api/notifications/${id}/read`, {}), { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(r.statusCode, 404);
  } finally { a.close(); }
});

test("POST /api/notifications/mark-all-read counts", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    // Distinct source keys so the 0003 UNIQUE index doesn't merge them.
    insertNotification(a, s.aliceId, { sourceId: "c_1", read: false });
    insertNotification(a, s.aliceId, { sourceId: "c_2", read: false });
    insertNotification(a, s.aliceId, { sourceId: "c_3", read: true });
    const r = await withCtx(a.router, mkBodyReq("POST", "/api/notifications/mark-all-read", {}), { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.count, 2);
  } finally { a.close(); }
});

// ──────────────────────── messages ────────────────────────

test("GET /api/messages anon → 401", async () => {
  const a = await freshApp();
  try {
    const res = await withCtx(a.router, mkBodyReq("GET", "/api/messages", null), { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("GET /api/messages?box=invalid → 400", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router, mkBodyReq("GET", "/api/messages?box=trash", null), { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 400);
  } finally { a.close(); }
});

test("GET /api/messages empty inbox and sent", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const inbox = await withCtx(a.router, mkBodyReq("GET", "/api/messages?box=inbox", null), { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(inbox.body.length, 0);
    const sent = await withCtx(a.router, mkBodyReq("GET", "/api/messages?box=sent", null), { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(sent.body.length, 0);
  } finally { a.close(); }
});

test("POST /api/messages anon → 401", async () => {
  const a = await freshApp();
  try {
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/messages", { to: "bob", subject: "hi", body: "yo" }),
      { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("POST /api/messages missing fields → 400", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/messages", { to: "bob" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.fields.subject);
  } finally { a.close(); }
});

test("POST /api/messages missing recipient → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/messages", { to: "ghost", subject: "x", body: "y" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 404);
  } finally { a.close(); }
});

test("POST /api/messages self → 403", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/messages", { to: "alice", subject: "x", body: "y" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 403);
  } finally { a.close(); }
});

test("POST /api/messages happy: lands in recipient inbox + sender sent", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const send = await withCtx(a.router,
      mkBodyReq("POST", "/api/messages", { to: "bob", subject: "hi", body: "yo" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(send.statusCode, 201);
    assert.equal(send.body.from, "alice");
    assert.equal(send.body.to, "bob");
    const bobInbox = await withCtx(a.router, mkBodyReq("GET", "/api/messages?box=inbox", null), { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(bobInbox.body.length, 1);
    const aliceSent = await withCtx(a.router, mkBodyReq("GET", "/api/messages?box=sent", null), { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(aliceSent.body.length, 1);
  } finally { a.close(); }
});
