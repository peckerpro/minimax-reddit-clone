// scripts/api-test.mjs
// Regression test: ensure every api method actually returns the right shape.
// Stubbed fetch — talks to a stub, NOT a real server, so this works
// in CI without spinning up the v3.0.0 backend. (The contract between
// the stub and the server is verified separately by scripts/_smoke-m2.mjs.)

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Load all mock JSON once
const mocks = {
  subreddits: JSON.parse(await readFile(resolve(ROOT, "src/data/subreddits.json"), "utf8")).subreddits,
  posts:       JSON.parse(await readFile(resolve(ROOT, "src/data/posts.json"),       "utf8")).posts,
  users:       JSON.parse(await readFile(resolve(ROOT, "src/data/users.json"),       "utf8")).users,
  comments:    JSON.parse(await readFile(resolve(ROOT, "src/data/comments.json"),    "utf8")).comments,
  rules:       JSON.parse(await readFile(resolve(ROOT, "src/data/rules.json"),       "utf8")).rules,
};
mocks.comments = mocks.comments || [];

// stub the dom-ish globals dom.js needs
globalThis.window = { addEventListener() {}, location: { hash: "" } };
globalThis.document = {
  getElementById: () => null,
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
  createElement: () => ({ appendChild() {}, setAttribute() {}, addEventListener() {}, style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {} }),
  createDocumentFragment: () => ({ appendChild() {} }),
  addEventListener() {},
  head: { appendChild() {} },
};
globalThis.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
globalThis.structuredClone = (v) => JSON.parse(JSON.stringify(v));

