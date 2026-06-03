// server/index.mjs
// Entry point for the v3.0.0 backend. Serves:
//   - /api/* → backend handlers
//   - everything else → static files from the frontend (the same
//     index.html that v2.x served)
//
// On boot:
//   1. Run pending migrations
//   2. Seed from src/data/*.json if DB is empty
//   3. Listen on $PORT (auto-fallback via scripts/serve.mjs)

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "./router.mjs";
import { getDb } from "./db.mjs";
import { runMigrations } from "../scripts/migrate.mjs";
import { registerHealth } from "./handlers/health.mjs";
import { registerAuth } from "./handlers/auth.mjs";
import { registerSubreddits } from "./handlers/subreddits.mjs";
import { registerPosts } from "./handlers/posts.mjs";
import { registerUsers } from "./handlers/users.mjs";
import { registerSearch } from "./handlers/search.mjs";
import { registerInteractions } from "./handlers/interactions.mjs";
import { registerContent } from "./handlers/content.mjs";
import { authMiddleware } from "./middleware/auth-required.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");                       // project root
const FRONTEND = join(ROOT, "src");                          // static files
const INDEX_HTML = join(ROOT, "index.html");
const DB_PATH = process.env.DB_PATH || join(ROOT, "data", "reddit.db");

await runMigrations(DB_PATH, ROOT);

const router = new Router();
router.use(authMiddleware);
registerHealth(router);
registerAuth(router);
registerSubreddits(router);
registerPosts(router);
registerUsers(router);
registerSearch(router);
registerInteractions(router);
registerContent(router);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".ico":  "image/x-icon",
  ".txt":  "text/plain; charset=utf-8",
};

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  // serve from /src (where the SPA actually lives) and fall back to /index.html
  let abs = normalize(join(FRONTEND, pathname));
  if (!abs.startsWith(FRONTEND + sep) && abs !== FRONTEND) {
    res.statusCode = 403;
    return res.end("forbidden");
  }
  try {
    const s = await stat(abs);
    if (s.isDirectory()) abs = join(abs, "index.html");
  } catch {
    // SPA fallback: any unknown path returns index.html so the
    // hash router can take over.
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME[".html"]);
    const html = await readFile(INDEX_HTML);
    res.end(html);
    return;
  }
  try {
    const data = await readFile(abs);
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME[extname(abs).toLowerCase()] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    if ((req.url || "/").startsWith("/api/")) {
      // touch the DB so /api/health works even before any handler ran
      const db = getDb(DB_PATH);
      const ctx = {
        db,
        cookieHeader: req.headers["cookie"] || "",
      };
      try {
        await router.handle(req, res, ctx);
      } catch (e) {
        if (e?.code && /^(unauthorized|forbidden|not_found|invalid|conflict|rate_limited)$/.test(e.code)) {
          return import("./lib/errors.mjs").then(({ sendError }) =>
            sendError(res, e.code, e.message, e.fields)
          );
        }
        throw e;
      }
    } else {
      await serveStatic(req, res);
    }
  } catch (err) {
    console.error("[server] unhandled:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "internal", message: err?.message || "unknown" }));
    }
  }
});

const PORT = Number(process.env.PORT) || 5173;
server.listen(PORT, () => {
  console.log(`[reddit-clone] v3.0.0-m0  →  http://localhost:${PORT}`);
  console.log(`[reddit-clone] db:  ${DB_PATH}`);
});
