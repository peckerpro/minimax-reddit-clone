// server/router.mjs
// Minimal method+path matcher. Patterns are exact, no params yet
// (M1+ will add `:name` style patterns if needed; for now we do
// substring/suffix checks in each handler for simplicity and speed).

export class Router {
  constructor() {
    this.routes = []; // { method, path, handler(req, res, ctx) }
    this.middlewares = []; // (req, res, ctx, next) => void | Promise<void>
  }

  use(mw) {
    this.middlewares.push(mw);
    return this;
  }

  add(method, path, handler) {
    // Pre-compute the placeholder count at registration time so the
    // route table can be re-sorted on every handle() call to put
    // literal matches ahead of placeholder matches. This is a small
    // O(n log n) per request, but n is tiny (we have ~40 routes)
    // and avoids a class of bug where registering `/api/posts/:id`
    // before `/api/posts/saved` would shadow the literal route.
    const placeholders = (path.match(/:\w+/g) || []).length;
    this.routes.push({ method: method.toUpperCase(), path, handler, placeholders });
    return this;
  }

  get(path, handler) { return this.add("GET", path, handler); }
  post(path, handler) { return this.add("POST", path, handler); }
  put(path, handler) { return this.add("PUT", path, handler); }
  patch(path, handler) { return this.add("PATCH", path, handler); }
  delete(path, handler) { return this.add("DELETE", path, handler); }

  async handle(req, res, ctx) {
    // Run middlewares first.
    for (const mw of this.middlewares) {
      let nextCalled = false;
      const next = () => { nextCalled = true; };
      await mw(req, res, ctx, next);
      if (!nextCalled) return; // mw handled the response
    }
    const path = (req.url || "/").split("?")[0];
    // M8.audit: sort routes by placeholder count on every handle()
    // call. Routes with the same placeholder count are matched in
    // registration order (Array.prototype.sort is stable since
    // ES2019). n is tiny (~40), so the sort cost is negligible
    // compared to the actual handler work.
    const sorted = this.routes.slice().sort((a, b) => a.placeholders - b.placeholders);
    for (const r of sorted) {
      if (r.method !== req.method) continue;
      const m = matchPath(r.path, path);
      if (!m) continue;
      return r.handler(req, res, ctx, m.params);
    }
    // 404
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "not_found", message: `no route for ${req.method} ${path}` }));
  }
}

/**
 * Match a pattern like "/api/posts/:id" against a path like "/api/posts/p_abc".
 * Returns a params object on match, null on no match.
 * Patterns must start with "/" and may have :name placeholders.
 *
 * M8.audit: routes that exactly match the path (every segment is
 * literal) are preferred over routes that would only match via a
 * placeholder. This is the right call: "/api/posts/saved" should
 * hit the saved-list handler, not be captured by "/api/posts/:id"
 * with id="saved". Within a given "goodness" tier, registration
 * order is the tiebreaker.
 */
function matchPath(pattern, path) {
  const pParts = pattern.split("/").filter(Boolean);
  const tParts = path.split("/").filter(Boolean);
  if (pParts.length !== tParts.length) return null;
  let placeholderCount = 0;
  const params = {};
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i].startsWith(":")) {
      placeholderCount++;
      params[pParts[i].slice(1)] = decodeURIComponent(tParts[i]);
    } else if (pParts[i] !== tParts[i]) {
      return null;
    }
  }
  return { params, placeholderCount };
}

// (sortRoutes was inlined into handle() — sort is per-request,
// the helper isn't needed.)
