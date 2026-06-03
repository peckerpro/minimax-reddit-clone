// scripts/_e2e.mjs
// M8 — end-to-end pipeline test. Hits the real HTTP server and
// walks through one realistic user journey:
//   1. register alice
//   2. alice posts a text post to /r/technology
//   3. register bob
//   4. bob comments on alice's post
//   5. bob replies to his own comment
//   6. alice upvotes bob's comment
//   7. bob subscribes to /r/technology
//   8. bob files a report on alice's post
//   9. upgrade alice to admin (direct DB, since we don't have an
//      /api/admin/users endpoint)
//  10. alice resolves the report with action=remove_content
//  11. verify the post is 404'd on the public read API
//  12. verify alice's karma is correct
//
// Exits 0 on success, 1 on any assertion failure.

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { unlinkSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = 5175;
const DB_PATH = `${ROOT}/data/e2e-${PORT}.db`;

let failed = 0;
function ok(label, cond, extra = "") {
  const mark = cond ? "[ok]" : "[FAIL]";
  console.log(`${mark} ${label}${extra ? "  " + extra : ""}`);
  if (!cond) failed++;
}

function request(method, path, body, cookie = "") {
  return new Promise((resolve, reject) => {
    const data = body == null ? "" : JSON.stringify(body);
    const req = http.request(
      {
        method,
        hostname: "127.0.0.1",
        port: PORT,
        path,
        // Force a fresh connection per request — node:http's keep-alive
        // can hang the second request on Windows when the server is
        // also doing per-request DB work.
        agent: false,
        headers: {
          "content-type": body == null ? "" : "application/json",
          "content-length": data.length,
          "connection": "close",
          cookie,
        },
      },
      (res) => {
        let text = "";
        res.on("data", (b) => { text += b; });
        res.on("end", () => {
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch {}
          // node:http returns set-cookie as an array of header values.
          // Pull the first one (there's only one anyway).
          const headers = res.headers;
          if (Array.isArray(headers["set-cookie"])) {
            headers["set-cookie"] = headers["set-cookie"][0];
          }
          resolve({ status: res.statusCode, headers, body: json, text });
        });
      }
    );
    req.on("error", (e) => reject(new Error(`${method} ${path} → ${e.message}`)));
    req.setTimeout(10000, () => req.destroy(new Error("timeout")));
    if (data) req.write(data);
    req.end();
  });
}

// ── spawn server ────────────────────────────────────────
console.log(`[e2e] spawning server on :${PORT} (db: ${DB_PATH})`);
const server = spawn(process.execPath, ["server/index.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DB_PATH },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", () => {}); // suppress noise

await new Promise((resolve, reject) => {
  const onData = (b) => {
    if (b.toString().includes(`http://localhost:${PORT}`)) {
      server.stdout.off("data", onData);
      resolve();
    }
  };
  server.stdout.on("data", onData);
  setTimeout(() => reject(new Error("server didn't start within 10s")), 10000);
});

try {
  // ── 1. register alice ──────────────────────────────────
  const aliceReg = await request("POST", "/api/auth/register",
    { name: "e2ealice", email: "e2ealice@x.com", password: "correcthorse" });
  ok("1. alice registers", aliceReg.status === 201);
  const aliceCookie = (aliceReg.headers["set-cookie"] || "").split(";")[0];

  // ── 2. alice posts to /r/technology ─────────────────────
  const postRes = await request("POST", "/api/posts", {
    subreddit: "technology", kind: "text", title: "e2e test post", body: "hello world",
  }, aliceCookie);
  ok("2. alice posts", postRes.status === 201);
  const postId = postRes.body?.id;
  ok("   post.id starts with p_", postId?.startsWith("p_"));

  // ── 3. register bob ────────────────────────────────────
  const bobReg = await request("POST", "/api/auth/register",
    { name: "e2ebob", email: "e2ebob@x.com", password: "correcthorse" });
  ok("3. bob registers", bobReg.status === 201);
  const bobCookie = (bobReg.headers["set-cookie"] || "").split(";")[0];

  // ── 4. bob comments on alice's post ────────────────────
  const cmt1 = await request("POST", `/api/posts/${postId}/comments`,
    { body: "nice post!" }, bobCookie);
  ok("4. bob comments on alice's post", cmt1.status === 201);
  const cmtId = cmt1.body?.id;
  ok("   cmt.id starts with c_", cmtId?.startsWith("c_"));

  // ── 5. bob replies to his own comment ──────────────────
  const cmt2 = await request("POST", `/api/posts/${postId}/comments`,
    { body: "I mean really nice", parentId: cmtId }, bobCookie);
  ok("5. bob replies to his own comment", cmt2.status === 201);
  ok("   parentId chains", cmt2.body?.parentId === cmtId);
  ok("   depth = 1", cmt2.body?.depth === 1);

  // ── 6. alice upvotes bob's top comment ─────────────────
  const vote = await request("POST", `/api/comments/${cmtId}/vote`,
    { direction: 1 }, aliceCookie);
  ok("6. alice upvotes bob's comment", vote.status === 200);
  ok("   userVote = 1", vote.body?.userVote === 1);
  ok("   bob's karma = 2 (1 base + 1 upvote)", vote.body?.authorKarma === 2);

  // ── 7. bob subscribes to /r/technology ──────────────────
  const sub = await request("POST", "/api/subreddits/technology/subscribe",
    { action: "join" }, bobCookie);
  ok("7. bob subscribes to /r/technology", sub.body?.subscribed === true);

  // ── 8. bob files a report on alice's post ──────────────
  const rep = await request("POST", "/api/reports",
    { targetKind: "post", targetId: postId, reason: "spam", detail: "test" }, bobCookie);
  ok("8. bob files a report", rep.status === 201);
  const reportId = rep.body?.id;
  ok("   report.id starts with r_", reportId?.startsWith("r_"));

  // ── 9. promote alice to admin (direct DB) ─────────────
  {
    const db = new DatabaseSync(DB_PATH);
    db.prepare("UPDATE users SET role = 'admin' WHERE name = 'e2ealice'").run();
    const row = db.prepare("SELECT role FROM users WHERE name = 'e2ealice'").get();
    ok("9. alice promoted to admin (direct DB)", row?.role === "admin");
    db.close();
  }

  // ── 10. alice resolves with remove_content ────────────
  const resolve = await request("POST", `/api/admin/reports/${reportId}/resolve`,
    { action: "remove_content" }, aliceCookie);
  ok("10. alice (admin) resolves with remove_content", resolve.status === 200);
  ok("    action = remove_content", resolve.body?.action === "remove_content");

  // ── 11. the post is now 404 on public reads ────────────
  const get = await request("GET", `/api/posts/${postId}`);
  ok("11. removed post is 404 on /api/posts/:id", get.status === 404);
  const cmtList = await request("GET", `/api/posts/${postId}/comments`);
  ok("    /api/posts/:id/comments also 404", cmtList.status === 404);
  const list = await request("GET", "/api/posts?subreddit=technology");
  const inList = (list.body || []).some((p) => p.id === postId);
  ok("    removed post NOT in /api/posts list", !inList);

  // ── 12. check karma is correct ───────────────────────
  const bob = await request("GET", "/api/users/e2ebob");
  ok("12. bob.karma = 2 (signup grant is 1 + upvote gives 1)", bob.body?.karma === 2);

  console.log(`\n[e2e] ${failed === 0 ? "PASS" : `FAIL (${failed} failed)`}`);
} finally {
  // Cleanup
  server.kill("SIGTERM");
  await sleep(200);
  for (const suffix of ["", "-wal", "-shm"]) {
    try { unlinkSync(`${DB_PATH}${suffix}`); } catch {}
  }
  process.exit(failed === 0 ? 0 : 1);
}
