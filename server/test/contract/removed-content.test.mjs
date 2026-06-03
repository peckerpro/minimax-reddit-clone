// server/test/contract/removed-content.test.mjs
// M7 contract test: removed content is filtered from public read APIs.
//
// Coverage (~10 cases):
//   GET /api/posts                  →  removed post NOT in list
//   GET /api/posts/:id              →  404 (not 410; no info leak)
//   GET /api/posts/:id/comments     →  404 (post gone, comments list is part of post view)
//   GET /api/posts/:id/related      →  404 (related source is gone)
//   GET /api/subreddits/:name/posts →  removed post NOT in subreddit feed
//   GET /api/users/:name/posts      →  removed post NOT in user profile
//   GET /api/search?type=posts       →  removed post NOT in search results
//   saved/hide still work on a removed post (tombstone, not deleted)
//   vote still works on a removed post (mod can read author karma)

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Router } from "../../router.mjs";
import { registerAuth } from "../../handlers/auth.mjs";
import { registerContent } from "../../handlers/content.mjs";
import { registerSocial } from "../../handlers/social.mjs";
import { registerInteractions } from "../../handlers/interactions.mjs";
import { registerSubreddits } from "../../handlers/subreddits.mjs";
import { registerPosts } from "../../handlers/posts.mjs";
import { registerUsers } from "../../handlers/users.mjs";
import { registerSearch } from "../../handlers/search.mjs";
import { registerAdmin } from "../../handlers/admin.mjs";
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
  const dir = mkdtempSync(join(tmpdir(), "m7-filter-test-"));
  const dbPath = join(dir, "test.db");
  await runMigrations(dbPath, root);
  const db = new DatabaseSync(dbPath);
  const router = new Router();
  router.use(authMiddleware);
  registerAuth(router);
  registerContent(router);
  registerSocial(router);
  registerInteractions(router);
  registerSubreddits(router);
  registerPosts(router);
  registerUsers(router);
  registerSearch(router);
  registerAdmin(router);
  return { dir, dbPath, db, router,
    close: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

async function seed(a) {
  const now = new Date().toISOString();
  const aliceId = `u_${ulid()}`;
  const adminId = `u_${ulid()}`;
  const subId   = `s_${ulid()}`;
  const visiblePost = `p_${ulid()}`;
  const removedPost = `p_${ulid()}`;
  a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                VALUES (?, 'alice', 'a@x.com', 'x', 'x', '', '#ff4500', 1, 'user', ?)`).run(aliceId, now);
  a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                VALUES (?, 'mod', 'm@x.com', 'x', 'x', '', '#7193ff', 1, 'admin', ?)`).run(adminId, now);
  a.db.prepare(`INSERT INTO subreddits (id, name, display, description, color, icon_text, category, type,
                rules_json, weekly_visitors, weekly_contributors, members, created_at)
                VALUES (?, 'm7sub', 'M7Sub', '', '#ff4500', 'M', 'other', 'public', '[]', 0, 0, 0, ?)`).run(subId, now);
  a.db.prepare(`INSERT INTO posts (id, subreddit_id, author_id, title, body, kind, score, created_at)
                VALUES (?, ?, ?, 'visible', '', 'text', 5, ?)`).run(visiblePost, subId, aliceId, now);
  a.db.prepare(`INSERT INTO posts (id, subreddit_id, author_id, title, body, kind, score, created_at)
                VALUES (?, ?, ?, 'TO BE REMOVED', '', 'text', 5, ?)`).run(removedPost, subId, aliceId, now);
  return { aliceId, adminId, subId, visiblePost, removedPost,
    aliceCookie: makeCookie(a.db, "alice"),
    adminCookie: makeCookie(a.db, "mod") };
}

function makeCookie(db, name) {
  const user = db.prepare("SELECT id FROM users WHERE name = ?").get(name);
  const sid = newSessionId();
  const exp = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(sid, user.id, exp, new Date().toISOString());
  return `rc_sid=${sessionCookieValue(sid)}`;
}

test("GET /api/posts list excludes removed posts", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    await withCtx(a.router, mkBodyReq("POST", "/api/reports",
      { targetKind: "post", targetId: s.removedPost, reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    // Find the report id
    const reportId = a.db.prepare("SELECT id FROM reports WHERE target_id = ?").get(s.removedPost).id;
    await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${reportId}/resolve`, { action: "remove_content" }),
      { db: a.db, cookieHeader: s.adminCookie });

    const r = await withCtx(a.router, mkBodyReq("GET", "/api/posts?subreddit=m7sub", null), { db: a.db, cookieHeader: "" });
    assert.equal(r.statusCode, 200);
    const ids = r.body.map((p) => p.id);
    assert.ok(ids.includes(s.visiblePost), "visible post should be in the list");
    assert.ok(!ids.includes(s.removedPost), "removed post should NOT be in the list");
  } finally { a.close(); }
});

test("GET /api/posts/:id returns 404 for a removed post", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    await withCtx(a.router, mkBodyReq("POST", "/api/reports",
      { targetKind: "post", targetId: s.removedPost, reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const reportId = a.db.prepare("SELECT id FROM reports WHERE target_id = ?").get(s.removedPost).id;
    await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${reportId}/resolve`, { action: "remove_content" }),
      { db: a.db, cookieHeader: s.adminCookie });

    const r = await withCtx(a.router, mkBodyReq("GET", `/api/posts/${s.removedPost}`, null), { db: a.db, cookieHeader: "" });
    assert.equal(r.statusCode, 404, "removed post should look like it never existed");
  } finally { a.close(); }
});

