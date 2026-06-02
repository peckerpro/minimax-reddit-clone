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
    this.routes.push({ method: method.toUpperCase(), path, handler });
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
    for (const r of this.routes) {
      if (r.method !== req.method) continue;
      if (r.path !== path) continue;
      return r.handler(req, res, ctx);
    }
    // 404
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "not_found", message: `no route for ${req.method} ${path}` }));
  }
}
