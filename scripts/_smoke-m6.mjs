// scripts/_smoke-m6.mjs (in-process test — no HTTP server needed)
// Covers M6: notification triggers + admin / mod queue.
//
// Run:  node scripts/_smoke-m6.mjs

import { DatabaseSync } from "node:sqlite";
import { Router } from "../server/router.mjs";
import { runMigrations } from "../scripts/migrate.mjs";
import { registerAuth } from "../server/handlers/auth.mjs";
import { registerContent } from "../server/handlers/content.mjs";
import { registerSocial } from "../server/handlers/social.mjs";
import { registerInteractions } from "../server/handlers/interactions.mjs";
import { registerAdmin } from "../server/handlers/admin.mjs";
import { authMiddleware } from "../server/middleware/auth-required.mjs";
import { mkBodyReq, withCtx } from "../server/test/contract/_helpers.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { ulid } from "../server/lib/ulid.mjs";
import { newSessionId, sessionCookieValue } from "../server/auth.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function freshApp() {
  const dir = mkdtempSync(join(tmpdir(), "m6-smoke-"));
  const dbPath = join(dir, "t.db");
  await runMigrations(dbPath, root);
  const db = new DatabaseSync(dbPath);
  const router = new Router();
  router.use(authMiddleware);
  registerAuth(router);
  registerContent(router);
  registerSocial(router);
  registerInteractions(router);
  registerAdmin(router);
  return { db, router,
    close: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

let failed = 0;
function ok(label, cond, extra = "") {
  const mark = cond ? "[ok]" : "[FAIL]";
  console.log(`${mark} ${label}${extra ? "  " + extra : ""}`);
  if (!cond) failed++;
}

function makeCookie(db, name) {
  const user = db.prepare("SELECT id FROM users WHERE name = ?").get(name);
  const sid = newSessionId();
  const exp = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(sid, user.id, exp, new Date().toISOString());
  return `rc_sid=${sessionCookieValue(sid)}`;
}

function getNotifCount(db, userId, kind) {
  return db.prepare("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND kind = ?")
    .get(userId, kind).c;
}

async function smoke() {
  const a = await freshApp();
  try {
    const now = new Date().toISOString();
    const aliceId = `u_${ulid()}`;
    const bobId   = `u_${ulid()}`;
    const adminId = `u_${ulid()}`;
    const subId   = `s_${ulid()}`;
    const alicePost = `p_${ulid()}`;
    a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                  VALUES (?, 'alice', 'a@x.com', 'x', 'x', '', '#ff4500', 1, 'user', ?)`).run(aliceId, now);
    a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                  VALUES (?, 'bob', 'b@x.com', 'x', 'x', '', '#0079d3', 1, 'user', ?)`).run(bobId, now);
    a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                  VALUES (?, 'mod', 'm@x.com', 'x', 'x', '', '#7193ff', 1, 'admin', ?)`).run(adminId, now);
    a.db.prepare(`INSERT INTO subreddits (id, name, display, description, color, icon_text, category, type,
                  rules_json, weekly_visitors, weekly_contributors, members, created_at)
                  VALUES (?, 'smokesub6', 'SmokeSub6', '', '#ff4500', 'S', 'other', 'public', '[]', 0, 0, 0, ?)`).run(subId, now);
    a.db.prepare(`INSERT INTO posts (id, subreddit_id, author_id, title, body, kind, score, created_at)
                  VALUES (?, ?, ?, 'alice', '', 'text', 0, ?)`).run(alicePost, subId, aliceId, now);
    const aliceCookie = makeCookie(a.db, "alice");
    const bobCookie   = makeCookie(a.db, "bob");
    const adminCookie = makeCookie(a.db, "mod");

    // ── notif triggers ─────────────────────────────────────
    {
      // comment top-level → reply notif
      await withCtx(a.router, mkBodyReq("POST", `/api/posts/${alicePost}/comments`, { body: "hi" }),
        { db: a.db, cookieHeader: bobCookie });
      ok("comment top-level → 1 reply notif for alice", getNotifCount(a.db, aliceId, "reply") === 1);
    }
    {
      // vote → upvote notif
      await withCtx(a.router, mkBodyReq("POST", `/api/posts/${alicePost}/vote`, { direction: 1 }),
        { db: a.db, cookieHeader: bobCookie });
      ok("vote → 1 upvote notif for alice", getNotifCount(a.db, aliceId, "upvote") === 1);
      // dedupe: vote again with different dir
      await withCtx(a.router, mkBodyReq("POST", `/api/posts/${alicePost}/vote`, { direction: -1 }),
        { db: a.db, cookieHeader: bobCookie });
      ok("dedupe: still 1 upvote notif after direction change", getNotifCount(a.db, aliceId, "upvote") === 1);
    }
    {
      // follow → follow notif
      await withCtx(a.router, mkBodyReq("POST", "/api/users/alice/follow", { action: "follow" }),
        { db: a.db, cookieHeader: bobCookie });
      ok("follow → 1 follow notif for alice", getNotifCount(a.db, aliceId, "follow") === 1);
    }
    {
      // self-reply → no notif
      const before = getNotifCount(a.db, aliceId, "reply");
      await withCtx(a.router, mkBodyReq("POST", `/api/posts/${alicePost}/comments`, { body: "self" }),
        { db: a.db, cookieHeader: aliceCookie });
      const after = getNotifCount(a.db, aliceId, "reply");
      ok("self-reply doesn't bump reply notif count", before === after);
    }

    // ── admin / mod queue ─────────────────────────────────
    {
      const r = await withCtx(a.router, mkBodyReq("GET", "/api/admin/reports", null),
        { db: a.db, cookieHeader: "" });
      ok("GET /api/admin/reports anon → 401", r.statusCode === 401);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("GET", "/api/admin/reports", null),
        { db: a.db, cookieHeader: bobCookie });
      ok("GET /api/admin/reports non-admin → 403", r.statusCode === 403);
    }
    {
      // File a report
      const rep = await withCtx(a.router, mkBodyReq("POST", "/api/reports",
        { targetKind: "post", targetId: alicePost, reason: "spam" }),
        { db: a.db, cookieHeader: bobCookie });
      ok("filed a report as bob", rep.statusCode === 201);
      // Admin sees it
      const list = await withCtx(a.router, mkBodyReq("GET", "/api/admin/reports", null),
        { db: a.db, cookieHeader: adminCookie });
      ok("admin sees 1 report", list.body?.length === 1);
      ok("  reporter = bob", list.body[0].reporter === "bob");
      ok("  targetAuthor = alice", list.body[0].targetAuthor === "alice");
      ok("  resolved = false", list.body[0].resolved === false);
      // Resolve dismiss
      const res2 = await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${rep.body.id}/resolve`, { action: "dismiss" }),
        { db: a.db, cookieHeader: adminCookie });
      ok("resolve dismiss → 200", res2.statusCode === 200);
      ok("  action = dismiss", res2.body?.action === "dismiss");
      const post = a.db.prepare("SELECT removed_at FROM posts WHERE id = ?").get(alicePost);
      ok("  dismiss doesn't remove content", post.removed_at === null);
      // After resolve, default GET shows 0 unresolved
      const list2 = await withCtx(a.router, mkBodyReq("GET", "/api/admin/reports", null),
        { db: a.db, cookieHeader: adminCookie });
      ok("default GET filters out resolved", list2.body?.length === 0);
      // ?resolved=true shows the resolved one
      const list3 = await withCtx(a.router, mkBodyReq("GET", "/api/admin/reports?resolved=true", null),
        { db: a.db, cookieHeader: adminCookie });
      ok("?resolved=true shows 1", list3.body?.length === 1);
      ok("  resolvedBy = mod", list3.body[0].resolvedBy === "mod");
    }
    {
      // File a report and remove_content
      const rep = await withCtx(a.router, mkBodyReq("POST", "/api/reports",
        { targetKind: "post", targetId: alicePost, reason: "harassment" }),
        { db: a.db, cookieHeader: bobCookie });
      const res2 = await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${rep.body.id}/resolve`, { action: "remove_content" }),
        { db: a.db, cookieHeader: adminCookie });
      ok("resolve remove_content → 200", res2.statusCode === 200);
      const post = a.db.prepare("SELECT removed_at, removed_by FROM posts WHERE id = ?").get(alicePost);
      ok("  content removed (removed_at set)", post.removed_at !== null);
      ok("  removed_by = admin", post.removed_by === adminId);
    }
    {
      // already-resolved → 409
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/reports",
        { targetKind: "post", targetId: alicePost, reason: "spam2" }),
        { db: a.db, cookieHeader: bobCookie });
      const rep = await withCtx(a.router, mkBodyReq("POST", "/api/reports",
        { targetKind: "post", targetId: alicePost, reason: "spam3" }),
        { db: a.db, cookieHeader: bobCookie });
      await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${rep.body.id}/resolve`, { action: "dismiss" }),
        { db: a.db, cookieHeader: adminCookie });
      const r2 = await withCtx(a.router, mkBodyReq("POST", `/api/admin/reports/${rep.body.id}/resolve`, { action: "dismiss" }),
        { db: a.db, cookieHeader: adminCookie });
      ok("double-resolve → 409", r2.statusCode === 409);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/admin/reports/r_nope/resolve", { action: "dismiss" }),
        { db: a.db, cookieHeader: adminCookie });
      ok("resolve missing → 404", r.statusCode === 404);
    }

    if (failed === 0) console.log("\n[smoke-m6] all M6 endpoints green");
    else console.log(`\n[smoke-m6] ${failed} FAILED`);
  } finally {
    a.close();
  }
  process.exit(failed === 0 ? 0 : 1);
}

smoke().catch((e) => {
  console.error("[smoke-m6] crashed:", e);
  process.exit(2);
});
