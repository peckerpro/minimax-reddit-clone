// server/handlers/admin.mjs
// M6 — admin / mod queue endpoints.
//
// All endpoints require auth AND the caller must have role = "admin"
// (returned 403 otherwise). The contract is small and explicit:
//   - GET  /api/admin/reports                  → list unresolved reports
//   - GET  /api/admin/reports?resolved=true    → list resolved reports
//   - POST /api/admin/reports/:id/resolve      body {action: "dismiss" | "remove_content"}
//
// "remove_content" sets the post / comment's `removed_at` and
// `removed_by` columns; the GET handlers in posts.mjs / comments.mjs
// filter removed content from the public API (TODO: M7 — for M6 we
// just set the flag; the SPA's MOCK UI doesn't see it yet).

import { readBody } from "../lib/body.mjs";
import { sendError, sendJson } from "../lib/errors.mjs";
import { tx } from "../db.mjs";
import { requireAuth } from "../middleware/auth-required.mjs";

function shapeReport(r) {
  return {
    id: r.id,
    reporter: r.reporter_name,
    targetKind: r.target_kind,
    targetId: r.target_id,
    targetAuthor: r.target_author_name || null,
    targetRemoved: r.target_removed_at != null,
    reason: r.reason,
    detail: r.detail || "",
    resolved: r.resolved_at != null,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolver_name || null,
    resolution: r.resolution || null,
    createdAt: r.created_at,
  };
}

const REPORT_JOIN = `
  SELECT r.*,
         u_rep.name    AS reporter_name,
         CASE
           WHEN r.target_kind = 'post' THEN (
             SELECT u.name FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = r.target_id
           )
           WHEN r.target_kind = 'comment' THEN (
             SELECT u.name FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = r.target_id
           )
         END AS target_author_name,
         CASE
           WHEN r.target_kind = 'post' THEN (SELECT removed_at FROM posts WHERE id = r.target_id)
           WHEN r.target_kind = 'comment' THEN (SELECT removed_at FROM comments WHERE id = r.target_id)
         END AS target_removed_at,
         u_res.name    AS resolver_name
    FROM reports r
    JOIN users u_rep ON u_rep.id = r.reporter_id
    LEFT JOIN users u_res ON u_res.id = r.resolved_by
`;

function requireAdmin(ctx) {
  // Reuse the auth gate; then check role. Throwing with .code lets
  // the index.mjs catch-and-respond path turn it into a 403.
  requireAuth(ctx);
  if (!ctx.user || ctx.user.role !== "admin") {
    const err = new Error("admin only");
    err.code = "forbidden";
    throw err;
  }
}

export function registerAdmin(router) {
  // ── GET /api/admin/reports ─────────────────────────────
  router.get("/api/admin/reports", (req, res, ctx) => {
    try { requireAdmin(ctx); } catch (e) {
      if (e?.code === "forbidden") return sendError(res, "forbidden", "admin only");
      return sendError(res, "unauthorized", "login required");
    }
    const url = new URL(req.url, "http://localhost");
    const includeResolved = url.searchParams.get("resolved") === "true";
    const sql = `${REPORT_JOIN} WHERE 1=1 ${includeResolved ? "" : "AND r.resolved_at IS NULL"} ORDER BY r.created_at DESC LIMIT 200`;
    const rows = ctx.db.prepare(sql).all();
    sendJson(res, rows.map(shapeReport));
  });

  // ── POST /api/admin/reports/:id/resolve ────────────────
  router.post("/api/admin/reports/:id/resolve", async (req, res, ctx, params) => {
    try { requireAdmin(ctx); } catch (e) {
      if (e?.code === "forbidden") return sendError(res, "forbidden", "admin only");
      return sendError(res, "unauthorized", "login required");
    }
    let body;
    try { body = await readBody(req); } catch { return sendError(res, "invalid", "malformed JSON body"); }
    if (!body || !["dismiss", "remove_content"].includes(body.action)) {
      return sendError(res, "invalid", "action must be 'dismiss' or 'remove_content'");
    }
    const result = tx(ctx.db, () => {
      const report = ctx.db.prepare("SELECT * FROM reports WHERE id = ?").get(params.id);
      if (!report) return { __notFound: true };
      if (report.resolved_at) return { __alreadyResolved: true };
      const now = new Date().toISOString();
      if (body.action === "remove_content") {
        if (report.target_kind === "post") {
          ctx.db.prepare("UPDATE posts SET removed_at = ?, removed_by = ? WHERE id = ?")
            .run(now, ctx.user.id, report.target_id);
        } else if (report.target_kind === "comment") {
          ctx.db.prepare("UPDATE comments SET removed_at = ?, removed_by = ? WHERE id = ?")
            .run(now, ctx.user.id, report.target_id);
        }
      }
      ctx.db.prepare(`
        UPDATE reports SET resolved_at = ?, resolved_by = ?, resolution = ?
         WHERE id = ?
      `).run(now, ctx.user.id, body.action, params.id);
      return { id: params.id, action: body.action };
    });
    if (result?.__notFound) return sendError(res, "not_found", `report ${params.id} not found`);
    if (result?.__alreadyResolved) return sendError(res, "conflict", `report ${params.id} already resolved`);
    return sendJson(res, { ok: true, ...result });
  });
}
