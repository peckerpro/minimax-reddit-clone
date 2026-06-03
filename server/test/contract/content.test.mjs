// server/test/contract/content.test.mjs
// M4 contract test: posts / comments / subreddits / drafts / reports.
//
// Coverage (~25 cases):
//   POST /api/posts                    401 / 400 (missing fields) / 404 (sub) / 200 (text+link+image)
//   POST /api/posts/:id/comments       401 / 400 (body) / 404 (post) / 200 (top-level) / 200 (reply with parentId)
//   POST /api/subreddits               401 / 400 (bad name) / 409 (dup) / 200 (happy)
//   POST /api/drafts                   401 / 200
//   PATCH /api/drafts/:id              401 / 404 (other user) / 200 (updates fields + ts)
//   DELETE /api/drafts/:id             401 / 404 (other user) / 200
//   GET  /api/drafts                   401 / 200 (returns only caller's)
//   POST /api/reports                  401 / 400 (bad reason) / 200 (post) / 200 (comment)

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Router } from "../../router.mjs";
import { registerAuth } from "../../handlers/auth.mjs";
import { registerContent } from "../../handlers/content.mjs";
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
  const dir = mkdtempSync(join(tmpdir(), "m4-test-"));
  const dbPath = join(dir, "test.db");
  await runMigrations(dbPath, root);
  const db = new DatabaseSync(dbPath);
  const router = new Router();
  router.use(authMiddleware);
  registerAuth(router);
  registerContent(router);
  return {
    dir, dbPath, db, router,
    close: () => { db.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}

async function seed(a) {
  // Seed: 2 users, 1 subreddit, 1 post by alice
  const now = new Date().toISOString();
  const aliceId = `u_${ulid()}`;
  const bobId   = `u_${ulid()}`;
  const subId   = `s_${ulid()}`;
  const alicePost = `p_${ulid()}`;
  a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                VALUES (?, 'alice', 'a@x.com', 'x', 'x', '', '#ff4500', 1, 'user', ?)`).run(aliceId, now);
  a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                VALUES (?, 'bob', 'b@x.com', 'x', 'x', '', '#0079d3', 1, 'user', ?)`).run(bobId, now);
  a.db.prepare(`INSERT INTO subreddits (id, name, display, description, color, icon_text, category, type,
                rules_json, weekly_visitors, weekly_contributors, members, created_at)
                VALUES (?, 'testsub', 'TestSub', '', '#ff4500', 'T', 'other', 'public', '[]', 0, 0, 0, ?)`).run(subId, now);
  a.db.prepare(`INSERT INTO posts (id, subreddit_id, author_id, title, body, kind, score, created_at)
                VALUES (?, ?, ?, 'alice post', '', 'text', 0, ?)`).run(alicePost, subId, aliceId, now);
  const aliceCookie = makeCookie(a.db, "alice");
  const bobCookie   = makeCookie(a.db, "bob");
  return { aliceId, bobId, subId, alicePost, aliceCookie, bobCookie };
}

function makeCookie(db, name) {
  const user = db.prepare("SELECT id FROM users WHERE name = ?").get(name);
  const sid = newSessionId();
  const exp = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(sid, user.id, exp, new Date().toISOString());
  return `rc_sid=${sessionCookieValue(sid)}`;
}

// ─────────────────────────── POST /api/posts ───────────────────────────

test("POST /api/posts without auth → 401", async () => {
  const a = await freshApp();
  try {
    await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/posts", { subreddit: "testsub", kind: "text", title: "x", body: "y" }),
      { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("POST /api/posts missing title → 400", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/posts", { subreddit: "testsub", kind: "text", body: "y" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.fields.title);
  } finally { a.close(); }
});

test("POST /api/posts bad kind → 400", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/posts", { subreddit: "testsub", kind: "podcast", title: "x", body: "y" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.fields.kind);
  } finally { a.close(); }
});

test("POST /api/posts text post missing body → 400", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/posts", { subreddit: "testsub", kind: "text", title: "x" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.fields.body);
  } finally { a.close(); }
});

