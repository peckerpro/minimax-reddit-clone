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
  related: null,
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

// apply time range filter to a list of posts
function applyTimeRange(posts, range) {
  if (!range || range === "all") return posts;
  const now = Date.now();
  const limits = { hour: 3600_000, day: 86400_000, week: 7 * 86400_000, month: 30 * 86400_000, year: 365 * 86400_000 };
  const max = limits[range];
  if (!max) return posts;
  return posts.filter((p) => now - new Date(p.createdAt).getTime() <= max);
}

export const api = {
  // ── users ─────────────────────────────────────────
  async getUser(name) {
    const { users } = await load("users");
    const idx = indexFor("users", users, "name");
    return delay(idx.get(String(name).replace(/^u\//, "").toLowerCase()) || null);
  },
  async searchUsers(prefix) {
    const { users } = await load("users");
    const p = String(prefix || "").toLowerCase();
    return delay(users.filter((u) => u.name.toLowerCase().includes(p)).slice(0, 20));
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
  async popularSubreddits(n = 15) {
    const { subreddits } = await load("subreddits");
    return delay(subreddits.slice(0, n));
  },
  async searchSubreddits(prefix) {
    const { subreddits } = await load("subreddits");
    const p = String(prefix || "").toLowerCase();
    return delay(subreddits.filter((s) => s.name.toLowerCase().includes(p) || s.display.toLowerCase().includes(p)).slice(0, 30));
  },
  async relatedSubreddits(name, n = 6) {
    const { subreddits } = await load("subreddits");
    const me = subreddits.findIndex((s) => s.name === name);
    if (me < 0) return delay([]);
    const sameCategory = subreddits.filter((s) => s.name !== name && s.category === subreddits[me].category);
    return delay(sameCategory.slice(0, n));
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
    if (opts.author) {
      const a = String(opts.author).replace(/^u\//, "").toLowerCase();
      list = list.filter((p) => (p.author || "").replace(/^u\//, "").toLowerCase() === a);
    }
    if (opts.t && opts.t !== "all") list = applyTimeRange(list, opts.t);
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

  async crossPosts(id, n = 3) {
    const { related } = await load("related");
    const list = related?.crossposts || [];
    return delay(list.filter((x) => x.sourcePostId === id).slice(0, n));
  },

  async relatedById(id, n = 4) {
    // `related` is the top-level of related.json which has shape
    // { "related": [...mappings...], "comments": {...}, ... }
    // The `related` key inside is the list of postId → relatedPostIds maps.
    // We re-load the file to get the inner structure (avoid double-destructure).
    const data = await load("related");
    const map = (data?.related || []).find((r) => r.postId === id);
    if (!map) return delay([]);
    const { posts } = await load("posts");
    const idx = indexFor("posts", posts, "id");
    return delay((map.relatedPostIds || []).map((id) => idx.get(id)).filter(Boolean).slice(0, n));
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
    // `comments` IS the array (loaded from comments.json which has shape
    // { "comments": [...] }). Don't do comments.comments — that's undefined.
    return delay((comments || []).filter((c) => c.postId === postId));
  },

  // ── rules ──────────────────────────────────────────
  async getRules(subredditName) {
    // rules.json has shape { "rules": { subreddit: [...], ... } }
    // After destructuring { rules } we already have the inner object, so
    // we look up by name directly — NOT rules.rules[name].
    const { rules } = await load("rules");
    const name = String(subredditName).replace(/^r\//, "").toLowerCase();
    return delay((rules || {})[name] || []);
  },

  // ── awards / share / report ───────────────────────
  async listAwards() {
    const { related } = await load("related");
    return delay(related?.awards || []);
  },
  async listShareTargets() {
    const { related } = await load("related");
    return delay(related?.shareTargets || []);
  },
  async listReportReasons() {
    const { related } = await load("related");
    return delay(related?.reportReasons || []);
  },

  // ── combined helpers ──────────────────────────────
  async hydratePost(post) {
    if (!post) return null;
    const [sub, author] = await Promise.all([this.getSubreddit(post.subreddit), this.getUser(post.author)]);
    return delay({ ...post, _subreddit: sub, _author: author });
  },
};
