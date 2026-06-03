// server/test/contract/interactions.test.mjs
// M3 contract test: votes / save / hide.
//
// Coverage (~22 cases):
//   POST /api/posts/:id/vote      401 / 400 / 404 / 403(self) / 200(up / down / clear / switch)
//   POST /api/comments/:id/vote   401 / 404 / 403(self) / 200
//   POST /api/posts/:id/save      401 / 404 / 200(toggle on, toggle off)
//   POST /api/posts/:id/hide      401 / 404 / 200(toggle on, toggle off)
//
// Plus side-effects: post_votes row count, post.score delta, author
// karma delta, transactions roll back on error (e.g. self-vote must
// NOT touch the votes table).

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Router } from "../../router.mjs";
import { registerAuth } from "../../handlers/auth.mjs";
import { registerInteractions } from "../../handlers/interactions.mjs";
import { authMiddleware } from "../../middleware/auth-required.mjs";
import { _resetRateLimits } from "../../middleware/rate-limit.mjs";
import { runMigrations } from "../../../scripts/migrate.mjs";
import { mkBodyReq, withCtx } from "./_helpers.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { ulid } from "../../lib/ulid.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function freshApp() {
  // M8.audit: rate-limit module is module-level; reset between cases.
  _resetRateLimits();
  const dir = mkdtempSync(join(tmpdir(), "m3-test-"));
  const dbPath = join(dir, "test.db");
  await runMigrations(dbPath, root);
  const db = new DatabaseSync(dbPath);
  const router = new Router();
  router.use(authMiddleware);
  registerAuth(router);
  registerInteractions(router);
  return {
    dir, dbPath, db, router,
    close: () => { db.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}

// Bootstrap two users, one subreddit, one post by alice, one by bob,
// and one comment by each. Returns ids + the cookies we need.
async function seed(a) {
  // Register two users (no need to go through the API — insert directly).
  const aliceId = `u_${ulid()}`;
  const bobId   = `u_${ulid()}`;
  const subId   = `s_${ulid()}`;
  const alicePost = `p_${ulid()}`;
  const bobPost   = `p_${ulid()}`;
  const aliceCmt  = `c_${ulid()}`;
  const bobCmt    = `c_${ulid()}`;
  const now = new Date().toISOString();

  a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                VALUES (?, 'alice', 'a@x.com', 'x', 'x', '', '#ff4500', 1, 'user', ?)`).run(aliceId, now);
  a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                VALUES (?, 'bob', 'b@x.com', 'x', 'x', '', '#0079d3', 1, 'user', ?)`).run(bobId, now);
  a.db.prepare(`INSERT INTO subreddits (id, name, display, description, color, icon_text, category, type,
                rules_json, weekly_visitors, weekly_contributors, members, created_at)
                VALUES (?, 'testsub', 'TestSub', '', '#ff4500', 'T', 'other', 'public', '[]', 0, 0, 0, ?)`).run(subId, now);
  a.db.prepare(`INSERT INTO posts (id, subreddit_id, author_id, title, body, kind, score, created_at)
                VALUES (?, ?, ?, 'alice post', 'hi', 'text', 0, ?)`).run(alicePost, subId, aliceId, now);
  a.db.prepare(`INSERT INTO posts (id, subreddit_id, author_id, title, body, kind, score, created_at)
                VALUES (?, ?, ?, 'bob post', 'hi', 'text', 0, ?)`).run(bobPost, subId, bobId, now);
  a.db.prepare(`INSERT INTO comments (id, post_id, parent_id, author_id, body, score, depth, path, created_at)
                VALUES (?, ?, NULL, ?, 'alice cmt', 0, 0, ?, ?)`).run(aliceCmt, bobPost, aliceId, `/c_${aliceCmt}`, now);
  a.db.prepare(`INSERT INTO comments (id, post_id, parent_id, author_id, body, score, depth, path, created_at)
                VALUES (?, ?, NULL, ?, 'bob cmt', 0, 0, ?, ?)`).run(bobCmt, alicePost, bobId, `/c_${bobCmt}`, now);

  // Make a real session + cookie for both users.
  const aliceCookie = await loginAs(a, "alice", "pwpwpwpw");
  const bobCookie   = await loginAs(a, "bob",   "pwpwpwpw");

  return { aliceId, bobId, subId, alicePost, bobPost, aliceCmt, bobCmt, aliceCookie, bobCookie };
}

async function loginAs(a, name, password) {
  // Direct insert — we already have the user row, just need a session.
  const { newSessionId, sessionCookieValue } = await import("../../auth.mjs");
  const sid = newSessionId();
  const expires = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  const user = a.db.prepare("SELECT id FROM users WHERE name = ?").get(name);
  a.db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(sid, user.id, expires, new Date().toISOString());
  return `rc_sid=${sessionCookieValue(sid)}`;
}

// ─────────────────────────── POST /api/posts/:id/vote ───────────────────────────

test("POST /api/posts/:id/vote without auth → 401", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.bobPost}/vote`, { direction: 1 }),
      { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("POST /api/posts/:id/vote missing post → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/p_does_not_exist/vote`, { direction: 1 }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 404);
  } finally { a.close(); }
});

