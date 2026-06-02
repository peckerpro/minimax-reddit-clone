// Mock API. Reads JSON via static import (works in modern browsers and in our
// dev server). Each method returns a Promise so the call sites don't have to
// change when we swap in a real backend.

import subreddits from "../data/subreddits.json" with { type: "json" };
import posts      from "../data/posts.json"      with { type: "json" };
import users      from "../data/users.json"      with { type: "json" };
import comments   from "../data/comments.json"   with { type: "json" };
import rules      from "../data/rules.json"      with { type: "json" };

const NETWORK_DELAY_MS = 60;

function delay(value, ms = NETWORK_DELAY_MS) {
  return new Promise((res) => setTimeout(() => res(structuredClone(value)), ms));
}

// ── indexes ─────────────────────────────────────────────
const subredditIndex = new Map(subreddits.subreddits.map((s) => [s.name.toLowerCase(), s]));
const postIndex      = new Map(posts.posts.map((p) => [p.id, p]));
const userIndex      = new Map(users.users.map((u) => [u.name.toLowerCase(), u]));

// ── helpers ─────────────────────────────────────────────
function getUser(name) {
  return userIndex.get(String(name).replace(/^u\//, "").toLowerCase()) || null;
}

function getSub(name) {
  return subredditIndex.get(String(name).replace(/^r\//, "").toLowerCase()) || null;
}

// ── sort ────────────────────────────────────────────────
const SORTS = {
  best:    (a, b) => b.score - a.score,
  hot:     (a, b) => (b.score / Math.max(1, hoursSince(b.createdAt) + 2)) - (a.score / Math.max(1, hoursSince(a.createdAt) + 2)),
  new:     (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  top:     (a, b) => b.score - a.score,
  rising:  (a, b) => (b.comments - a.comments) - (a.comments - b.comments),
};

function hoursSince(iso) {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

// ── public API ──────────────────────────────────────────
export const api = {
  // ── users ─────────────────────────────────────────
  /** @returns {Promise<object|null>} */
  async getUser(name) {
    return delay(getUser(name));
  },

  // ── subreddits ────────────────────────────────────
  async listSubreddits() {
    return delay(subreddits.subreddits.slice());
  },
  async getSubreddit(name) {
    return delay(getSub(name));
  },
  async popularSubreddits(n = 5) {
    return delay(subreddits.subreddits.slice(0, n));
  },

  // ── rules ──────────────────────────────────────────
  /**
   * @param {string} subredditName
   * @returns {Promise<Array<{n:number,title:string,description:string}>>}
   */
  async getRules(subredditName) {
    const name = String(subredditName).replace(/^r\//, "").toLowerCase();
    return delay(rules.rules[name] || []);
  },

  // ── posts ─────────────────────────────────────────
  /**
   * @param {Object} opts
   * @param {string} [opts.subreddit]   filter by subreddit name
   * @param {"best"|"hot"|"new"|"top"|"rising"} [opts.sort]
   * @param {number} [opts.limit]
   * @param {number} [opts.offset]
   */
  async listPosts(opts = {}) {
    const sort = SORTS[opts.sort] || SORTS.best;
    let list = posts.posts.slice();
    if (opts.subreddit) {
      const sub = String(opts.subreddit).replace(/^r\//, "").toLowerCase();
      list = list.filter((p) => p.subreddit.toLowerCase() === sub);
    }
    list.sort(sort);
    const offset = opts.offset || 0;
    const limit = opts.limit || 25;
    return delay(list.slice(offset, offset + limit));
  },

  /** @returns {Promise<object|null>} */
  async getPost(id) {
    return delay(postIndex.get(id) || null);
  },

  // ── comments ───────────────────────────────────────
  /**
   * @param {string} postId
   * @returns {Promise<object[]>}
   */
  async listComments(postId) {
    return delay(comments.comments.filter((c) => c.postId === postId));
  },

  /**
   * Posts related to a given one: same subreddit, exclude self, top by score.
   * @param {string} id
   * @param {number} [n=4]
   */
  async relatedPosts(id, n = 4) {
    const p = postIndex.get(id);
    if (!p) return delay([]);
    const list = posts.posts
      .filter((q) => q.id !== id && q.subreddit === p.subreddit)
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
    return delay(list);
  },

  /**
   * Search posts by free text. Naive: case-insensitive substring on title + body.
   * @param {string} q
   * @param {Object} [opts]
   */
  async searchPosts(q, opts = {}) {
    const needle = String(q || "").trim().toLowerCase();
    if (!needle) return delay([]);
    const list = posts.posts.filter((p) => {
      const hay = (p.title + " " + (p.body || "") + " " + p.subreddit).toLowerCase();
      return hay.includes(needle);
    });
    return delay(list.slice(0, 30));
  },

  // ── combined helpers ──────────────────────────────
  /** Hydrate a post with its subreddit and author objects. */
  async hydratePost(post) {
    if (!post) return null;
    return delay({
      ...post,
      _subreddit: getSub(post.subreddit),
      _author: getUser(post.author),
    });
  },
};
