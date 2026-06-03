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
import { registerSocial } from "./handlers/social.mjs";
import { registerAdmin } from "./handlers/admin.mjs";
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
registerSocial(router);
registerAdmin(router);

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
  // M8.audit (B6): tiny request log line. Format:
  //   [<ISO ts>] <method> <path> <status> <bytes> <duration>ms
  // Skipped for static files (we'd flood the log with /css/*.css
  // and /js/*.js hits from the SPA's <link>/<script> tags).
  const isApi = (req.url || "/").startsWith("/api/");
  const t0 = process.hrtime.bigint();
  let bytes = 0;
  res.on("finish", () => {
    if (!isApi) return;
    const dtMs = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(
      `[req] ${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${bytes}B ${dtMs.toFixed(1)}ms`
    );
  });
  const captureWrite = res.write.bind(res);
  res.write = (chunk, ...rest) => {
    if (chunk) bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    return captureWrite(chunk, ...rest);
  };
  const captureEnd = res.end.bind(res);
  res.end = (chunk, ...rest) => {
    if (chunk) bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    return captureEnd(chunk, ...rest);
  };

  try {
    if (isApi) {
      // touch the DB so /api/health works even before any handler ran
      const db = getDb(DB_PATH);
      const ctx = {
        db,
        cookieHeader: req.headers["cookie"] || "",
        // M8.audit: pass the request IP (or null) to ctx for rate-limit
        // keying + future audit log needs.
        ip: (req.socket?.remoteAddress || "").replace(/^::ffff:/, "") || null,
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
  console.log(`[reddit-clone] v3.0.0  →  http://localhost:${PORT}`);
  console.log(`[reddit-clone] db:  ${DB_PATH}`);
});

// M8.audit (B4): graceful shutdown. On SIGTERM / SIGINT, stop
// accepting new connections, wait for in-flight requests to drain,
// then close the DB cleanly so SQLite can checkpoint the WAL
// (otherwise the .db-wal file can be left larger than expected
// for the systemd stop cycle). systemd sends SIGTERM on
// `systemctl stop`; Ctrl-C in dev sends SIGINT.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[reddit-clone] ${signal} received, draining...`);
  // Stop accepting new connections; existing ones continue.
  server.close(() => {
    console.log("[reddit-clone] http server closed");
    // Close the DB last so any pending writes (the in-flight
    // requests) can land cleanly.
    try {
      import("./db.mjs").then(({ closeDb }) => closeDb());
    } catch {}
    setTimeout(() => process.exit(0), 50);
  });
  // Hard exit if drain takes > 5s.
  setTimeout(() => {
    console.warn("[reddit-clone] drain timeout, exiting hard");
    process.exit(1);
  }, 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
