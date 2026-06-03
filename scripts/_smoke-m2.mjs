// scripts/_smoke-m2.mjs (in-process test — no HTTP server needed)
// Imports server/handlers + Router + DatabaseSync directly and asserts
// the same things the live smoke would.
import { DatabaseSync } from "node:sqlite";
import { Router } from "../server/router.mjs";
import { runMigrations } from "../scripts/migrate.mjs";
import { registerSubreddits } from "../server/handlers/subreddits.mjs";
import { registerPosts } from "../server/handlers/posts.mjs";
import { registerUsers } from "../server/handlers/users.mjs";
import { registerSearch } from "../server/handlers/search.mjs";
import { authMiddleware } from "../server/middleware/auth-required.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function freshApp() {
  const dir = mkdtempSync(join(tmpdir(), "m2-"));
  const dbPath = join(dir, "t.db");
  await runMigrations(dbPath, root);
  const db = new DatabaseSync(dbPath);
  const router = new Router();
  router.use(authMiddleware);
  registerSubreddits(router);
  registerPosts(router);
  registerUsers(router);
  registerSearch(router);
  return { db, router, close: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

let failed = 0;
function ok(label, cond, extra = "") {
  const mark = cond ? "[ok]" : "[FAIL]";
  console.log(`${mark} ${label}${extra ? "  " + extra : ""}`);
  if (!cond) failed++;
}

async function call(router, db, method, path) {
  const { mkBodyReq, withCtx } = await import("../server/test/contract/_helpers.mjs");
  const req = mkBodyReq(method, path, null);
  const res = await withCtx(router, req, { db, cookieHeader: "" });
  return res;
}

const a = await freshApp();
try {
  // Probe what the seed actually contains so we use real ids.
  const allSubs = a.db.prepare("SELECT name FROM subreddits ORDER BY name").all().map(r => r.name);
  const sub = allSubs[0];
  const u = a.db.prepare("SELECT name FROM users ORDER BY karma DESC LIMIT 1").get();
  const p = a.db.prepare("SELECT id, subreddit_id FROM posts ORDER BY score DESC LIMIT 1").get();

  let r = await call(a.router, a.db, "GET", "/api/subreddits?limit=3");
  ok("subreddits list 200", r.statusCode === 200);
  ok("subreddits list array", Array.isArray(r.body) && r.body.length > 0);
  ok("subreddit shape (name/display/rules)", r.body?.[0]?.name && r.body?.[0]?.display && Array.isArray(r.body?.[0]?.rules), `name=${r.body?.[0]?.name}`);

  r = await call(a.router, a.db, "GET", `/api/subreddits/${sub}`);
  ok("subreddit detail 200", r.statusCode === 200, `members=${r.body?.members}`);
  ok("subreddit rules array", Array.isArray(r.body?.rules), `count=${r.body?.rules?.length}`);

  r = await call(a.router, a.db, "GET", `/api/subreddits/${sub}/posts?limit=3`);
  ok("subreddit posts 200", r.statusCode === 200 && Array.isArray(r.body), `count=${r.body?.length}`);

  r = await call(a.router, a.db, "GET", "/api/posts?limit=3&sort=top");
  ok("posts list 200", r.statusCode === 200 && Array.isArray(r.body), `count=${r.body?.length}`);
  ok("post shape", r.body?.[0]?.title && r.body?.[0]?.author && r.body?.[0]?.subreddit, `first=${r.body?.[0]?.title?.slice(0, 30)}`);

  r = await call(a.router, a.db, "GET", `/api/posts/${p.id}`);
  ok("post detail 200", r.statusCode === 200 && r.body?.id === p.id);

  r = await call(a.router, a.db, "GET", "/api/posts/does_not_exist");
  ok("post 404", r.statusCode === 404);

  r = await call(a.router, a.db, "GET", `/api/posts/${p.id}/comments`);
  ok("comments list", r.statusCode === 200 && Array.isArray(r.body), `count=${r.body?.length}`);

  r = await call(a.router, a.db, "GET", `/api/users/${u.name}`);
  ok("user detail", r.statusCode === 200 && r.body?.name === u.name, `karma=${r.body?.karma}`);

  r = await call(a.router, a.db, "GET", "/api/users/ghost");
  ok("user 404", r.statusCode === 404);

  r = await call(a.router, a.db, "GET", `/api/users/${u.name}/posts?limit=3`);
  ok("user posts", r.statusCode === 200 && Array.isArray(r.body), `count=${r.body?.length}`);

  r = await call(a.router, a.db, "GET", `/api/search?q=${sub}&type=posts,users,subreddits`);
  ok("search", r.statusCode === 200 && Array.isArray(r.body?.posts) && Array.isArray(r.body?.users), `p=${r.body?.posts?.length} u=${r.body?.users?.length}`);

  r = await call(a.router, a.db, "GET", `/api/posts/${p.id}/related?limit=3`);
  ok("related", r.statusCode === 200 && Array.isArray(r.body), `count=${r.body?.length}`);
} finally {
  a.close();
}

if (failed > 0) {
  console.log(`\nFAIL — ${failed} check(s)`);
  process.exit(1);
}
console.log("\nOK — all M2 endpoints green");
