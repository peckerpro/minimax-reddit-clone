// Quick headless check: fetch the page, fetch every JS / CSS / JSON
// dependency the page mentions, and report any non-200 or empty body.
// This is a "static smoke test" — it doesn't execute the JS in a real
// browser, but it confirms the dev server is serving everything correctly.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BASE = "http://localhost:5173";

async function head(url) {
  const r = await fetch(url, { method: "GET" });
  const text = await r.text();
  return { status: r.status, length: text.length, ctype: r.headers.get("content-type") };
}

const html = await readFile(resolve(ROOT, "index.html"), "utf8");

// grab every src= / href= we can find
const refs = new Set();
for (const m of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  const u = m[1];
  if (u.startsWith("http") || u.startsWith("#")) continue;
  refs.add(u);
}

let bad = 0;
for (const r of refs) {
  const { status, length, ctype } = await head(BASE + r);
  const ok = status === 200 && length > 0;
  console.log(`${ok ? "  ✓" : "  ✗"} ${r.padEnd(40)} ${status}  ${String(length).padStart(6)}  ${ctype}`);
  if (!ok) bad++;
}

// also check each JSON dataset
for (const d of ["subreddits", "posts", "users", "comments", "rules"]) {
  const { status, length, ctype } = await head(`${BASE}/src/data/${d}.json`);
  const ok = status === 200 && length > 0;
  console.log(`${ok ? "  ✓" : "  ✗"} /src/data/${d}.json`.padEnd(50) + ` ${status}  ${String(length).padStart(6)}  ${ctype}`);
  if (!ok) bad++;
}

console.log(`\n${refs.size + 5 - bad} ok, ${bad} bad`);
process.exit(bad ? 1 : 0);
