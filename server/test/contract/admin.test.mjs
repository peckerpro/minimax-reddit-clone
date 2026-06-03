// server/test/contract/admin.test.mjs
// M6 contract test: notification triggers + admin / mod queue.
//
// Coverage (~20 cases):
//   Notification triggers
//     - comment-create top-level → fires "reply" notif to post author
//     - comment-create reply      → fires "reply" notif to parent comment author
//     - comment-create self-reply → no notif (actor == recipient)
//     - post vote non-zero        → fires "upvote" notif to post author
//     - post vote clear (0)       → no notif
//     - comment vote              → fires "upvote" notif to comment author
//     - follow                    → fires "follow" notif to followee
//     - dedupe: repeated vote on same post → only one "upvote" row
//   Admin / mod queue
//     - GET /api/admin/reports anon → 401
//     - GET /api/admin/reports non-admin → 403
//     - GET /api/admin/reports admin → list of unresolved reports
//     - POST /api/admin/reports/:id/resolve non-admin → 403
//     - POST /api/admin/reports/:id/resolve bad action → 400
//     - POST /api/admin/reports/:id/resolve dismiss → marks resolved
//     - POST /api/admin/reports/:id/resolve remove_content → marks content removed
//     - POST /api/admin/reports/:id/resolve on already-resolved → 409
//     - POST /api/admin/reports/:id/resolve missing → 404

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Router } from "../../router.mjs";
import { registerAuth } from "../../handlers/auth.mjs";
import { registerContent } from "../../handlers/content.mjs";
import { registerSocial } from "../../handlers/social.mjs";
import { registerInteractions } from "../../handlers/interactions.mjs";
import { registerAdmin } from "../../handlers/admin.mjs";
import { authMiddleware } from "../../middleware/auth-required.mjs";
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
  const dir = mkdtempSync(join(tmpdir(), "m6-test-"));
  const dbPath = join(dir, "test.db");
  await runMigrations(dbPath, root);
  const db = new DatabaseSync(dbPath);
  const router = new Router();
  router.use(authMiddleware);
  registerAuth(router);
  registerContent(router);
  registerSocial(router);
  registerInteractions(router);
  registerAdmin(router);
  return { dir, dbPath, db, router,
    close: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

async function seed(a) {
  const now = new Date().toISOString();
  const aliceId = `u_${ulid()}`;
  const bobId   = `u_${ulid()}`;
  const adminId = `u_${ulid()}`;
  const subId   = `s_${ulid()}`;
  const alicePost = `p_${ulid()}`;
  const aliceCmt  = `c_${ulid()}`;
  a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                VALUES (?, 'alice', 'a@x.com', 'x', 'x', '', '#ff4500', 1, 'user', ?)`).run(aliceId, now);
  a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                VALUES (?, 'bob', 'b@x.com', 'x', 'x', '', '#0079d3', 1, 'user', ?)`).run(bobId, now);
  a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                VALUES (?, 'mod', 'm@x.com', 'x', 'x', '', '#7193ff', 1, 'admin', ?)`).run(adminId, now);
  a.db.prepare(`INSERT INTO subreddits (id, name, display, description, color, icon_text, category, type,
                rules_json, weekly_visitors, weekly_contributors, members, created_at)
                VALUES (?, 'm6sub', 'M6Sub', '', '#ff4500', 'M', 'other', 'public', '[]', 0, 0, 0, ?)`).run(subId, now);
  a.db.prepare(`INSERT INTO posts (id, subreddit_id, author_id, title, body, kind, score, created_at)
                VALUES (?, ?, ?, 'alice post', '', 'text', 0, ?)`).run(alicePost, subId, aliceId, now);
  a.db.prepare(`INSERT INTO comments (id, post_id, parent_id, author_id, body, score, depth, path, created_at)
                VALUES (?, ?, NULL, ?, 'alice cmt', 0, 0, ?, ?)`).run(aliceCmt, alicePost, aliceId, `/c_${aliceCmt}`, now);
  return {
    aliceId, bobId, adminId, subId, alicePost, aliceCmt,
    aliceCookie: makeCookie(a.db, "alice"),
    bobCookie:   makeCookie(a.db, "bob"),
    adminCookie: makeCookie(a.db, "mod"),
  };
}

function makeCookie(db, name) {
  const user = db.prepare("SELECT id FROM users WHERE name = ?").get(name);
  const sid = newSessionId();
  const exp = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(sid, user.id, exp, new Date().toISOString());
  return `rc_sid=${sessionCookieValue(sid)}`;
}

function getNotifCount(a, userId, kind) {
  return a.db.prepare("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND kind = ?")
    .get(userId, kind || "any").c;
}

// ──────────────────── notification triggers ────────────────────

test("comment top-level fires reply notif to post author", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const r = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.alicePost}/comments`, { body: "hi alice" }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(r.statusCode, 201);
    const c = getNotifCount(a, s.aliceId, "reply");
    assert.equal(c, 1, `expected 1 reply notif for alice, got ${c}`);
  } finally { a.close(); }
});

