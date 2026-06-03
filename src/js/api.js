// src/js/api.js
// v3.0.0: real backend. Every method that previously read a JSON file
// in src/data/*.json now hits /api/*. Method signatures and return
// types are unchanged, so the rest of the SPA needs no edits.

const BASE = "";  // same-origin

async function getJson(path) {
  const r = await fetch(BASE + path, { credentials: "same-origin" });
  if (!r.ok) {
    if (r.status === 404) return null;
    throw new Error(`GET ${path} ${r.status}`);
  }
  return r.json();
}

async function getJsonOr(path, fallback) {
  try { return await getJson(path); }
  catch (e) {
    console.warn(`[api] ${e.message} — using fallback`);
    return fallback;
  }
}

// POST a JSON body. `null` body ⇒ empty body. Returns the parsed
// response on 2xx, throws on 4xx (except 401 → "unauthorized" string
// for callers to detect without a status property), returns null on
// 404 so the SPA can silently no-op a toggle.
async function postJson(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST",
    credentials: "same-origin",
    headers: body == null ? {} : { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (r.status === 404) return null;
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) {
    let msg = `POST ${path} ${r.status}`;
    try { const j = await r.json(); if (j?.message) msg = j.message; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// ── static data that the backend doesn't serve yet (awards, share
//    targets, report reasons). Hardcoded here so the SPA still
//    works; M8 will move these to /api/awards etc.
const AWARDS = [
  { id: "helpful", name: "Helpful", icon: "thumbsUp", price: 100, color: "#46d160" },
  { id: "wholesome", name: "Wholesome", icon: "heart", price: 50, color: "#ffb000" },
  { id: "heartwarming", name: "Heartwarming", icon: "heartFilled", price: 200, color: "#ff4500" },
  { id: "fire", name: "Fire", icon: "flame", price: 100, color: "#d40000" },
  { id: "mind blown", name: "Mind Blown", icon: "lightning", price: 500, color: "#a02cd2" },
  { id: "lol", name: "LOL", icon: "smile", price: 75, color: "#ffd635" },
  { id: "wow", name: "Wow", icon: "star", price: 300, color: "#ffd635" },
  { id: "thanks", name: "Thanks", icon: "hands", price: 25, color: "#7193ff" },
];
const SHARE_TARGETS = [
  { id: "copy",  label: "复制链接",          icon: "link" },
  { id: "wechat", label: "微信",              icon: "wechat" },
  { id: "weibo",  label: "微博",              icon: "weibo" },
  { id: "qq",     label: "QQ",                icon: "qq" },
  { id: "twitter",label: "X (Twitter)",       icon: "twitter" },
  { id: "reddit", label: "Reddit",            icon: "reddit" },
  { id: "qr",     label: "二维码",            icon: "qr" },
  { id: "embed",  label: "嵌入",              icon: "embed" },
];
const REPORT_REASONS = [
  { id: "spam",         label: "垃圾信息 / 推广",    detail: false },
  { id: "harassment",   label: "骚扰或人身攻击",     detail: true  },
  { id: "hate",         label: "仇恨言论",           detail: true  },
  { id: "violence",     label: "暴力或血腥内容",     detail: true  },
  { id: "selfharm",     label: "自残 / 自杀内容",   detail: true  },
  { id: "sexual",       label: "色情内容",           detail: false },
  { id: "minor",        label: "涉及未成年人",       detail: true  },
  { id: "dox",          label: "个人信息泄露",       detail: true  },
  { id: "illegal",      label: "违法活动",           detail: true  },
  { id: "other",        label: "其他 (请说明)",      detail: true  },
];

export const api = {
  // ── users ─────────────────────────────────────────
  async getUser(name) {
    return getJson(`/api/users/${encodeURIComponent(name)}`);
  },
  async searchUsers(prefix) {
    const q = (prefix || "").toLowerCase();
    if (!q) return [];
    return getJsonOr(`/api/search?q=${encodeURIComponent(prefix)}&type=users&limit=20`, []);
  },

  // ── subreddits ────────────────────────────────────
  async listSubreddits() {
    return getJsonOr("/api/subreddits?limit=100", []);
  },
  async getSubreddit(name) {
    return getJson(`/api/subreddits/${encodeURIComponent(name)}`);
  },
  async popularSubreddits(n = 15) {
    const all = await getJsonOr("/api/subreddits?limit=15", []);
    return (all || []).slice(0, n);
  },
  async searchSubreddits(prefix) {
    const q = (prefix || "").toLowerCase();
    if (!q) return [];
    const r = await getJsonOr(`/api/search?q=${encodeURIComponent(prefix)}&type=subreddits&limit=30`, {});
    return r?.subreddits || [];
  },
  async relatedSubreddits(name, n = 6) {
    return getJsonOr(`/api/subreddits/${encodeURIComponent(name)}/related?n=${n}`, []);
  },

  // ── posts ─────────────────────────────────────────
  async listPosts(opts = {}) {
    const params = new URLSearchParams();
    if (opts.subreddit) params.set("subreddit", String(opts.subreddit).replace(/^r\//, ""));
    if (opts.author) params.set("author", String(opts.author).replace(/^u\//, "").replace(/^u_/, ""));
    if (opts.sort) params.set("sort", opts.sort);
    if (opts.t && opts.t !== "all") params.set("t", opts.t);
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.offset) params.set("offset", String(opts.offset));
    if (opts.after) params.set("after", opts.after);
    return getJsonOr(`/api/posts?${params.toString()}`, []);
  },
  async getPost(id) {
    return getJson(`/api/posts/${encodeURIComponent(id)}`);
  },
  async relatedPosts(id, n = 4) {
    return getJsonOr(`/api/posts/${encodeURIComponent(id)}/related?n=${n}`, []);
  },
  async crossPosts(id, n = 3) {
    // Backend returns [] until M3+ adds a crossposts table.
    return getJsonOr(`/api/posts/${encodeURIComponent(id)}/crossposts?n=${n}`, []);
  },
  async relatedById(id, n = 4) {
    // M2 backend doesn't expose related.json — fall back to /related.
    return getJsonOr(`/api/posts/${encodeURIComponent(id)}/related?n=${n}`, []);
  },
  async searchPosts(q) {
    const needle = (q || "").trim();
    if (!needle) return [];
    const r = await getJsonOr(`/api/search?q=${encodeURIComponent(needle)}&type=posts&limit=30`, {});
    return r?.posts || [];
  },

  // ── comments ───────────────────────────────────────
  async listComments(postId) {
    return getJsonOr(`/api/posts/${encodeURIComponent(postId)}/comments`, []);
  },

  // ── rules ─────────────────────────────────────────
  async getRules(subredditName) {
    const name = String(subredditName || "").replace(/^r\//, "");
    // Backend returns 404 (=> null) for missing subs. Fall back to []
    // so the SPA can render an empty rule list without crashing.
    return (await getJson(`/api/subreddits/${encodeURIComponent(name)}/rules`)) || [];
  },

  // ── awards / share / report (static until M8) ──────
  async listAwards() { return AWARDS; },
  async listShareTargets() { return SHARE_TARGETS; },
  async listReportReasons() { return REPORT_REASONS; },

  // ── combined helpers ──────────────────────────────
  async hydratePost(post) {
    if (!post) return null;
    const [sub, author] = await Promise.all([
      this.getSubreddit(post.subreddit),
      this.getUser(post.author),
    ]);
    return { ...post, _subreddit: sub, _author: author };
  },

  // ── M3 writes: votes / save / hide ────────────────
  // `direction` is the RESOLVED 4-state value: 1 (up), -1 (down),
  // or 0 (clear). The client computes it from the 4-state machine
  // in state.votePost / state.voteComment; the server applies the
  // delta to the stored previous vote and updates score + karma
  // atomically. Returns {score, userVote, authorKarma, prev, delta}.
  async votePost(postId, direction) {
    return postJson(`/api/posts/${encodeURIComponent(postId)}/vote`, { direction });
  },
  async voteComment(commentId, direction) {
    return postJson(`/api/comments/${encodeURIComponent(commentId)}/vote`, { direction });
  },
  // Save / hide are toggle-on-row-exists. Returns {saved:true|false}
  // or {hidden:true|false}. null on 404 (post gone).
  async toggleSavePost(postId) {
    return postJson(`/api/posts/${encodeURIComponent(postId)}/save`, {});
  },
  async toggleHidePost(postId) {
    return postJson(`/api/posts/${encodeURIComponent(postId)}/hide`, {});
  },
};
