// server/middleware/auth-required.mjs
// Reads the rc_sid cookie, looks up the session row, attaches ctx.user.
// Usage in router.use(): ctx = { db, user? }.

import { parseSessionCookie, verifySessionCookie } from "../auth.mjs";

export function authMiddleware(_req, _res, ctx, next) {
  const cookie = ctx.cookieHeader || "";
  const parsed = parseSessionCookie(cookie);
  if (!parsed) return next();
  if (!verifySessionCookie(parsed.sid, parsed.sig)) return next();
  const row = ctx.db.prepare(`
    SELECT u.id, u.name, u.email, u.karma, u.role, u.avatar_color, u.bio,
           s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?
  `).get(parsed.sid, new Date().toISOString());
  if (row) {
    ctx.user = {
      id: row.id,
      name: row.name,
      email: row.email,
      karma: row.karma,
      role: row.role,
      avatarColor: row.avatar_color,
      bio: row.bio,
      sessionExpiresAt: row.expires_at,
    };
  }
  return next();
}

export function requireAuth(ctx) {
  if (!ctx.user) {
    const err = new Error("unauthorized");
    err.code = "unauthorized";
    throw err;
  }
}
