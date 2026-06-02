// Minimal zero-dependency static dev server.
// Run: node scripts/serve.mjs [port]
import { createServer as createHttpServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const PREFERRED_PORT = Number(process.argv[2] || process.env.PORT || 5173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function safeJoin(root, urlPath) {
  // strip query, decode
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const target = normalize(join(root, cleanPath));
  // prevent path-traversal escape from ROOT
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  return target;
}

const server = createHttpServer(async (req, res) => {
  try {
    let urlPath = req.url || "/";
    if (urlPath === "/") urlPath = "/index.html";

    const target = safeJoin(ROOT, urlPath);
    if (!target) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    let s;
    try {
      s = await stat(target);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(`404 Not Found: ${urlPath}`);
      return;
    }

    let filePath = target;
    if (s.isDirectory()) {
      filePath = join(target, "index.html");
      try {
        await stat(filePath);
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end(`404 Not Found: ${urlPath}`);
        return;
      }
    }

    const body = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-cache",
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(`500 Internal Error: ${err && err.message}`);
  }
});

// Find a free port by listening on the main server and retrying on EADDRINUSE.
// Avoids the TOCTOU race of a "tester" server (close() then re-listen on the
// same port) which can race on Windows where port release has a small delay.
function listenWithRetry(srv, port, attempt = 0) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      srv.removeListener("listening", onListening);
      if (err && err.code === "EADDRINUSE" && attempt < 80) {
        // try next port
        listenWithRetry(srv, port + 1, attempt + 1).then(resolve, reject);
      } else {
        reject(err || new Error(`could not bind a port in [${PREFERRED_PORT}, ${PREFERRED_PORT + 80})`));
      }
    };
    const onListening = () => {
      srv.removeListener("error", onError);
      resolve(port);
    };
    srv.once("error", onError);
    srv.once("listening", onListening);
    srv.listen(port, "0.0.0.0");
  });
}

listenWithRetry(server, PREFERRED_PORT)
  .then((port) => {
    console.log(`[reddit-clone] dev server  →  http://localhost:${port}`);
  })
  .catch((err) => {
    console.error(`[reddit-clone] failed to bind any port: ${err.message}`);
    process.exit(1);
  });
