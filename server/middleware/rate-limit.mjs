// server/middleware/rate-limit.mjs
// M8.audit (B3): in-memory rate limit for the auth endpoints. A
// per-IP sliding window: N requests per W seconds. In-memory because
// we don't have Redis and the load is small; the trade-off is that
// counts reset on process restart (which is fine for a brute-force
// defense — the attacker also has to reconnect).
//
// Usage (per-route handler wrapper, NOT a global middleware):
//
//   router.post("/api/auth/login", rateLimit({ limit: 5, windowMs: 5_000 })(async (req, res, ctx) => {
//     ...
//   }));
//
// The Router's per-route handler signature is (req, res, ctx, params),
// not (req, res, ctx, next) — the original implementation tried to
// match the global-middleware contract and ended up either dead-
// ending with the default 200 (when next was never called) or
// throwing "next is not a function" (when next was actually called
// but the Router passes `params` as the 4th arg, not a next fn).
// A handler wrapper is the right shape for this use case.

const buckets = new Map();

function gc(now) {
  if (!buckets._gcLast || now - buckets._gcLast > 5 * 60_000) {
    for (const [k, b] of buckets) {
      if (!b || now - b.start > 60_000) buckets.delete(k);
    }
    buckets._gcLast = now;
  }
}

// M8.audit: tests share this module across cases; without an
// explicit reset the previous test's buckets linger and poison the
// next test. Exposed for tests + ops; not used in app code.
export function _resetRateLimits() {
  buckets.clear();
}

export function rateLimit({ limit, windowMs, keyFn, errorJson }) {
  // Returns a higher-order function that wraps the route handler.
  // The wrapper checks the rate limit; if exceeded, it writes the
  // 429 response and never calls the inner handler. Otherwise it
  // delegates to the inner handler.
  return (handler) => async (req, res, ctx, params) => {
    const now = Date.now();
    gc(now);
    const key = (keyFn ? keyFn(req, ctx) : null) || ctx.ip || "anon";
    let b = buckets.get(key);
    if (!b || now - b.start >= windowMs) {
      b = { start: now, count: 0 };
      buckets.set(key, b);
    }
    b.count++;
    if (b.count > limit) {
      const retryAfter = Math.ceil((b.start + windowMs - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.statusCode = 429;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(errorJson || {
        error: "rate_limited",
        message: `too many requests; retry after ${retryAfter}s`,
      }));
      return;
    }
    return handler(req, res, ctx, params);
  };
}
