// scripts/_smoke-m5.mjs (in-process test — no HTTP server needed)
// Same pattern as _smoke-m2/m3/m4.mjs but covers the M5 social
// endpoints: subscribe / follow / block / notifications / messages.
//
// Run:  node scripts/_smoke-m5.mjs

import { DatabaseSync } from "node:sqlite";
import { Router } from "../server/router.mjs";
import { runMigrations } from "../scripts/migrate.mjs";
import { registerAuth } from "../server/handlers/auth.mjs";
import { registerSocial } from "../server/handlers/social.mjs";
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
  const dir = mkdtempSync(join(tmpdir(), "m5-smoke-"));
  const dbPath = join(dir, "t.db");
  await runMigrations(dbPath, root);
  const db = new DatabaseSync(dbPath);
  const router = new Router();
  router.use(authMiddleware);
  registerAuth(router);
  registerSocial(router);
  return {
    db, router,
    close: () => { db.close(); rmSync(dir, { recursive: true, force: true }); },
  };
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

function insertNotification(a, userId, opts = {}) {
  const id = `n_${ulid()}`;
  a.db.prepare(`INSERT INTO notifications (id, user_id, kind, source_kind, source_id, read, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, opts.kind || "reply", opts.sourceKind || "comment",
         opts.sourceId || "c_xxx", opts.read ? 1 : 0, new Date().toISOString());
  return id;
}

async function smoke() {
  const a = await freshApp();
  try {
    // Seed 2 users + 1 subreddit
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
                  VALUES (?, 'smokesub5', 'SmokeSub5', '', '#ff4500', 'S', 'other', 'public', '[]', 0, 0, 0, ?)`).run(subId, now);
    const aliceCookie = makeCookie(a.db, "alice");
    const bobCookie   = makeCookie(a.db, "bob");

    // ── subscribe ─────────────────────────────────────────
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/subreddits/smokesub5/subscribe", { action: "join" }),
        { db: a.db, cookieHeader: aliceCookie });
      ok("POST subscribe join → 200", r.statusCode === 200);
      ok("  subscribed=true", r.body?.subscribed === true);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/subreddits/smokesub5/subscribe", { action: "leave" }),
        { db: a.db, cookieHeader: aliceCookie });
      ok("POST subscribe leave → {subscribed:false}", r.body?.subscribed === false);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/subreddits/nope_zzz/subscribe", { action: "join" }),
        { db: a.db, cookieHeader: aliceCookie });
      ok("subscribe missing sub → 404", r.statusCode === 404);
    }

    // ── follow ────────────────────────────────────────────
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/users/bob/follow", { action: "follow" }),
        { db: a.db, cookieHeader: aliceCookie });
      ok("POST follow follow → {following:true}", r.body?.following === true);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/users/alice/follow", { action: "follow" }),
        { db: a.db, cookieHeader: aliceCookie });
      ok("follow self → 403", r.statusCode === 403);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/users/ghost/follow", { action: "follow" }),
        { db: a.db, cookieHeader: aliceCookie });
      ok("follow missing user → 404", r.statusCode === 404);
    }

    // ── block (user + subreddit) ──────────────────────────
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/users/bob/block", { action: "block" }),
        { db: a.db, cookieHeader: aliceCookie });
      ok("block user → {blocked:true}", r.body?.blocked === true);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/users/bob/block", { action: "unblock" }),
        { db: a.db, cookieHeader: aliceCookie });
      ok("unblock user → {blocked:false}", r.body?.blocked === false);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/subreddits/smokesub5/block", { action: "block" }),
        { db: a.db, cookieHeader: aliceCookie });
      ok("block subreddit → {blocked:true}", r.body?.blocked === true);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/users/alice/block", { action: "block" }),
        { db: a.db, cookieHeader: aliceCookie });
      ok("block self → 403", r.statusCode === 403);
    }

    // ── notifications ─────────────────────────────────────
    insertNotification(a, aliceId, { read: false, kind: "reply" });
    insertNotification(a, aliceId, { read: false, kind: "upvote" });
    insertNotification(a, aliceId, { read: true,  kind: "follow" });
    insertNotification(a, bobId,   { read: false, kind: "reply" });   // not alice's
    {
      const r = await withCtx(a.router, mkBodyReq("GET", "/api/notifications", null),
        { db: a.db, cookieHeader: aliceCookie });
      ok("GET /api/notifications returns 3 for alice", r.body?.length === 3);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("GET", "/api/notifications?unread=true", null),
        { db: a.db, cookieHeader: aliceCookie });
      ok("  ?unread=true filters to 2", r.body?.length === 2);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/notifications/mark-all-read", {}),
        { db: a.db, cookieHeader: aliceCookie });
      ok("mark-all-read count=2", r.body?.count === 2);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("GET", "/api/notifications?unread=true", null),
        { db: a.db, cookieHeader: aliceCookie });
      ok("  after mark-all-read, 0 unread", r.body?.length === 0);
    }

    // ── messages ──────────────────────────────────────────
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/messages", { to: "bob", subject: "hi", body: "yo" }),
        { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/messages → 201", r.statusCode === 201);
      ok("  from=alice, to=bob", r.body?.from === "alice" && r.body?.to === "bob");
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/messages", { to: "alice", subject: "x", body: "y" }),
        { db: a.db, cookieHeader: aliceCookie });
      ok("self message → 403", r.statusCode === 403);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/messages", { to: "ghost", subject: "x", body: "y" }),
        { db: a.db, cookieHeader: aliceCookie });
      ok("missing recipient → 404", r.statusCode === 404);
    }
    {
      const bobInbox = await withCtx(a.router, mkBodyReq("GET", "/api/messages?box=inbox", null),
        { db: a.db, cookieHeader: bobCookie });
      ok("bob's inbox has 1", bobInbox.body?.length === 1);
      const aliceSent = await withCtx(a.router, mkBodyReq("GET", "/api/messages?box=sent", null),
        { db: a.db, cookieHeader: aliceCookie });
      ok("alice's sent has 1", aliceSent.body?.length === 1);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("GET", "/api/messages?box=trash", null),
        { db: a.db, cookieHeader: aliceCookie });
      ok("invalid box → 400", r.statusCode === 400);
    }

    if (failed === 0) console.log("\n[smoke-m5] all M5 endpoints green");
    else console.log(`\n[smoke-m5] ${failed} FAILED`);
  } finally {
    a.close();
  }
  process.exit(failed === 0 ? 0 : 1);
}

smoke().catch((e) => {
  console.error("[smoke-m5] crashed:", e);
  process.exit(2);
});
