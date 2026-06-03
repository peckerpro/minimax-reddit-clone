// server/handlers/health.mjs
// Returns the server's health. Used by `npm run health` and the
// DevOps-supplied docker healthcheck. The `db: "up"` check is a
// trivial SELECT 1 — if the DB is missing or corrupt, this returns 503.

export function registerHealth(router) {
  router.get("/api/health", (_req, res, ctx) => {
    let dbStatus = "up";
    try {
      ctx.db.prepare("SELECT 1 AS ok").get();
    } catch (e) {
      dbStatus = "down: " + (e?.message || "unknown");
    }
    res.statusCode = dbStatus === "up" ? 200 : 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      ok: dbStatus === "up",
      db: dbStatus,
      uptime: Math.round(process.uptime()),
      version: "3.0.0-m0",
      node: process.version,
    }));
  });
}
