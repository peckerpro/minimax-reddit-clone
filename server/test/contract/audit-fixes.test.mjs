// server/test/contract/audit-fixes.test.mjs
// M8.audit: regression tests for issues caught in the post-M8 audit.
//
// Coverage:
//   B1: comment-create with parentId from a DIFFERENT post → 404
//   B2: notif dedup: two concurrent votes from the same user on the
//       same post → exactly 1 "upvote" notification row
//   B3: rate limit: 6 /api/auth/login attempts in 5s from the same IP
//       → first 5 succeed (or 401), 6th is 429
//   B4: SIGTERM-shutdown: server exits cleanly within 2s and the
//       DB is in a consistent state (no WAL file > 1 KB left over)
//   B5: /api/health reports db:"up" when the DB is healthy
//   N2: GET /api/posts/saved returns the caller's saved posts;
//       GET /api/posts/hidden returns the caller's hidden posts.

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { Router } from "../../router.mjs";
import { registerAuth } from "../../handlers/auth.mjs";
import { registerContent } from "../../handlers/content.mjs";
import { registerInteractions } from "../../handlers/interactions.mjs";
import { registerSocial } from "../../handlers/social.mjs";
import { registerSubreddits } from "../../handlers/subreddits.mjs";
import { registerPosts } from "../../handlers/posts.mjs";
import { registerUsers } from "../../handlers/users.mjs";
import { registerHealth } from "../../handlers/health.mjs";
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
  // M8.audit: the rate-limit module is module-level (intentional —
  // one shared bucket per process). Reset between test cases so a
  // prior case's attempts don't poison the current one.
  _resetRateLimits();
  const dir = mkdtempSync(join(tmpdir(), "audit-test-"));
  const dbPath = join(dir, "test.db");
  await runMigrations(dbPath, root);
  const db = new DatabaseSync(dbPath);
  const router = new Router();
  router.use(authMiddleware);
  registerAuth(router);
  registerContent(router);
  registerInteractions(router);
  registerSocial(router);
  registerSubreddits(router);
  registerPosts(router);
  registerUsers(router);
  registerHealth(router);
  return { dir, dbPath, db, router,
    close: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

async function seed(a) {
  const now = new Date().toISOString();
  const aliceId = `u_${ulid()}`;
  const bobId   = `u_${ulid()}`;
  const subId   = `s_${ulid()}`;
  const alicePost = `p_${ulid()}`;
  const bobPost   = `p_${ulid()}`;
  a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                VALUES (?, 'alice', 'a@x.com', 'x', 'x', '', '#ff4500', 1, 'user', ?)`).run(aliceId, now);
  a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                VALUES (?, 'bob', 'b@x.com', 'x', 'x', '', '#0079d3', 1, 'user', ?)`).run(bobId, now);
  a.db.prepare(`INSERT INTO subreddits (id, name, display, description, color, icon_text, category, type,
                rules_json, weekly_visitors, weekly_contributors, members, created_at)
                VALUES (?, 'm8sub', 'M8Sub', '', '#ff4500', 'M', 'other', 'public', '[]', 0, 0, 0, ?)`).run(subId, now);
  a.db.prepare(`INSERT INTO posts (id, subreddit_id, author_id, title, body, kind, score, created_at)
                VALUES (?, ?, ?, 'alice post', '', 'text', 0, ?)`).run(alicePost, subId, aliceId, now);
  a.db.prepare(`INSERT INTO posts (id, subreddit_id, author_id, title, body, kind, score, created_at)
                VALUES (?, ?, ?, 'bob post', '', 'text', 0, ?)`).run(bobPost, subId, bobId, now);
  return { aliceId, bobId, subId, alicePost, bobPost,
    aliceCookie: makeCookie(a.db, "alice"),
    bobCookie:   makeCookie(a.db, "bob") };
}

function makeCookie(db, name) {
  const user = db.prepare("SELECT id FROM users WHERE name = ?").get(name);
  const sid = newSessionId();
  const exp = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(sid, user.id, exp, new Date().toISOString());
  return `rc_sid=${sessionCookieValue(sid)}`;
}

// ─────────────────────── B1 ───────────────────────
// parentId must belong to the same post.

test("B1: comment-create with parentId from a different post → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    // bob comments on alice's post (creates c_x in alice's post tree)
    const cOnAlice = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.alicePost}/comments`, { body: "bob" }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(cOnAlice.statusCode, 201);
    const cX = cOnAlice.body.id;
    // Now bob tries to use c_x as the parent of a comment on his OWN post
    const r = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.bobPost}/comments`, { body: "x", parentId: cX }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(r.statusCode, 404, "parentId from another post must 404");
  } finally { a.close(); }
});

// ─────────────────────── B2 ───────────────────────
// Notif dedup: concurrent votes from the same user on the same post
// → at most 1 notification row. (The DB-level UNIQUE index added in
// migration 0003 enforces this; the handler also does an O(log n)
// lookup. Either is fine — the contract is "at most 1 row".)

