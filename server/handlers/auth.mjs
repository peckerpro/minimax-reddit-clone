// server/handlers/auth.mjs
// /api/auth/register, /login, /logout, /me
//
// Body parsing: small JSON helper, no multipart needed yet (avatars
// come in M4+). Validation: 400 with field details on bad input.

import { readBody } from "../lib/body.mjs";
import { sendError, sendJson } from "../lib/errors.mjs";
import {
  hashPassword, verifyPassword, newSalt, newSessionId,
  setSessionCookie, clearSessionCookie,
} from "../auth.mjs";
import { ulid } from "../lib/ulid.mjs";
import { requireAuth } from "../middleware/auth-required.mjs";

const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30d

function validateRegister(body) {
  const errs = {};
  if (typeof body.name !== "string" || !USERNAME_RE.test(body.name))
    errs.name = "3-20 chars, letters/digits/underscore/dash only";
  if (typeof body.email !== "string" || !EMAIL_RE.test(body.email))
    errs.email = "must be a valid email";
  if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 256)
    errs.password = "must be 8-256 chars";
  return errs;
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    karma: u.karma,
    role: u.role,
    avatarColor: u.avatar_color,
    bio: u.bio,
    createdAt: u.created_at,
  };
}

async function createSession(db, userId) {
  const sid = newSessionId();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(sid, userId, expires.toISOString(), now.toISOString());
  return { sid, expiresAt: expires.toISOString() };
}

export function registerAuth(router) {
  router.post("/api/auth/register", async (req, res, ctx) => {
    let body;
    try { body = await readBody(req); }
    catch { return sendError(res, "invalid", "malformed JSON body"); }
    const errs = validateRegister(body || {});
    if (Object.keys(errs).length) return sendError(res, "invalid", "validation failed", errs);

    const dup = ctx.db.prepare("SELECT id FROM users WHERE name = ? OR email = ?")
      .get(body.name.toLowerCase(), body.email.toLowerCase());
    if (dup) {
      return sendError(res, "conflict", "name or email already taken", { name: "taken" });
    }
    const salt = newSalt();
    const passwordHash = await hashPassword(body.password, salt);
    const userId = `u_${ulid()}`;
    const nowIso = new Date().toISOString();
    ctx.db.prepare(`INSERT INTO users
      (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
      VALUES (?, ?, ?, ?, ?, '', '#ff4500', 1, 'user', ?)`)
      .run(userId, body.name, body.email, passwordHash, salt, nowIso);

    // signup coin grant
    ctx.db.prepare("INSERT INTO coins_ledger (id, user_id, delta, kind, ref_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)")
      .run(`cl_${ulid()}`, userId, 500, "signup", nowIso);

    const { sid, expiresAt } = await createSession(ctx.db, userId);
    setSessionCookie(res, sid);
    return sendJson(res, { user: { id: userId, name: body.name, email: body.email, karma: 1, role: "user", avatarColor: "#ff4500", bio: "", createdAt: nowIso }, sessionExpiresAt: expiresAt }, 201);
  });

  router.post("/api/auth/login", async (req, res, ctx) => {
    let body;
    try { body = await readBody(req); }
    catch { return sendError(res, "invalid", "malformed JSON body"); }
    if (typeof body?.name !== "string" || typeof body?.password !== "string") {
      return sendError(res, "invalid", "name and password required", { name: "required", password: "required" });
    }
    const u = ctx.db.prepare("SELECT * FROM users WHERE name = ? COLLATE NOCASE")
      .get(body.name);
    if (!u) return sendError(res, "unauthorized", "invalid credentials");
    const ok = await verifyPassword(body.password, u.salt, u.password_hash);
    if (!ok) return sendError(res, "unauthorized", "invalid credentials");
    const { sid, expiresAt } = await createSession(ctx.db, u.id);
    setSessionCookie(res, sid);
    return sendJson(res, { user: publicUser(u), sessionExpiresAt: expiresAt });
  });

  router.post("/api/auth/logout", (req, res, ctx) => {
    const cookie = ctx.cookieHeader || "";
    // Best-effort: extract sid and delete the row, then clear cookie.
    const m = cookie.match(/(?:^|;\s*)rc_sid=([^;]+)/);
    if (m) {
      const raw = decodeURIComponent(m[1]);
      const dot = raw.lastIndexOf(".");
      const sid = dot > 0 ? raw.slice(0, dot) : null;
      if (sid) ctx.db.prepare("DELETE FROM sessions WHERE id = ?").run(sid);
    }
    clearSessionCookie(res);
    sendJson(res, { ok: true });
  });

  router.get("/api/auth/me", (req, res, ctx) => {
    if (!ctx.user) return sendError(res, "unauthorized", "no session");
    return sendJson(res, { user: ctx.user });
  });
}