test("comment reply fires reply notif to parent comment author", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const r = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.alicePost}/comments`, { body: "yo", parentId: s.aliceCmt }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(r.statusCode, 201);
    const c = getNotifCount(a, s.aliceId, "reply");
    assert.equal(c, 1, `expected 1 reply notif for alice (parent cmt), got ${c}`);
  } finally { a.close(); }
});

test("comment self-reply fires no notif", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const r = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.alicePost}/comments`, { body: "self", parentId: s.aliceCmt }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(r.statusCode, 201);
    const c = getNotifCount(a, s.aliceId, "reply");
    assert.equal(c, 0, "self-reply should not generate a notif");
  } finally { a.close(); }
});

test("post vote non-zero fires upvote notif", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const r = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.alicePost}/vote`, { direction: 1 }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(r.statusCode, 200);
    const c = getNotifCount(a, s.aliceId, "upvote");
    assert.equal(c, 1);
  } finally { a.close(); }
});

test("post vote clear (direction:0) fires no notif", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.alicePost}/vote`, { direction: 1 }),
      { db: a.db, cookieHeader: s.bobCookie });
    // Now clear — no second notif.
    await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.alicePost}/vote`, { direction: 0 }),
      { db: a.db, cookieHeader: s.bobCookie });
    const c = getNotifCount(a, s.aliceId, "upvote");
    assert.equal(c, 1, "clear should not create a new notif (delta == 0)");
  } finally { a.close(); }
});

test("post vote dedupes: same voter, different direction, single notif", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    for (const d of [1, -1, 1, 0, 1]) {
      await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.alicePost}/vote`, { direction: d }),
        { db: a.db, cookieHeader: s.bobCookie });
    }
    const c = getNotifCount(a, s.aliceId, "upvote");
    assert.equal(c, 1, "one notif per (voter, post)");
  } finally { a.close(); }
});

test("comment vote fires upvote notif to comment author", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const r = await withCtx(a.router,
      mkBodyReq("POST", `/api/comments/${s.aliceCmt}/vote`, { direction: 1 }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(r.statusCode, 200);
    const c = getNotifCount(a, s.aliceId, "upvote");
    assert.equal(c, 1);
  } finally { a.close(); }
});

test("follow fires follow notif to followee", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const r = await withCtx(a.router,
      mkBodyReq("POST", `/api/users/alice/follow`, { action: "follow" }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(r.statusCode, 200);
    const c = getNotifCount(a, s.aliceId, "follow");
    assert.equal(c, 1);
  } finally { a.close(); }
});

test("follow dedupes: unfollow + refollow = single notif", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    await withCtx(a.router, mkBodyReq("POST", `/api/users/alice/follow`, { action: "follow" }),
      { db: a.db, cookieHeader: s.bobCookie });
    await withCtx(a.router, mkBodyReq("POST", `/api/users/alice/follow`, { action: "unfollow" }),
      { db: a.db, cookieHeader: s.bobCookie });
    await withCtx(a.router, mkBodyReq("POST", `/api/users/alice/follow`, { action: "follow" }),
      { db: a.db, cookieHeader: s.bobCookie });
    const c = getNotifCount(a, s.aliceId, "follow");
    assert.equal(c, 1, "refollow should not create a second notif");
  } finally { a.close(); }
});

// ──────────────────── admin / mod queue ────────────────────

test("GET /api/admin/reports anon → 401", async () => {
  const a = await freshApp();
  try {
    await seed(a);
    const r = await withCtx(a.router, mkBodyReq("GET", "/api/admin/reports", null),
      { db: a.db, cookieHeader: "" });
    assert.equal(r.statusCode, 401);
  } finally { a.close(); }
});

test("GET /api/admin/reports non-admin → 403", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const r = await withCtx(a.router, mkBodyReq("GET", "/api/admin/reports", null),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(r.statusCode, 403);
  } finally { a.close(); }
});

