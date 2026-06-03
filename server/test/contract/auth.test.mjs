// server/test/contract/auth.test.mjs
// Contract test for /api/auth/*. Runs against an in-memory SQLite + a
// test instance of the router (no HTTP server needed for unit tests).
//
// Coverage (4 endpoints × 4 paths):
//   /register   happy / dup-name / bad-payload / short-password
//   /login      happy / wrong-password / unknown-user / bad-payload
//   /logout     happy / no-cookie / again
//   /me         with-cookie / without-cookie / tampered-sig / expired-session
//
// Plus side-effects: cookie is HttpOnly, sessions table row count, etc.

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Router } from "../../router.mjs";
import { registerAuth } from "../../handlers/auth.mjs";
import { authMiddleware } from "../../middleware/auth-required.mjs";
import { _resetRateLimits } from "../../middleware/rate-limit.mjs";
import { runMigrations } from "../../../scripts/migrate.mjs";
import { mkBodyReq, withCtx } from "./_helpers.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function freshApp() {
  // M8.audit: rate-limit module is module-level. Reset between
  // test cases so a prior case's attempts don't leak into the
  // current one (the audit-fixes B3 test exhausts the bucket and
  // would otherwise poison the next /login here).
  _resetRateLimits();
  const dir = mkdtempSync(join(tmpdir(), "auth-test-"));
  const dbPath = join(dir, "test.db");
  await runMigrations(dbPath, root);
  const db = new DatabaseSync(dbPath);
  const router = new Router();
  // Use the REAL auth middleware. Tests that need to fake the user
  // can still skip this by passing ctx.user directamente.
  router.use(authMiddleware);
  registerAuth(router);
  return { dir, dbPath, db, router, close: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test("/api/auth/register happy path", async () => {
  const a = await freshApp();
  try {
    const req = mkBodyReq("POST", "/api/auth/register", { name: "alice", email: "alice@x.com", password: "correcthorse" });
    const res = await withCtx(a.router, req, { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.user.name, "alice");
    assert.equal(res.body.user.karma, 1);
    assert.ok(res.body.sessionExpiresAt);
    assert.match(res.headers["set-cookie"], /^rc_sid=[a-f0-9]+\.[a-f0-9]+; .*HttpOnly/);
  } finally { a.close(); }
});

test("/api/auth/register rejects duplicate name", async () => {
  const a = await freshApp();
  try {
    await withCtx(a.router, mkBodyReq("POST", "/api/auth/register", { name: "alice", email: "a@x.com", password: "pwpwpwpw" }), { db: a.db, cookieHeader: "" });
    const res = await withCtx(a.router, mkBodyReq("POST", "/api/auth/register", { name: "alice", email: "b@x.com", password: "pwpwpwpw" }), { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, "conflict");
  } finally { a.close(); }
});

test("/api/auth/register rejects short password", async () => {
  const a = await freshApp();
  try {
    const res = await withCtx(a.router, mkBodyReq("POST", "/api/auth/register", { name: "bob", email: "bob@x.com", password: "short" }), { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "invalid");
    assert.ok(res.body.fields.password);
  } finally { a.close(); }
});

test("/api/auth/register rejects bad username", async () => {
  const a = await freshApp();
  try {
    const res = await withCtx(a.router, mkBodyReq("POST", "/api/auth/register", { name: "a", email: "x@x.com", password: "pwpwpwpw" }), { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "invalid");
    assert.ok(res.body.fields.name);
  } finally { a.close(); }
});

test("/api/auth/login happy path with seeded user (no password set)", async () => {
  const a = await freshApp();
  try {
    await withCtx(a.router, mkBodyReq("POST", "/api/auth/register", { name: "carol", email: "c@x.com", password: "pwpwpwpw" }), { db: a.db, cookieHeader: "" });
    const res = await withCtx(a.router, mkBodyReq("POST", "/api/auth/login", { name: "carol", password: "pwpwpwpw" }), { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.name, "carol");
  } finally { a.close(); }
});

test("/api/auth/login wrong password → 401", async () => {
  const a = await freshApp();
  try {
    await withCtx(a.router, mkBodyReq("POST", "/api/auth/register", { name: "dan", email: "d@x.com", password: "pwpwpwpw" }), { db: a.db, cookieHeader: "" });
    const res = await withCtx(a.router, mkBodyReq("POST", "/api/auth/login", { name: "dan", password: "wrong" }), { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, "unauthorized");
  } finally { a.close(); }
});

test("/api/auth/login unknown user → 401", async () => {
  const a = await freshApp();
  try {
    const res = await withCtx(a.router, mkBodyReq("POST", "/api/auth/login", { name: "ghost", password: "whatever" }), { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("/api/auth/login missing fields → 400", async () => {
  const a = await freshApp();
  try {
    const res = await withCtx(a.router, mkBodyReq("POST", "/api/auth/login", { name: "x" }), { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.fields.password);
  } finally { a.close(); }
});

test("/api/auth/logout with valid cookie deletes the session", async () => {
  const a = await freshApp();
  try {
    const reg = await withCtx(a.router, mkBodyReq("POST", "/api/auth/register", { name: "eve", email: "e@x.com", password: "pwpwpwpw" }), { db: a.db, cookieHeader: "" });
    const cookie = reg.headers["set-cookie"].split(";")[0];
    const before = a.db.prepare("SELECT COUNT(*) c FROM sessions").get().c;
    assert.equal(before, 1);
    const res = await withCtx(a.router, mkBodyReq("POST", "/api/auth/logout", {}), { db: a.db, cookieHeader: cookie });
    assert.equal(res.statusCode, 200);
    const after = a.db.prepare("SELECT COUNT(*) c FROM sessions").get().c;
    assert.equal(after, 0);
    assert.match(res.headers["set-cookie"], /rc_sid=; .*Max-Age=0/);
  } finally { a.close(); }
});

test("/api/auth/me with valid cookie returns user", async () => {
  const a = await freshApp();
  try {
    const reg = await withCtx(a.router, mkBodyReq("POST", "/api/auth/register", { name: "frank", email: "f@x.com", password: "pwpwpwpw" }), { db: a.db, cookieHeader: "" });
    const cookie = reg.headers["set-cookie"].split(";")[0];
    const res = await withCtx(a.router, mkBodyReq("GET", "/api/auth/me", null), { db: a.db, cookieHeader: cookie });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.name, "frank");
  } finally { a.close(); }
});

test("/api/auth/me with no cookie → 401", async () => {
  const a = await freshApp();
  try {
    const res = await withCtx(a.router, mkBodyReq("GET", "/api/auth/me", null), { db: a.db, cookieHeader: "" });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("/api/auth/me with tampered cookie → 401", async () => {
  const a = await freshApp();
  try {
    const reg = await withCtx(a.router, mkBodyReq("POST", "/api/auth/register", { name: "greta", email: "g@x.com", password: "pwpwpwpw" }), { db: a.db, cookieHeader: "" });
    const cookie = reg.headers["set-cookie"].split(";")[0];
    // Flip a hex digit in the signature.
    const [sid, sig] = cookie.split("=")[1].split(".");
    const tampered = `${sid}.${sig.slice(0, -1)}${sig.slice(-1) === "a" ? "b" : "a"}`;
    const res = await withCtx(a.router, mkBodyReq("GET", "/api/auth/me", null), { db: a.db, cookieHeader: `rc_sid=${tampered}` });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("/api/auth/me with expired session → 401", async () => {
  const a = await freshApp();
  try {
    const reg = await withCtx(a.router, mkBodyReq("POST", "/api/auth/register", { name: "henry", email: "h@x.com", password: "pwpwpwpw" }), { db: a.db, cookieHeader: "" });
    const cookie = reg.headers["set-cookie"].split(";")[0];
    a.db.prepare("UPDATE sessions SET expires_at = ?").run("2000-01-01T00:00:00.000Z");
    const res = await withCtx(a.router, mkBodyReq("GET", "/api/auth/me", null), { db: a.db, cookieHeader: cookie });
    assert.equal(res.statusCode, 401);
  } finally { a.close(); }
});

test("session cookie is HttpOnly + SameSite=Lax", async () => {
  const a = await freshApp();
  try {
    const reg = await withCtx(a.router, mkBodyReq("POST", "/api/auth/register", { name: "ivy", email: "i@x.com", password: "pwpwpwpw" }), { db: a.db, cookieHeader: "" });
    const sc = reg.headers["set-cookie"];
    assert.match(sc, /HttpOnly/);
    assert.match(sc, /SameSite=Lax/);
  } finally { a.close(); }
});