test("POST /api/posts/:id/vote self-vote → 403 and no row written", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.alicePost}/vote`, { direction: 1 }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 403);
    const rows = a.db.prepare("SELECT COUNT(*) c FROM post_votes WHERE post_id = ?").get(s.alicePost).c;
    assert.equal(rows, 0);
  } finally { a.close(); }
});

test("POST /api/posts/:id/vote bad direction → 400", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.bobPost}/vote`, { direction: 5 }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.fields.direction);
  } finally { a.close(); }
});

test("POST /api/posts/:id/vote upvote (none→+1): score+1, karma+1, row written", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.bobPost}/vote`, { direction: 1 }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.score, 1);
    assert.equal(res.body.userVote, 1);
    assert.equal(res.body.authorKarma, 2); // bob started at 1
    assert.equal(res.body.prev, 0);
    assert.equal(res.body.delta, 1);
    const v = a.db.prepare("SELECT value FROM post_votes WHERE user_id = ? AND post_id = ?").get(s.aliceId, s.bobPost);
    assert.equal(v.value, 1);
  } finally { a.close(); }
});

test("POST /api/posts/:id/vote switch up→down: score-2, karma-2", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    // First upvote
    await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/vote`, { direction: 1 }),
      { db: a.db, cookieHeader: s.aliceCookie });
    // Then switch to downvote
    const res = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/vote`, { direction: -1 }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.score, -1);
    assert.equal(res.body.userVote, -1);
    assert.equal(res.body.authorKarma, 0);
    assert.equal(res.body.prev, 1);
    assert.equal(res.body.delta, -2);
  } finally { a.close(); }
});

test("POST /api/posts/:id/vote clear (down→0): score+1, karma+1", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/vote`, { direction: -1 }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const res = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/vote`, { direction: 0 }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.score, 0);
    assert.equal(res.body.userVote, 0);
    assert.equal(res.body.authorKarma, 1);
    assert.equal(res.body.prev, -1);
    assert.equal(res.body.delta, 1);
    const rows = a.db.prepare("SELECT COUNT(*) c FROM post_votes WHERE user_id = ? AND post_id = ?").get(s.aliceId, s.bobPost).c;
    assert.equal(rows, 0);
  } finally { a.close(); }
});

test("POST /api/posts/:id/vote same direction (idempotent): score unchanged", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    // Upvote twice with direction=1. First should bump, second should be a no-op
    // (server should still accept it and report prev=1, delta=0).
    await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/vote`, { direction: 1 }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const res = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/vote`, { direction: 1 }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.score, 1);
    assert.equal(res.body.delta, 0);
  } finally { a.close(); }
});

test("POST /api/posts/:id/vote 4-state roundtrip: up→down→up→0", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const ctx = { db: a.db, cookieHeader: s.aliceCookie };
    const r1 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/vote`, { direction: 1 }), ctx);
    const r2 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/vote`, { direction: -1 }), ctx);
    const r3 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/vote`, { direction: 1 }), ctx);
    const r4 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/vote`, { direction: 0 }), ctx);
    assert.equal(r1.body.score, 1);
    assert.equal(r2.body.score, -1);     // 1 - 2
    assert.equal(r3.body.score, 1);      // -1 + 2
    assert.equal(r4.body.score, 0);      // 1 - 1
    assert.equal(r4.body.authorKarma, 1);
  } finally { a.close(); }
});

// ─────────────────────────── POST /api/comments/:id/vote ───────────────────────────

test("POST /api/comments/:id/vote without auth → 401", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/comments/${s.aliceCmt}/vote`, { direction: 1 }),
      { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("POST /api/comments/:id/vote missing comment → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/comments/c_nope/vote`, { direction: 1 }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(res.statusCode, 404);
  } finally { a.close(); }
});

