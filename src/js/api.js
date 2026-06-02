// Mock API. Reads JSON via fetch() at boot — works on every modern browser
// regardless of import-attributes support. Each method returns a Promise so
// the call sites don't have to change when we swap in a real backend.

const NETWORK_DELAY_MS = 60;

const CACHE = {
  subreddits: null,
  posts: null,
  users: null,
  comments: null,
  rules: null,
};

function delay(value, ms = NETWORK_DELAY_MS) {
  return new Promise((res) => setTimeout(() => res(structuredClone(value)), ms));
}

async function load(name) {
  if (CACHE[name]) return CACHE[name];
  const r = await fetch(`/src/data/${name}.json`, { cache: "force-cache" });
  if (!r.ok) throw new Error(`failed to load ${name}.json: ${r.status}`);
  const json = await r.json();
  CACHE[name] = json;
  return json;
}

// ── indexes (built once per dataset) ─────────────────
const indexes = {};
function indexFor(name, items, key) {
  if (!indexes[name]) {
    indexes[name] = new Map(items.map((it) => [String(it[key]).toLowerCase(), it]));
  }
  return indexes[name];
}

// ── sort helpers ──────────────────────────────────────
function hoursSince(iso) {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

const SORTS = {
  best:   (a, b) => b.score - a.score,
  hot:    (a, b) => (b.score / Math.max(1, hoursSince(b.createdAt) + 2)) - (a.score / Math.max(1, hoursSince(a.createdAt) + 2)),
  new:    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  top:    (a, b) => b.score - a.score,
  rising: (a, b) => (b.comments - a.comments) - (a.comments - b.comments),
};

export const api = {
  // ── users ─────────────────────────────────────────
  async getUser(name) {
    const { users } = await load("users");
    const idx = indexFor("users", users, "name");
    return delay(idx.get(String(name).replace(/^u\//, "").toLowerCase()) || null);
  },

  // ── subreddits ────────────────────────────────────
  async listSubreddits() {
    const { subreddits } = await load("subreddits");
    return delay(subreddits.slice());
  },
  async getSubreddit(name) {
    const { subreddits } = await load("subreddits");
    const idx = indexFor("subreddits", subreddits, "name");
    return delay(idx.get(String(name).replace(/^r\//, "").toLowerCase()) || null);
  },
  async popularSubreddits(n = 5) {
    const { subreddits } = await load("subreddits");
    return delay(subreddits.slice(0, n));
  },

  // ── posts ─────────────────────────────────────────
  async listPosts(opts = {}) {
    const { posts } = await load("posts");
    const sort = SORTS[opts.sort] || SORTS.best;
    let list = posts.slice();
    if (opts.subreddit) {
      const sub = String(opts.subreddit).replace(/^r\//, "").toLowerCase();
      list = list.filter((p) => p.subreddit.toLowerCase() === sub);
    }
    list.sort(sort);
    const offset = opts.offset || 0;
    const limit = opts.limit || 25;
    return delay(list.slice(offset, offset + limit));
  },

  async getPost(id) {
    const { posts } = await load("posts");
    const idx = indexFor("posts", posts, "id");
    return delay(idx.get(id) || null);
  },

  async relatedPosts(id, n = 4) {
    const { posts } = await load("posts");
    const idx = indexFor("posts", posts, "id");
    const p = idx.get(id);
    if (!p) return delay([]);
    return delay(
      posts
        .filter((q) => q.id !== id && q.subreddit === p.subreddit)
        .sort((a, b) => b.score - a.score)
        .slice(0, n)
    );
  },

  async searchPosts(q) {
    const { posts } = await load("posts");
    const needle = String(q || "").trim().toLowerCase();
    if (!needle) return delay([]);
    return delay(
      posts
        .filter((p) => {
          const hay = (p.title + " " + (p.body || "") + " " + p.subreddit).toLowerCase();
          return hay.includes(needle);
        })
        .slice(0, 30)
    );
  },

  // ── comments ───────────────────────────────────────
  async listComments(postId) {
    const { comments } = await load("comments");
    return delay(comments.filter((c) => c.postId === postId));
  },

  // ── rules ──────────────────────────────────────────
  async getRules(subredditName) {
    const { rules } = await load("rules");
    const name = String(subredditName).replace(/^r\//, "").toLowerCase();
    return delay(rules[name] || []);
  },

  // ── combined helpers ──────────────────────────────
  async hydratePost(post) {
    if (!post) return null;
    const [sub, author] = await Promise.all([this.getSubreddit(post.subreddit), this.getUser(post.author)]);
    return delay({ ...post, _subreddit: sub, _author: author });
  },
};
