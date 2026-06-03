// scripts/_smoke-m4.mjs (in-process test — no HTTP server needed)
// Same pattern as _smoke-m2.mjs / _smoke-m3.mjs but covers the M4
// content write endpoints: posts, comments, subreddits, drafts,
// reports.
//
// Run:  node scripts/_smoke-m4.mjs

import { DatabaseSync } from "node:sqlite";
import { Router } from "../server/router.mjs";
import { runMigrations } from "../scripts/migrate.mjs";
import { registerAuth } from "../server/handlers/auth.mjs";
import { registerContent } from "../server/handlers/content.mjs";
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
  const dir = mkdtempSync(join(tmpdir(), "m4-smoke-"));
  const dbPath = join(dir, "t.db");
  await runMigrations(dbPath, root);
  const db = new DatabaseSync(dbPath);
  const router = new Router();
  router.use(authMiddleware);
  registerAuth(router);
  registerContent(router);
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
                  VALUES (?, 'smokesub', 'SmokeSub', '', '#ff4500', 'S', 'other', 'public', '[]', 0, 0, 0, ?)`).run(subId, now);
    const aliceCookie = makeCookie(a.db, "alice");
    const bobCookie   = makeCookie(a.db, "bob");

    // ── POST /api/posts ──────────────────────────────────
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/posts", {
        subreddit: "smokesub", kind: "text", title: "Hello", body: "world",
      }), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/posts text → 201", r.statusCode === 201);
      ok("  returns id startsWith p_", r.body?.id?.startsWith("p_"));
      ok("  score = 1 (initial upvote from author)", r.body?.score === 1);
      ok("  author = alice", r.body?.author === "alice");
      ok("  subreddit = smokesub", r.body?.subreddit === "smokesub");
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/posts", {
        subreddit: "smokesub", kind: "link", title: "A link", url: "https://example.com/x",
      }), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/posts link → 201", r.statusCode === 201);
      ok("  domain extracted", r.body?.domain === "example.com");
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/posts", {
        subreddit: "smokesub", kind: "text", title: "x",
      }), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/posts text without body → 400", r.statusCode === 400);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/posts", {
        subreddit: "nosuchsub", kind: "text", title: "x", body: "y",
      }), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/posts missing subreddit → 404", r.statusCode === 404);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/posts", {
        subreddit: "smokesub", kind: "text", title: "anon post", body: "y",
      }), { db: a.db, cookieHeader: "" });
      ok("POST /api/posts anon → 401", r.statusCode === 401);
    }

    // Fetch the post we just made to comment on it
    const posts = a.db.prepare("SELECT id FROM posts ORDER BY created_at DESC LIMIT 1").all();
    const postId = posts[0].id;

    // ── POST /api/posts/:id/comments ──────────────────────
    {
      const r = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${postId}/comments`, {
        body: "first comment!",
      }), { db: a.db, cookieHeader: bobCookie });
      ok("POST comment top-level → 201", r.statusCode === 201);
      ok("  parentId = null", r.body?.parentId === null);
      ok("  depth = 0", r.body?.depth === 0);
      ok("  author = bob", r.body?.author === "bob");
      const cmtId = r.body.id;
      // Reply to it
      const r2 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${postId}/comments`, {
        body: "reply!", parentId: cmtId,
      }), { db: a.db, cookieHeader: aliceCookie });
      ok("POST comment reply → 201", r2.statusCode === 201);
      ok("  parentId = parent", r2.body?.parentId === cmtId);
      ok("  depth = 1", r2.body?.depth === 1);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", `/api/posts/p_nope/comments`, {
        body: "x",
      }), { db: a.db, cookieHeader: bobCookie });
      ok("POST comment missing post → 404", r.statusCode === 404);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${postId}/comments`, {
        body: "x", parentId: "c_nope",
      }), { db: a.db, cookieHeader: bobCookie });
      ok("POST comment missing parent → 404", r.statusCode === 404);
    }

    // ── POST /api/subreddits ──────────────────────────────
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/subreddits", {
        name: "newsub", display: "New Sub",
      }), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/subreddits happy → 201", r.statusCode === 201);
      ok("  type = public (default)", r.body?.type === "public");
      ok("  category = other (default)", r.body?.category === "other");
      ok("  members = 1 (creator counted)", r.body?.members === 1);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/subreddits", {
        name: "AB", display: "X",
      }), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/subreddits bad name → 400", r.statusCode === 400);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/subreddits", {
        name: "smokesub", display: "Dup",
      }), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/subreddits dup name → 409", r.statusCode === 409);
    }

    // ── POST /api/drafts ─────────────────────────────────
    let draftId;
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/drafts", {
        kind: "text", title: "WIP", body: "halfway",
      }), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/drafts happy → 201", r.statusCode === 201);
      ok("  id startsWith d_", r.body?.id?.startsWith("d_"));
      draftId = r.body.id;
    }
    {
      const r = await withCtx(a.router, mkBodyReq("PATCH", `/api/drafts/${draftId}`, {
        title: "WIP 2",
      }), { db: a.db, cookieHeader: aliceCookie });
      ok("PATCH /api/drafts/:id own → 200", r.statusCode === 200);
      ok("  title updated", r.body?.title === "WIP 2");
    }
    {
      const r = await withCtx(a.router, mkBodyReq("PATCH", `/api/drafts/${draftId}`, {
        title: "hijack",
      }), { db: a.db, cookieHeader: bobCookie });
      ok("PATCH /api/drafts/:id not yours → 404", r.statusCode === 404);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("GET", "/api/drafts", null), { db: a.db, cookieHeader: aliceCookie });
      ok("GET /api/drafts returns 1 for alice", r.body?.length === 1);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("DELETE", `/api/drafts/${draftId}`, null), { db: a.db, cookieHeader: aliceCookie });
      ok("DELETE /api/drafts/:id own → 200", r.statusCode === 200);
    }

    // ── POST /api/reports ────────────────────────────────
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/reports", {
        targetKind: "post", targetId: postId, reason: "spam", detail: "obvious",
      }), { db: a.db, cookieHeader: bobCookie });
      ok("POST /api/reports post → 201", r.statusCode === 201);
      ok("  targetExists = true", r.body?.targetExists === true);
      ok("  id startsWith r_", r.body?.id?.startsWith("r_"));
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/reports", {
        targetKind: "comment", targetId: "c_nope", reason: "harassment",
      }), { db: a.db, cookieHeader: bobCookie });
      ok("POST /api/reports missing comment → 201 with targetExists:false", r.statusCode === 201 && r.body?.targetExists === false);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", "/api/reports", {
        targetKind: "user", targetId: "u_xxx", reason: "spam",
      }), { db: a.db, cookieHeader: bobCookie });
      ok("POST /api/reports bad targetKind → 400", r.statusCode === 400);
    }

    if (failed === 0) console.log("\n[smoke-m4] all M4 endpoints green");
    else console.log(`\n[smoke-m4] ${failed} FAILED`);
  } finally {
    a.close();
  }
  process.exit(failed === 0 ? 0 : 1);
}

smoke().catch((e) => {
  console.error("[smoke-m4] crashed:", e);
  process.exit(2);
});
