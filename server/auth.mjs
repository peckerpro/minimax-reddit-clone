// server/auth.mjs
// v3.0.0 auth primitives. All zero-dep on node:crypto.
//
// Password hashing: scrypt with per-user random salt. Cost params tuned
// for ~50ms on a modern laptop (N=2^14, r=8, p=1). Stored in users
// table as `password_hash` and `salt` (both hex).
//
// Session cookies: random 256-bit session id, HMAC-SHA256 signed with
// a server secret. Cookie value is `<sid>.<sig>`, both hex.
//
// On boot, the server reads $SESSION_SECRET (32-byte hex) or falls back
// to a random per-process secret (sessions won't survive restart in
// that case — only useful for dev).

import { scrypt, randomBytes, createHmac, timingSafeEqual, createHash } from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 1 << 14;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

let _cachedSecret = null;
function getSecret() {
  if (_cachedSecret) return _cachedSecret;
  let s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) { _cachedSecret = s; return s; }
  // Dev fallback: stable per-process secret so cookies don't break
  // mid-session in `npm run dev`. NOT for production. Memoized —
  // re-rolling on every call (Date.now() advances) would make
  // sign/verify diverge and break every auth check after the first
  // millisecond. See server/test/contract/interactions.test.mjs.
  _cachedSecret = createHash("sha256").update(`minimax-dev-${process.pid}-${Date.now()}`).digest("hex");
  return _cachedSecret;
}

export function newSalt() {
  return randomBytes(16).toString("hex");
}

export async function hashPassword(password, salt) {
  if (typeof password !== "string" || password.length < 1 || password.length > 256) {
    throw Object.assign(new Error("invalid password length"), { code: "invalid" });
  }
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey.toString("hex"));
    });
  });
}

export async function verifyPassword(password, salt, expectedHash) {
  const got = await hashPassword(password, salt);
  const a = Buffer.from(got, "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function newSessionId() {
  return randomBytes(32).toString("hex");
}

export function signSessionId(sid) {
  return createHmac("sha256", getSecret()).update(sid).digest("hex");
}

export function verifySessionCookie(sid, sig) {
  if (typeof sid !== "string" || typeof sig !== "string") return false;
  const expected = signSessionId(sid);
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
}

export function sessionCookieValue(sid) {
  return `${sid}.${signSessionId(sid)}`;
}

export function parseSessionCookie(cookieHeader) {
  if (!cookieHeader) return null;
  // We only own one cookie name: `rc_sid`.
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === "rc_sid") {
      const raw = decodeURIComponent(rest.join("="));
      const dot = raw.lastIndexOf(".");
      if (dot < 1) return null;
      const sid = raw.slice(0, dot);
      const sig = raw.slice(dot + 1);
      return { sid, sig };
    }
  }
  return null;
}

export function setSessionCookie(res, sid, { maxAgeSec = 60 * 60 * 24 * 30 } = {}) {
  const value = sessionCookieValue(sid);
  // SameSite=Lax so the cookie survives cross-tab navigations within
  // the SPA. HttpOnly so JS can't read it. Path=/ so all routes see it.
  res.setHeader("Set-Cookie",
    `rc_sid=${value}; Max-Age=${maxAgeSec}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "rc_sid=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
}
