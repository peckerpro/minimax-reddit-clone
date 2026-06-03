// scripts/_smoke-m3.mjs (in-process test — no HTTP server needed)
// Same pattern as _smoke-m2.mjs but covers the M3 write endpoints.
// Each case imports the real handlers + Router + DatabaseSync and
// drives them through mkBodyReq / withCtx.
//
// Coverage:
//   - 401 on every endpoint with no cookie
//   - happy path vote (+1) → score=1, karma+1
//   - vote change (+1 → -1) → delta=-2, score=-1
//   - vote clear (→0) → row removed, score back to baseline
//   - save toggle on/off
//   - hide toggle on/off
//   - self-vote rejected (no row, no karma change)
//   - 404 on missing post / comment
//   - final invariant: post.score and author.karma match the sum of deltas
//
// Run:  node scripts/_smoke-m3.mjs

import { DatabaseSync } from "node:sqlite";
import { Router } from "../server/router.mjs";
import { runMigrations } from "../scripts/migrate.mjs";
import { registerAuth } from "../server/handlers/auth.mjs";
import { registerInteractions } from "../server/handlers/interactions.mjs";
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
  const dir = mkdtempSync(join(tmpdir(), "m3-smoke-"));
  const dbPath = join(dir, "t.db");
  await runMigrations(dbPath, root);
  const db = new DatabaseSync(dbPath);
  const router = new Router();
  router.use(authMiddleware);
  registerAuth(router);
  registerInteractions(router);
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
    // Seed 2 users + 1 subreddit + 2 posts + 2 comments
    const now = new Date().toISOString();
    const aliceId = `u_${ulid()}`;
    const bobId   = `u_${ulid()}`;
    const subId   = `s_${ulid()}`;
    const alicePost = `p_${ulid()}`;
    const bobPost   = `p_${ulid()}`;
    const bobCmt    = `c_${ulid()}`;

    a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                  VALUES (?, 'alice', 'a@x.com', 'x', 'x', '', '#ff4500', 1, 'user', ?)`).run(aliceId, now);
    a.db.prepare(`INSERT INTO users (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
                  VALUES (?, 'bob', 'b@x.com', 'x', 'x', '', '#0079d3', 1, 'user', ?)`).run(bobId, now);
    a.db.prepare(`INSERT INTO subreddits (id, name, display, description, color, icon_text, category, type,
                  rules_json, weekly_visitors, weekly_contributors, members, created_at)
                  VALUES (?, 'testsub', 'TestSub', '', '#ff4500', 'T', 'other', 'public', '[]', 0, 0, 0, ?)`).run(subId, now);
    a.db.prepare(`INSERT INTO posts (id, subreddit_id, author_id, title, body, kind, score, created_at)
                  VALUES (?, ?, ?, 'alice', '', 'text', 0, ?)`).run(alicePost, subId, aliceId, now);
    a.db.prepare(`INSERT INTO posts (id, subreddit_id, author_id, title, body, kind, score, created_at)
                  VALUES (?, ?, ?, 'bob', '', 'text', 0, ?)`).run(bobPost, subId, bobId, now);
    a.db.prepare(`INSERT INTO comments (id, post_id, parent_id, author_id, body, score, depth, path, created_at)
                  VALUES (?, ?, NULL, ?, 'bob cmt on alice post', 0, 0, ?, ?)`)
      .run(bobCmt, alicePost, bobId, `/c_${bobCmt}`, now);

    const aliceCookie = makeCookie(a.db, "alice");
    const bobCookie   = makeCookie(a.db, "bob");

    // ── 401: every endpoint rejects anon ──
    {
      const r = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${bobPost}/vote`, { direction: 1 }), { db: a.db, cookieHeader: "" });
      ok("POST /api/posts/:id/vote → 401 if anon", r.statusCode === 401, `got ${r.statusCode}`);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", `/api/comments/${bobCmt}/vote`, { direction: 1 }), { db: a.db, cookieHeader: "" });
      ok("POST /api/comments/:id/vote → 401 if anon", r.statusCode === 401);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${bobPost}/save`, {}), { db: a.db, cookieHeader: "" });
      ok("POST /api/posts/:id/save → 401 if anon", r.statusCode === 401);
    }
    {
      const r = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${bobPost}/hide`, {}), { db: a.db, cookieHeader: "" });
      ok("POST /api/posts/:id/hide → 401 if anon", r.statusCode === 401);
    }

    // ── 404: missing post / comment ──
    {
      const r = await withCtx(a.router, mkBodyReq("POST", `/api/posts/p_nope/vote`, { direction: 1 }), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/posts/p_nope/vote → 404", r.statusCode === 404);
    }

    // ── 403: self-vote on post + comment ──
    {
      const r = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${alicePost}/vote`, { direction: 1 }), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/posts/:id/vote on own post → 403", r.statusCode === 403);
    }
    {
      // bob tries to vote on his own comment
      const r = await withCtx(a.router, mkBodyReq("POST", `/api/comments/${bobCmt}/vote`, { direction: 1 }), { db: a.db, cookieHeader: bobCookie });
      ok("POST /api/comments/:id/vote on own comment → 403", r.statusCode === 403);
    }

    // ── 400: bad body ──
    {
      const r = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${bobPost}/vote`, { direction: 5 }), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/posts/:id/vote {direction:5} → 400", r.statusCode === 400);
    }

    // ── happy path: alice upvotes bob's post ──
    {
      const r = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${bobPost}/vote`, { direction: 1 }), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/posts/:id/vote {1} → 200", r.statusCode === 200);
      ok("  response.score = 1", r.body?.score === 1, `got ${r.body?.score}`);
      ok("  response.userVote = 1", r.body?.userVote === 1);
      ok("  response.authorKarma = 2 (bob started at 1)", r.body?.authorKarma === 2, `got ${r.body?.authorKarma}`);
    }

    // ── 4-state roundtrip: +1 → -1 → 0 → +1 ──
    {
      // Current state: +1
      let r = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${bobPost}/vote`, { direction: -1 }), { db: a.db, cookieHeader: aliceCookie });
      ok("switch up→down: score=-1", r.body?.score === -1, `got ${r.body?.score}`);
      ok("  delta=-2", r.body?.delta === -2);

      r = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${bobPost}/vote`, { direction: 0 }), { db: a.db, cookieHeader: aliceCookie });
      ok("clear: score=0", r.body?.score === 0);
      ok("  delta=+1 (from -1 to 0)", r.body?.delta === 1);
      const row = a.db.prepare("SELECT COUNT(*) c FROM post_votes WHERE user_id = ? AND post_id = ?").get(aliceId, bobPost).c;
      ok("  post_votes row removed", row === 0);

      r = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${bobPost}/vote`, { direction: 1 }), { db: a.db, cookieHeader: aliceCookie });
      ok("upvote again: score=1", r.body?.score === 1);
    }

    // ── comment vote: bob upvotes alice's post's comment by alice... wait ──
    // Use a different comment: alice comments on bob's post, then bob upvotes it.
    const aliceCmtOnBob = `c_${ulid()}`;
    a.db.prepare(`INSERT INTO comments (id, post_id, parent_id, author_id, body, score, depth, path, created_at)
                  VALUES (?, ?, NULL, ?, 'alice on bob', 0, 0, ?, ?)`)
      .run(aliceCmtOnBob, bobPost, aliceId, `/c_${aliceCmtOnBob}`, now);
    {
      const r = await withCtx(a.router, mkBodyReq("POST", `/api/comments/${aliceCmtOnBob}/vote`, { direction: 1 }), { db: a.db, cookieHeader: bobCookie });
      ok("POST /api/comments/:id/vote {1} → 200", r.statusCode === 200);
      ok("  comment.score = 1", r.body?.score === 1);
      ok("  alice.karma = 2 (started 1, +1 from vote)", r.body?.authorKarma === 2);
    }

    // ── save toggle ──
    {
      const r1 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${bobPost}/save`, {}), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/posts/:id/save first → {saved:true}", r1.statusCode === 200 && r1.body?.saved === true);
      const r2 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${bobPost}/save`, {}), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/posts/:id/save second → {saved:false}", r2.statusCode === 200 && r2.body?.saved === false);
      const r3 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${bobPost}/save`, {}), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/posts/:id/save third → {saved:true}", r3.body?.saved === true);
      // No score drift from save.
      const post = a.db.prepare("SELECT score FROM posts WHERE id = ?").get(bobPost);
      ok("save doesn't touch post.score", post.score === 1, `got ${post.score}`);
    }

    // ── hide toggle ──
    {
      const r1 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${bobPost}/hide`, {}), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/posts/:id/hide first → {hidden:true}", r1.body?.hidden === true);
      const r2 = await withCtx(a.router, mkBodyReq("POST", `/api/posts/${bobPost}/hide`, {}), { db: a.db, cookieHeader: aliceCookie });
      ok("POST /api/posts/:id/hide second → {hidden:false}", r2.body?.hidden === false);
    }

    // ── final invariant ──
    const finalPost = a.db.prepare("SELECT score FROM posts WHERE id = ?").get(bobPost);
    const finalBob  = a.db.prepare("SELECT karma FROM users WHERE id = ?").get(bobId);
    ok("final post.score matches sum of vote deltas", finalPost.score === 1, `got ${finalPost.score}`);
    ok("final bob.karma matches score (1 vote net)", finalBob.karma === 2, `got ${finalBob.karma}`);

    if (failed === 0) console.log("\n[smoke-m3] all M3 endpoints green");
    else console.log(`\n[smoke-m3] ${failed} FAILED`);
  } finally {
    a.close();
  }
  process.exit(failed === 0 ? 0 : 1);
}

smoke().catch((e) => {
  console.error("[smoke-m3] crashed:", e);
  process.exit(2);
});