test("POST /api/posts link post missing url → 400", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/posts", { subreddit: "testsub", kind: "link", title: "x" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.fields.url);
  } finally { a.close(); }
});

test("POST /api/posts missing subreddit → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/posts", { subreddit: "nosuchsub", kind: "text", title: "x", body: "y" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 404);
  } finally { a.close(); }
});

test("POST /api/posts happy text post → 201 with full Post shape", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/posts", { subreddit: "testsub", kind: "text", title: "Hello", body: "world" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.title, "Hello");
    assert.equal(res.body.body, "world");
    assert.equal(res.body.subreddit, "testsub");
    assert.equal(res.body.author, "alice");
    assert.equal(res.body.kind, "text");
    assert.equal(res.body.score, 1);
    assert.ok(res.body.id.startsWith("p_"));
  } finally { a.close(); }
});

test("POST /api/posts link post extracts domain", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/posts", { subreddit: "testsub", kind: "link", title: "x", url: "https://www.example.com/foo" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.domain, "example.com");
    assert.equal(res.body.url, "https://www.example.com/foo");
  } finally { a.close(); }
});

// ─────────────────────────── POST /api/posts/:id/comments ───────────────────────────

test("POST /api/posts/:id/comments without auth → 401", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.alicePost}/comments`, { body: "hi" }),
      { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("POST /api/posts/:id/comments empty body → 400", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.alicePost}/comments`, { body: "" }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(res.statusCode, 400);
  } finally { a.close(); }
});

test("POST /api/posts/:id/comments missing post → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/p_nope/comments`, { body: "hi" }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(res.statusCode, 404);
  } finally { a.close(); }
});