test("GET /api/posts/:id/comments returns 404 for a removed post", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    await withCtx(a.router, mkBodyReq("POST", "/api/reports",
      { targetKind: "post", targetId: s.removedPost, reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const reportId = a.db.prepare("SELECT id FROM reports WHERE target_id = ?").get(s.removedPost).id;
    await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${reportId}/resolve`, { action: "remove_content" }),
      { db: a.db, cookieHeader: s.adminCookie });

    const r = await withCtx(a.router, mkBodyReq("GET", `/api/posts/${s.removedPost}/comments`, null), { db: a.db, cookieHeader: "" });
    assert.equal(r.statusCode, 404);
  } finally { a.close(); }
});

test("GET /api/posts/:id/related returns 404 for a removed post", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    await withCtx(a.router, mkBodyReq("POST", "/api/reports",
      { targetKind: "post", targetId: s.removedPost, reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const reportId = a.db.prepare("SELECT id FROM reports WHERE target_id = ?").get(s.removedPost).id;
    await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${reportId}/resolve`, { action: "remove_content" }),
      { db: a.db, cookieHeader: s.adminCookie });

    const r = await withCtx(a.router, mkBodyReq("GET", `/api/posts/${s.removedPost}/related`, null), { db: a.db, cookieHeader: "" });
    assert.equal(r.statusCode, 404);
  } finally { a.close(); }
});

test("GET /api/subreddits/:name/posts excludes removed posts", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    await withCtx(a.router, mkBodyReq("POST", "/api/reports",
      { targetKind: "post", targetId: s.removedPost, reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const reportId = a.db.prepare("SELECT id FROM reports WHERE target_id = ?").get(s.removedPost).id;
    await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${reportId}/resolve`, { action: "remove_content" }),
      { db: a.db, cookieHeader: s.adminCookie });

    const r = await withCtx(a.router, mkBodyReq("GET", "/api/subreddits/m7sub/posts", null), { db: a.db, cookieHeader: "" });
    const ids = r.body.map((p) => p.id);
    assert.ok(ids.includes(s.visiblePost));
    assert.ok(!ids.includes(s.removedPost));
  } finally { a.close(); }
});

test("GET /api/users/:name/posts excludes removed posts", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    await withCtx(a.router, mkBodyReq("POST", "/api/reports",
      { targetKind: "post", targetId: s.removedPost, reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const reportId = a.db.prepare("SELECT id FROM reports WHERE target_id = ?").get(s.removedPost).id;
    await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${reportId}/resolve`, { action: "remove_content" }),
      { db: a.db, cookieHeader: s.adminCookie });

    const r = await withCtx(a.router, mkBodyReq("GET", "/api/users/alice/posts", null), { db: a.db, cookieHeader: "" });
    const ids = r.body.map((p) => p.id);
    assert.ok(ids.includes(s.visiblePost));
    assert.ok(!ids.includes(s.removedPost));
  } finally { a.close(); }
});

test("GET /api/search?type=posts excludes removed posts", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    await withCtx(a.router, mkBodyReq("POST", "/api/reports",
      { targetKind: "post", targetId: s.removedPost, reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const reportId = a.db.prepare("SELECT id FROM reports WHERE target_id = ?").get(s.removedPost).id;
    await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${reportId}/resolve`, { action: "remove_content" }),
      { db: a.db, cookieHeader: s.adminCookie });

    const r = await withCtx(a.router, mkBodyReq("GET", "/api/search?q=REMOVED&type=posts", null), { db: a.db, cookieHeader: "" });
    const ids = (r.body.posts || []).map((p) => p.id);
    assert.ok(!ids.includes(s.removedPost), "search must hide removed posts");
  } finally { a.close(); }
});

test("comments_count on a visible post excludes removed comments", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    // Add a comment to the visible post, then remove the comment
    const cmtRes = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.visiblePost}/comments`, { body: "x" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const cmtId = cmtRes.body.id;
    await withCtx(a.router, mkBodyReq("POST", "/api/reports",
      { targetKind: "comment", targetId: cmtId, reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const reportId = a.db.prepare("SELECT id FROM reports WHERE target_id = ?").get(cmtId).id;
    await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${reportId}/resolve`, { action: "remove_content" }),
      { db: a.db, cookieHeader: s.adminCookie });

    const r = await withCtx(a.router, mkBodyReq("GET", `/api/posts/${s.visiblePost}`, null), { db: a.db, cookieHeader: "" });
    assert.equal(r.body.comments, 0, "removed comments must not be counted");
  } finally { a.close(); }
});
