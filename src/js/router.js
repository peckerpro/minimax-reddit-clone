// Hash-based router. Routes are matched against a list of { pattern, handler }.
//
// Pattern syntax: a string with `:name` placeholders.
//   "/"                            → home
//   "/r/:name"                     → subreddit
//   "/r/:name/comments/:id"        → post detail
//   "/u/:name"                     → user profile
//   "/search"                      → search (query string parsed separately)
//   "/login"                       → login
//   "/submit"                      → create post
//   "/settings"                    → settings
//   "/notifications"               → notifications
//   "/premium"                     → premium
//   "/communities"                 → all communities
//   "/help/:slug"                  → help
//
// API:
//   router.add(pattern, handler)   register a route
//   router.start()                 begin listening
//   router.navigate(hash)          programmatic navigation
//   router.current                 the active { pattern, params, query, hash }

import { signal } from "./utils/dom.js";

function compile(pattern) {
  const keys = [];
  const re = new RegExp(
    "^" +
      pattern.replace(/:[A-Za-z_]\w*/g, (m) => {
        keys.push(m.slice(1));
        return "([^/]+)";
      }) +
      "/?$"
  );
  return { re, keys };
}

function parseHash(hash) {
  // "#/r/tech/comments/abc?sort=hot#section" → { path: "/r/tech/comments/abc", query: "sort=hot", anchor: "section" }
  const raw = String(hash || "").replace(/^#/, "");
  const [pathAndQuery, anchor] = raw.split("#");
  const [path, query] = (pathAndQuery || "").split("?");
  const queryObj = {};
  if (query) {
    for (const part of query.split("&")) {
      const [k, v = ""] = part.split("=");
      if (k) queryObj[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  return { path: path || "/", query: queryObj, anchor };
}

class Router {
  constructor() {
    /** @type {Array<{pattern: string, re: RegExp, keys: string[], handler: Function}>} */
    this.routes = [];
    /** @type {import('./utils/dom.js').signal} */
    this.currentSignal = signal({ pattern: null, params: {}, query: {}, path: "/" });
  }

  add(pattern, handler) {
    const { re, keys } = compile(pattern);
    this.routes.push({ pattern, re, keys, handler });
  }

  /**
   * Register a fallback handler for unmatched paths (404).
   */
  setNoMatchHandler(handler) {
    this.noMatchHandler = handler;
  }

  /**
   * Generate a hash URL for a given path + query.
   * @param {string} path e.g. "/r/technology/best"
   * @param {Object} [query] e.g. { sort: "hot", t: "day" }
   */
  url(path, query) {
    if (!query || Object.keys(query).length === 0) return `#${path}`;
    const qs = Object.entries(query)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    return `#${path}${qs ? "?" + qs : ""}`;
  }

  start() {
    window.addEventListener("hashchange", () => this.resolve());
    this.resolve();
  }

  navigate(hash) {
    if (!hash) return;
    if (hash === location.hash) {
      // force a re-resolve in case the route is the same
      this.resolve();
      return;
    }
    if (hash.startsWith("#")) location.hash = hash;
    else location.hash = "#" + hash;
  }

  resolve() {
    const { path, query, anchor } = parseHash(location.hash);
    for (const r of this.routes) {
      const m = path.match(r.re);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      this.currentSignal.set({ pattern: r.pattern, params, query, path });
      // scroll to anchor if present, else top
      requestAnimationFrame(() => {
        if (anchor) {
          const el = document.getElementById(anchor);
          if (el) el.scrollIntoView();
        } else {
          window.scrollTo({ top: 0, behavior: "instant" });
        }
      });
      try {
        r.handler({ params, query, path });
      } catch (err) {
        console.error("[router] handler threw:", err);
      }
      return;
    }
    // no match → 404
    this.currentSignal.set({ pattern: null, params: {}, query, path });
    if (this.noMatchHandler) {
      try {
        this.noMatchHandler({ params: {}, query, path });
      } catch (err) {
        console.error("[router] noMatch handler threw:", err);
      }
    } else {
      console.warn(`[router] no route for ${path}`);
    }
  }

  get current() {
    return this.currentSignal.get();
  }
  subscribe(fn) {
    return this.currentSignal.subscribe(fn);
  }
}

export const router = new Router();
export { parseHash };
