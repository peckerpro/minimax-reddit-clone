// server/lib/posts.mjs
// Sort + time-range + pagination helpers for posts. Shared across
// /api/posts, /api/subreddits/:name/posts, /api/users/:name/posts.

export function hoursSince(iso) {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

const SORTS = {
  best:   (a, b) => b.score - a.score,
  hot:    (a, b) =>
    (b.score / Math.max(1, hoursSince(b.created_at) + 2)) -
    (a.score / Math.max(1, hoursSince(a.created_at) + 2)),
  new:    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  top:    (a, b) => b.score - a.score,
  rising: (a, b) => (b.comments_count || 0 - a.comments_count || 0)
                 - ((a.comments_count || 0) - (b.comments_count || 0)),
  controversial: (a, b) => Math.abs(b.score) - Math.abs(a.score),
};

const T_RANGES_MS = {
  hour:  3_600_000,
  day:   86_400_000,
  week:  7 * 86_400_000,
  month: 30 * 86_400_000,
  year:  365 * 86_400_000,
};

export function sortPosts(posts, sort) {
  const cmp = SORTS[sort] || SORTS.best;
  return posts.slice().sort(cmp);
}

export function applyTimeRange(posts, range) {
  if (!range || range === "all") return posts;
  const max = T_RANGES_MS[range];
  if (!max) return posts;
  const now = Date.now();
  return posts.filter((p) => now - new Date(p.created_at).getTime() <= max);
}

export function paginate(url) {
  const limit = Math.min(Number(url.searchParams.get("limit")) || 25, 100);
  const after = url.searchParams.get("after") || null;
  return { limit, after };
}
