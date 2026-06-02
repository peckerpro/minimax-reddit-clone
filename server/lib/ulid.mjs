// server/lib/ulid.mjs
// 26-char ULID-ish ids (Crockford base32). Not a real ULID spec, but
// monotonic-enough for our purposes: prefix is timestamp in ms (10 chars),
// suffix is 16 random base32 chars. Collision space is 32^16 ≈ 1.2e24.
import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford (no I, L, O, U)

function encode(num, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    s = ALPHABET[num % 32] + s;
    num = Math.floor(num / 32);
  }
  return s;
}

export function ulid() {
  const ts = Date.now();
  return encode(ts, 10) + encode(Number.parseInt(randomBytes(8).toString("hex"), 16) % 2 ** 128, 16);
}

export function ulidDate(iso) {
  // For tests: deterministic id from a known timestamp.
  const ts = iso ? new Date(iso).getTime() : Date.now();
  return encode(ts, 10) + "0000000000000000";
}

export function newSessionId() {
  // 256-bit random hex for session cookies.
  return randomBytes(32).toString("hex");
}