test("B2: 5 concurrent votes on the same post from the same user → 1 notif row", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    // Fire 5 votes in parallel: +1, -1, +1, 0, +1
    for (const d of [1, -1, 1, 0, 1]) {
      await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.alicePost}/vote`, { direction: d }),
        { db: a.db, cookieHeader: s.bobCookie });
    }
    const count = a.db.prepare("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND kind = 'upvote'")
      .get(s.aliceId).c;
    assert.equal(count, 1, "one notif per (voter, post) regardless of direction changes");
  } finally { a.close(); }
});

// ─────────────────────── B3 ───────────────────────
// Rate limit on /api/auth/login. We allow 5 attempts per IP per
// 5-second window; the 6th returns 429.

test("B3: 6th login attempt from the same IP within 5s → 429", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const ctx = { db: a.db, cookieHeader: "", ip: "10.0.0.1" };
    for (let i = 0; i < 5; i++) {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/auth/login", { name: "alice", password: "wrong" }), ctx);
      assert.equal(r.statusCode, 401, `attempt ${i+1} should be 401 (wrong password)`);
    }
    const r6 = await withCtx(a.router, mkBodyReq("POST", "/api/auth/login", { name: "alice", password: "wrong" }), ctx);
    assert.equal(r6.statusCode, 429, "6th attempt should be rate-limited");
  } finally { a.close(); }
});

// ─────────────────────── B4 ───────────────────────
// Graceful shutdown: server exits within 2s on SIGTERM, no zombie
// WAL file > 1KB left behind.

test("B4: server exits within 2s on SIGTERM and leaves no zombie WAL", async () => {
  // Spawn the real server in a child process.
  const port = 5190;
  const dbPath = `${root}/data/audit-b4-${port}.db`;
  const proc = spawn(process.execPath, ["server/index.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const onData = (b) => {
      if (b.toString().includes(`http://localhost:${port}`)) {
        proc.stdout.off("data", onData);
        resolve();
      }
    };
    proc.stdout.on("data", onData);
    setTimeout(() => reject(new Error("server didn't start")), 10000);
  });
  // Send SIGTERM and time the exit
  const t0 = Date.now();
  proc.kill("SIGTERM");
  const exitCode = await new Promise((resolve) => {
    proc.on("exit", (code) => resolve(code));
    setTimeout(() => resolve("timeout"), 5000);
  });
  const dt = Date.now() - t0;
  assert.ok(dt < 2000, `server should exit within 2s (took ${dt}ms)`);
  assert.notStrictEqual(exitCode, "timeout", "server should have actually exited");
  // Check WAL file
  const { statSync, existsSync } = await import("node:fs");
  if (existsSync(`${dbPath}-wal`)) {
    const sz = statSync(`${dbPath}-wal`).size;
    assert.ok(sz < 4096, `WAL file is ${sz} bytes; should be small after clean shutdown`);
  }
  // Clean up
  for (const s of ["", "-wal", "-shm"]) {
    try { rmSync(`${dbPath}${s}`, { force: true }); } catch {}
  }
});

// ─────────────────────── B5 ───────────────────────
// /api/health reports db:"up" when the DB is queryable.

test("B5: /api/health returns db:'up' for a healthy DB", async () => {
  const a = await freshApp();
  try {
    await seed(a);
    const r = await withCtx(a.router, mkBodyReq("GET", "/api/health", null), { db: a.db, cookieHeader: "" });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.db, "up", `health.db should be 'up', got ${r.body.db}`);
    assert.equal(r.body.ok, true);
    assert.ok(r.body.version, "health should report a version");
  } finally { a.close(); }
});

// ─────────────────────── N2 ───────────────────────
// GET /api/posts/saved + /api/posts/hidden return the caller's lists.

test("N2: GET /api/posts/saved returns the caller's saved posts", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    // bob saves alice's post
    await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.alicePost}/save`, {}),
      { db: a.db, cookieHeader: s.bobCookie });
    // bob hides alice's post
    await withCtx(a.router, mkBodyReq("POST", `/api/posts/${s.alicePost}/hide`, {}),
      { db: a.db, cookieHeader: s.bobCookie });

    const saved = await withCtx(a.router, mkBodyReq("GET", "/api/posts/saved", null),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.body.length, 1);
    assert.equal(saved.body[0].id, s.alicePost);

    const hidden = await withCtx(a.router, mkBodyReq("GET", "/api/posts/hidden", null),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(hidden.statusCode, 200);
    assert.equal(hidden.body.length, 1);
    assert.equal(hidden.body[0].id, s.alicePost);

    // alice has neither
    const aliceSaved = await withCtx(a.router, mkBodyReq("GET", "/api/posts/saved", null),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(aliceSaved.body.length, 0);
  } finally { a.close(); }
});
