// Regression test: ensure every api method actually returns the right shape.
// Catches bugs like api.listComments returning undefined because of
// `const { comments } = await load(); comments.comments.filter(...)`.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// stub the DOM-ish globals dom.js needs
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
globalThis.fetch = async (url) => {
  // url is like "/src/data/posts.json" — read from disk
  const path = resolve(ROOT, "." + url.split("?")[0].replace("/src/", "/src/"));
  try {
    const text = await readFile(path, "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  } catch (e) {
    return { ok: false, status: 404, json: async () => null, text: async () => "" };
  }
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

  // ── the bug we just fixed ───────────────────────────
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