test("GET /api/admin/reports admin → list", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    // File a couple of reports as alice
    await withCtx(a.router, mkBodyReq("POST", "/api/reports", { targetKind: "post", targetId: s.alicePost, reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    await withCtx(a.router, mkBodyReq("POST", "/api/reports", { targetKind: "comment", targetId: s.aliceCmt, reason: "harassment" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const r = await withCtx(a.router, mkBodyReq("GET", "/api/admin/reports", null),
      { db: a.db, cookieHeader: s.adminCookie });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.length, 2);
    assert.equal(r.body[0].reporter, "alice");
    assert.equal(r.body[0].targetAuthor, "alice");
  } finally { a.close(); }
});

test("POST /api/admin/reports/:id/resolve non-admin → 403", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const rep = await withCtx(a.router, mkBodyReq("POST", "/api/reports", { targetKind: "post", targetId: s.alicePost, reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const r = await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${rep.body.id}/resolve`, { action: "dismiss" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(r.statusCode, 403);
  } finally { a.close(); }
});

test("POST /api/admin/reports/:id/resolve bad action → 400", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const rep = await withCtx(a.router, mkBodyReq("POST", "/api/reports", { targetKind: "post", targetId: s.alicePost, reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const r = await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${rep.body.id}/resolve`, { action: "nuke" }),
      { db: a.db, cookieHeader: s.adminCookie });
    assert.equal(r.statusCode, 400);
  } finally { a.close(); }
});

test("POST /api/admin/reports/:id/resolve dismiss → 200, marked resolved, content NOT removed", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const rep = await withCtx(a.router, mkBodyReq("POST", "/api/reports", { targetKind: "post", targetId: s.alicePost, reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const r = await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${rep.body.id}/resolve`, { action: "dismiss" }),
      { db: a.db, cookieHeader: s.adminCookie });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.action, "dismiss");
    const row = a.db.prepare("SELECT * FROM reports WHERE id = ?").get(rep.body.id);
    assert.ok(row.resolved_at, "resolved_at should be set");
    assert.equal(row.resolution, "dismiss");
    assert.equal(row.resolved_by, s.adminId);
    const post = a.db.prepare("SELECT removed_at FROM posts WHERE id = ?").get(s.alicePost);
    assert.equal(post.removed_at, null, "dismiss should NOT remove content");
  } finally { a.close(); }
});

test("POST /api/admin/reports/:id/resolve remove_content → content removed, post.removed_at set", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const rep = await withCtx(a.router, mkBodyReq("POST", "/api/reports", { targetKind: "comment", targetId: s.aliceCmt, reason: "harassment" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const r = await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${rep.body.id}/resolve`, { action: "remove_content" }),
      { db: a.db, cookieHeader: s.adminCookie });
    assert.equal(r.statusCode, 200);
    const c = a.db.prepare("SELECT removed_at, removed_by FROM comments WHERE id = ?").get(s.aliceCmt);
    assert.ok(c.removed_at, "removed_at should be set on the comment");
    assert.equal(c.removed_by, s.adminId);
  } finally { a.close(); }
});

test("POST /api/admin/reports/:id/resolve on already-resolved → 409", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const rep = await withCtx(a.router, mkBodyReq("POST", "/api/reports", { targetKind: "post", targetId: s.alicePost, reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${rep.body.id}/resolve`, { action: "dismiss" }),
      { db: a.db, cookieHeader: s.adminCookie });
    const r2 = await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${rep.body.id}/resolve`, { action: "dismiss" }),
      { db: a.db, cookieHeader: s.adminCookie });
    assert.equal(r2.statusCode, 409);
  } finally { a.close(); }
});

test("POST /api/admin/reports/:id/resolve missing → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const r = await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/r_nope/resolve`, { action: "dismiss" }),
      { db: a.db, cookieHeader: s.adminCookie });
    assert.equal(r.statusCode, 404);
  } finally { a.close(); }
});

test("GET /api/admin/reports?resolved=true includes resolved reports", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const rep = await withCtx(a.router, mkBodyReq("POST", "/api/reports", { targetKind: "post", targetId: s.alicePost, reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${rep.body.id}/resolve`, { action: "dismiss" }),
      { db: a.db, cookieHeader: s.adminCookie });
    // default: only unresolved (should be empty)
    const def = await withCtx(a.router, mkBodyReq("GET", "/api/admin/reports", null), { db: a.db, cookieHeader: s.adminCookie });
    assert.equal(def.body.length, 0);
    // ?resolved=true: includes the dismissed one
    const incl = await withCtx(a.router, mkBodyReq("GET", "/api/admin/reports?resolved=true", null), { db: a.db, cookieHeader: s.adminCookie });
    assert.equal(incl.body.length, 1);
    assert.equal(incl.body[0].resolution, "dismiss");
    assert.equal(incl.body[0].resolvedBy, "mod");
  } finally { a.close(); }
});