test("POST /api/posts/:id/comments top-level happy → 201", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.alicePost}/comments`, { body: "first!" }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.body, "first!");
    assert.equal(res.body.author, "bob");
    assert.equal(res.body.parentId, null);
    assert.equal(res.body.depth, 0);
    assert.match(res.body.path, /^\/c_/);
  } finally { a.close(); }
});

test("POST /api/posts/:id/comments reply with parentId → depth=1, path includes parent", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const top = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.alicePost}/comments`, { body: "top" }),
      { db: a.db, cookieHeader: s.bobCookie });
    const reply = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.alicePost}/comments`, { body: "reply", parentId: top.body.id }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(reply.statusCode, 201);
    assert.equal(reply.body.parentId, top.body.id);
    assert.equal(reply.body.depth, 1);
    assert.equal(reply.body.path, `${top.body.path}/${reply.body.id}`);
  } finally { a.close(); }
});

test("POST /api/posts/:id/comments missing parent → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", `/api/posts/${s.alicePost}/comments`, { body: "x", parentId: "c_nope" }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(res.statusCode, 404);
  } finally { a.close(); }
});

// ─────────────────────────── POST /api/subreddits ───────────────────────────

test("POST /api/subreddits without auth → 401", async () => {
  const a = await freshApp();
  try {
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/subreddits", { name: "newsub", display: "New" }),
      { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("POST /api/subreddits bad name → 400", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/subreddits", { name: "AB", display: "X" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.fields.name);
  } finally { a.close(); }
});

test("POST /api/subreddits happy → 201", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/subreddits", { name: "newsub", display: "New Sub", description: "hi" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.name, "newsub");
    assert.equal(res.body.display, "New Sub");
    assert.equal(res.body.type, "public");
    assert.equal(res.body.category, "other");
    assert.ok(res.body.id.startsWith("s_"));
  } finally { a.close(); }
});

test("POST /api/subreddits duplicate name → 409", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/subreddits", { name: "testsub", display: "Dup" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 409);
  } finally { a.close(); }
});

// ─────────────────────────── /api/drafts ───────────────────────────

test("POST /api/drafts without auth → 401", async () => {
  const a = await freshApp();
  try {
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/drafts", { kind: "text", title: "t", body: "b" }),
      { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("POST /api/drafts happy → 201", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/drafts", { kind: "text", title: "WIP", body: "halfway" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.title, "WIP");
    assert.equal(res.body.body, "halfway");
    assert.ok(res.body.id.startsWith("d_"));
  } finally { a.close(); }
});

test("PATCH /api/drafts/:id not yours → 404", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const draft = await withCtx(a.router,
      mkBodyReq("POST", "/api/drafts", { kind: "text", title: "alice draft", body: "" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const res = await withCtx(a.router,
      mkBodyReq("PATCH", `/api/drafts/${draft.body.id}`, { title: "hijack" }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(res.statusCode, 404);
  } finally { a.close(); }
});

test("PATCH /api/drafts/:id own → 200, updates fields + ts", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const draft = await withCtx(a.router,
      mkBodyReq("POST", "/api/drafts", { kind: "text", title: "t1", body: "b1" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const before = draft.body.ts;
    await new Promise((r) => setTimeout(r, 5));   // ensure ts advances
    const res = await withCtx(a.router,
      mkBodyReq("PATCH", `/api/drafts/${draft.body.id}`, { title: "t2" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.title, "t2");
    assert.equal(res.body.body, "b1");
    assert.notEqual(res.body.ts, before);
  } finally { a.close(); }
});

test("DELETE /api/drafts/:id own → 200, row removed", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const draft = await withCtx(a.router,
      mkBodyReq("POST", "/api/drafts", { kind: "text", title: "x", body: "" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    const res = await withCtx(a.router,
      mkBodyReq("DELETE", `/api/drafts/${draft.body.id}`, null),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 200);
    const list = await withCtx(a.router,
      mkBodyReq("GET", "/api/drafts", null),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(list.body.length, 0);
  } finally { a.close(); }
});

test("GET /api/drafts returns only the caller's drafts", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    await withCtx(a.router, mkBodyReq("POST", "/api/drafts", { kind: "text", title: "alice 1" }), { db: a.db, cookieHeader: s.aliceCookie });
    await withCtx(a.router, mkBodyReq("POST", "/api/drafts", { kind: "text", title: "alice 2" }), { db: a.db, cookieHeader: s.aliceCookie });
    await withCtx(a.router, mkBodyReq("POST", "/api/drafts", { kind: "text", title: "bob 1" }), { db: a.db, cookieHeader: s.bobCookie });
    const alice = await withCtx(a.router, mkBodyReq("GET", "/api/drafts", null), { db: a.db, cookieHeader: s.aliceCookie });
    const bob   = await withCtx(a.router, mkBodyReq("GET", "/api/drafts", null), { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(alice.body.length, 2);
    assert.equal(bob.body.length, 1);
    assert.ok(alice.body.every((d) => d.title.startsWith("alice")));
  } finally { a.close(); }
});

// ─────────────────────────── POST /api/reports ───────────────────────────

test("POST /api/reports without auth → 401", async () => {
  const a = await freshApp();
  try {
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/reports", { targetKind: "post", targetId: "p_xxx", reason: "spam" }),
      { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("POST /api/reports bad targetKind → 400", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/reports", { targetKind: "user", targetId: "x", reason: "spam" }),
      { db: a.db, cookieHeader: s.aliceCookie });
    assert.equal(res.statusCode, 400);
  } finally { a.close(); }
});

test("POST /api/reports happy post → 201 with targetExists:true", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/reports", { targetKind: "post", targetId: s.alicePost, reason: "spam", detail: "obvious" }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(res.statusCode, 201);
    assert.ok(res.body.id.startsWith("r_"));
    assert.equal(res.body.targetExists, true);
  } finally { a.close(); }
});

test("POST /api/reports missing target → targetExists:false but still 201", async () => {
  const a = await freshApp();
  try {
    const s = await seed(a);
    const res = await withCtx(a.router,
      mkBodyReq("POST", "/api/reports", { targetKind: "post", targetId: "p_nope", reason: "spam" }),
      { db: a.db, cookieHeader: s.bobCookie });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.targetExists, false);
  } finally { a.close(); }
});