// v3.0.0 fetch stub: maps /api/* URLs to the same JSON files that
// the v2.x mock read. The real server (started by `npm run dev`) is
// tested in scripts/_smoke-m2.mjs.
function jsonResp(obj, status = 200) {
  return { ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj) };
}
globalThis.fetch = async (url, opts) => {
  const u = new URL(url, "http://stub");
  const path = u.pathname;
  const q = u.searchParams;

  if (path === "/api/subreddits" || path === "/api/subreddits/") {
    const limit = Number(q.get("limit")) || 100;
    const needle = (q.get("q") || "").toLowerCase();
    let list = mocks.subreddits;
    if (needle) list = list.filter((s) => s.name.toLowerCase().includes(needle) || s.display.toLowerCase().includes(needle));
    return jsonResp(list.slice(0, limit));
  }

  // /api/subreddits/:name(/posts|related|rules)
  let m = path.match(/^\/api\/subreddits\/([^/]+)(?:\/(posts|related|rules))?$/);
  if (m) {
    const sub = mocks.subreddits.find((s) => s.name === decodeURIComponent(m[1]));
    if (!sub) return jsonResp({ error: "not_found" }, 404);
    const subaction = m[2];
    if (!subaction) {
      return jsonResp({
        ...sub, rules: sub.rules || (mocks.rules[m[1]] || []),
        weeklyVisitors: sub.weeklyVisitors, weeklyContributors: sub.weeklyContributors, members: sub.members,
      });
    }
    if (subaction === "rules") return jsonResp(sub.rules || mocks.rules[m[1]] || []);
    if (subaction === "related") {
      const sameCat = mocks.subreddits.filter((s) => s.name !== sub.name && s.category === sub.category);
      return jsonResp(sameCat.slice(0, Number(q.get("n")) || 6));
    }
    if (subaction === "posts") {
      const sort = q.get("sort") || "best";
      const t = q.get("t") || "all";
      const limit = Number(q.get("limit")) || 25;
      const now = Date.now();
      const limits = { hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3, year: 365 * 86400e3 };
      let list = mocks.posts.filter((p) => p.subreddit === sub.name);
      if (t !== "all") list = list.filter((p) => now - new Date(p.createdAt).getTime() <= limits[t]);
      if (sort === "top") list.sort((a, b) => b.score - a.score);
      else if (sort === "new") list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      else if (sort === "hot") list.sort((a, b) => b.score / Math.max(1, (now - new Date(a.createdAt)) / 3.6e6) - a.score / Math.max(1, (now - new Date(b.createdAt)) / 3.6e6));
      return jsonResp(list.slice(0, limit));
    }
  }

  // /api/posts[/:id[/(comments|related|crossposts)]]
  m = path.match(/^\/api\/posts\/([^/]+)(?:\/(comments|related|crossposts))?$/);
  if (m) {
    const post = mocks.posts.find((p) => p.id === m[1]);
    if (path.endsWith("/comments")) {
      if (!post) return jsonResp([]);
      return jsonResp(mocks.comments.filter((c) => c.postId === m[1]));
    }
    if (path.endsWith("/related")) {
      if (!post) return jsonResp([]);
      return jsonResp(mocks.posts.filter((p) => p.id !== m[1] && p.subreddit === post.subreddit).sort((a, b) => b.score - a.score).slice(0, Number(q.get("n")) || 4));
    }
    if (path.endsWith("/crossposts")) return jsonResp([]);
    if (!post) return jsonResp({ error: "not_found" }, 404);
    return jsonResp(post);
  }

  if (path === "/api/posts" || path === "/api/posts/") {
    const sort = q.get("sort") || "best";
    const t = q.get("t") || "all";
    const subreddit = q.get("subreddit");
    const author = (q.get("author") || "").replace(/^u_/, "");
    const limit = Number(q.get("limit")) || 25;
    let list = mocks.posts.slice();
    if (subreddit) list = list.filter((p) => p.subreddit === subreddit);
    if (author) list = list.filter((p) => (p.author || "").replace(/^u_/, "") === author);
    const now = Date.now();
    const limits = { hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3, year: 365 * 86400e3 };
    if (t !== "all") list = list.filter((p) => now - new Date(p.createdAt).getTime() <= limits[t]);
    if (sort === "top") list.sort((a, b) => b.score - a.score);
    else if (sort === "new") list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return jsonResp(list.slice(0, limit));
  }

  // /api/users/:name(/posts|/comments)?
  m = path.match(/^\/api\/users\/([^/]+)(?:\/(posts|comments))?$/);
  if (m) {
    const name = decodeURIComponent(m[1]).replace(/^u\//, "").replace(/^u_/, "");
    const u = mocks.users.find((x) => x.name === name);
    if (path.endsWith("/posts")) {
      const sort = q.get("sort") || "hot";
      const t = q.get("t") || "all";
      const limit = Number(q.get("limit")) || 25;
      let list = mocks.posts.filter((p) => (p.author || "").replace(/^u_/, "") === name);
      const now = Date.now();
      const limits = { hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3, year: 365 * 86400e3 };
      if (t !== "all") list = list.filter((p) => now - new Date(p.createdAt).getTime() <= limits[t]);
      if (sort === "top") list.sort((a, b) => b.score - a.score);
      else if (sort === "new") list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return jsonResp(list.slice(0, limit));
    }
    if (path.endsWith("/comments")) return jsonResp([]);
    if (!u) return jsonResp({ error: "not_found" }, 404);
    return jsonResp(u);
  }

  if (path === "/api/search" || path === "/api/search/") {
    const needle = (q.get("q") || "").toLowerCase();
    const type = (q.get("type") || "posts,users,comments,subreddits").split(",");
    const out = { posts: [], users: [], comments: [], subreddits: [] };
    if (!needle) return jsonResp(out);
    if (type.includes("posts")) out.posts = mocks.posts.filter((p) => (p.title + " " + (p.body || "") + " " + p.subreddit).toLowerCase().includes(needle)).slice(0, 30);
    if (type.includes("users")) out.users = mocks.users.filter((u) => u.name.toLowerCase().includes(needle) || (u.bio || "").toLowerCase().includes(needle)).slice(0, 30);
    if (type.includes("subreddits")) out.subreddits = mocks.subreddits.filter((s) => s.name.toLowerCase().includes(needle) || s.display.toLowerCase().includes(needle)).slice(0, 30);
    if (type.includes("comments")) out.comments = mocks.comments.filter((c) => c.body.toLowerCase().includes(needle)).slice(0, 30);
    return jsonResp(out);
  }

  // ── M3 write endpoints (stub) ─────────────────────────
  // The real handlers live in server/handlers/interactions.mjs
  // and are tested by scripts/_smoke-m3.mjs. The stub just
  // returns a plausible response so the api-test verifies the
  // SPA-side shape contract (return type, body parsing).

  let mM3 = path.match(/^\/api\/posts\/([^/]+)\/(vote|save|hide)$/);
  if (mM3) {
    const post = mocks.posts.find((p) => p.id === mM3[1]);
    if (!post) return jsonResp({ error: "not_found" }, 404);
    const action = mM3[2];
    if (action === "vote") {
      let body = {};
      try { body = JSON.parse(opts?.body || "{}"); } catch {}
      return jsonResp({ score: post.score, userVote: body.direction || 0, authorKarma: 1, prev: 0, delta: body.direction || 0 });
    }
    if (action === "save") return jsonResp({ saved: true });
    if (action === "hide") return jsonResp({ hidden: true });
  }
  mM3 = path.match(/^\/api\/comments\/([^/]+)\/vote$/);
  if (mM3) {
    return jsonResp({ score: 1, userVote: 1, authorKarma: 1, prev: 0, delta: 1 });
  }

  // default: 404
  return jsonResp({ error: "not_found", message: `no stub for ${path}` }, 404);
};

const { api } = await import("../src/js/api.js");

const cases = [
  ["listSubreddits",      () => api.listSubreddits(),    (r) => Array.isArray(r) && r.length > 0],
  ["popularSubreddits",   () => api.popularSubreddits(), (r) => Array.isArray(r) && r.length > 0],
  ["searchSubreddits",    () => api.searchSubreddits("tech"), (r) => Array.isArray(r)],
  ["getSubreddit",        () => api.getSubreddit("technology"), (r) => r && r.name === "technology"],
  ["getSubreddit miss",   () => api.getSubreddit("nope_xyz"), (r) => r === null],

  ["listPosts home",      () => api.listPosts({}), (r) => Array.isArray(r) && r.length > 0],
  ["listPosts by sub",    () => api.listPosts({ subreddit: "technology" }), (r) => Array.isArray(r) && r.every((p) => p.subreddit === "technology")],
  ["listPosts by author", () => api.listPosts({ author: "u_ada" }), (r) => Array.isArray(r) && r.every((p) => p.author === "u_ada")],
  ["listPosts with t",    () => api.listPosts({ t: "day" }), (r) => Array.isArray(r)],
  ["listPosts with sort", () => api.listPosts({ sort: "top" }), (r) => Array.isArray(r)],

  ["getPost",             () => api.getPost("p001"), (r) => r && r.id === "p001"],
  ["getPost miss",        () => api.getPost("p_xyz"), (r) => r === null],

  ["relatedPosts",        () => api.relatedPosts("p001", 4), (r) => Array.isArray(r)],
  ["relatedById",         () => api.relatedById("p003", 4), (r) => Array.isArray(r)],
  ["crossPosts",          () => api.crossPosts("p003", 3), (r) => Array.isArray(r)],

  ["listComments",        () => api.listComments("p003"), (r) => Array.isArray(r) && r.length > 0],
  ["listComments miss",   () => api.listComments("p_zzz"), (r) => Array.isArray(r) && r.length === 0],

  ["getRules",            () => api.getRules("technology"), (r) => Array.isArray(r) && r.length > 0],
  ["getRules miss",       () => api.getRules("nope_zzz"), (r) => Array.isArray(r) && r.length === 0],

  ["listAwards",          () => api.listAwards(), (r) => Array.isArray(r)],
  ["listShareTargets",    () => api.listShareTargets(), (r) => Array.isArray(r)],
  ["listReportReasons",   () => api.listReportReasons(), (r) => Array.isArray(r)],

  ["getUser",             () => api.getUser("ada_lovelace_jr"), (r) => r && r.name === "ada_lovelace_jr"],
  ["getUser miss",        () => api.getUser("u_nobody"), (r) => r === null],

  ["searchPosts",         () => api.searchPosts("gaming"), (r) => Array.isArray(r)],

  // ── M3 writes ─────────────────────────────────────────
  ["votePost upvote",     () => api.votePost("p001", 1),
    (r) => r && typeof r.score === "number" && r.userVote === 1],
  ["votePost clear",      () => api.votePost("p001", 0),
    (r) => r && r.userVote === 0],
  ["voteComment upvote",  () => api.voteComment("c001", 1),
    (r) => r && typeof r.score === "number" && r.userVote === 1],
  ["toggleSavePost",      () => api.toggleSavePost("p001"),
    (r) => r && typeof r.saved === "boolean"],
  ["toggleHidePost",      () => api.toggleHidePost("p001"),
    (r) => r && typeof r.hidden === "boolean"],
];

let bad = 0;
for (const [name, fn, check] of cases) {
  try {
    const r = await fn();
    const ok = check(r);
    if (ok) console.log(`  ✓ ${name}`);
    else { console.error(`  ✗ ${name}: returned ${JSON.stringify(r)?.slice(0, 80)}`); bad++; }
  } catch (err) {
    console.error(`  ✗ ${name}: THREW ${err.message}`);
    bad++;
  }
}

console.log(`\n${cases.length - bad} ok, ${bad} bad`);
process.exit(bad ? 1 : 0);