test("POST /api/comments/:id/vote self-vote → 403", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/comments/${s.aliceCmt}/vote`, { direction: 1 }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 403);
  } finally { a.close(); }
});

test("POST /api/comments/:id/vote bob upvotes alice's comment: score+1, alice.karma+1", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/comments/${s.aliceCmt}/vote`, { direction: 1 }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.score, 1);
    assert.equal(res.body.userVote, 1);
    assert.equal(res.body.authorKarma, 2); // alice started at 1
  } finally { a.close(); }
});

// ─────────────────────────── POST /api/posts/:id/save ───────────────────────────

test("POST /api/posts/:id/save without auth → 401", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.bobPost}/save`, {}),
      { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("POST /api/posts/:id/save missing post → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/p_nope/save`, {}),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 404);
  } finally { a.close(); }
});

test("POST /api/posts/:id/save toggles: first {saved:true}, second {saved:false}", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const ctx = { db: a.db, cookieHeader: s.aliceCookie };
    const r1 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/save`, {}), ctx);
    assert.equal(r1.statusCode, 200);
    assert.equal(r1.body.saved, true);
    const r2 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/save`, {}), ctx);
    assert.equal(r2.statusCode, 200);
    assert.equal(r2.body.saved, false);
    const r3 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/save`, {}), ctx);
    assert.equal(r3.body.saved, true);
    // Score/karma must NOT be touched.
    const post = a.db.prepare("SELECT score FROM posts WHERE id = ?").get(s.bobPost);
    assert.equal(post.score, 0);
  } finally { a.close(); }
});

// ─────────────────────────── POST /api/posts/:id/hide ───────────────────────────

test("POST /api/posts/:id/hide without auth → 401", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.bobPost}/hide`, {}),
      { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("POST /api/posts/:id/hide missing post → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/p_nope/hide`, {}),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 404);
  } finally { a.close(); }
});

test("POST /api/posts/:id/hide toggles: first {hidden:true}, second {hidden:false}", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const ctx = { db: a.db, cookieHeader: s.aliceCookie };
    const r1 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/hide`, {}), ctx);
    assert.equal(r1.statusCode, 200);
    assert.equal(r1.body.hidden, true);
    const r2 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/hide`, {}), ctx);
    assert.equal(r2.statusCode, 200);
    assert.equal(r2.body.hidden, false);
  } finally { a.close(); }
});

// ─────────────────────────── final-state invariant ───────────────────────────

test("after full vote roundtrip, post.score and author.karma are consistent", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const ctx = { db: a.db, cookieHeader: s.aliceCookie };
    // alice votes +1, -1, +1, 0, +1 on bob's post
    for (const dir of [1, -1, 1, 0, 1]) {
      await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.bobPost}/vote`, { direction: dir }), ctx);
    }
    const post = a.db.prepare("SELECT score FROM posts WHERE id = ?").get(s.bobPost);
    const bob = a.db.prepare("SELECT karma FROM users WHERE id = ?").get(s.bobId);
    // Net deltas: +1, -2, +2, -1, +1  ⇒  +1
    assert.equal(post.score, 1);
    assert.equal(bob.karma, 2);
  } finally { a.close(); }
});
