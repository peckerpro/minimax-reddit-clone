// Walk the full import graph starting from main.js, then trace every
// dynamic import and @import and fetch. Report anything that 404s.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:5173";
const ROOT = fileURLToPath(new URL("../src/", import.meta.url));

// Map: source URL -> set of referenced URLs (relative imports)
async function loadAndScan(url) {
  const path = ROOT + url.replace("/src/", "").replace(/^\/+/, "");
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (e) {
    return { refs: [], error: "could not read " + path };
  }
  const refs = new Set();
  for (const m of text.matchAll(/import\s+(?:[^'"`]+from\s+)?["'`]([^"'`]+)["'`]/g)) refs.add(m[1]);
  for (const m of text.matchAll(/await\s+import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) refs.add(m[1]);
  for (const m of text.matchAll(/@import\s+url\(\s*["']([^"']+)["']/g)) refs.add(m[1]);
  for (const m of text.matchAll(/fetch\(\s*["'`]([^"'`]+)["'`]/g)) refs.add(m[1]);
  return { refs: [...refs], text };
}

const visited = new Set();
const failed = [];
const allUrls = [];

async function walk(url) {
  if (visited.has(url)) return;
  visited.add(url);
  allUrls.push(url);
  // verify with a real fetch
  let r, text;
  try {
    r = await fetch(BASE + url);
    text = await r.text();
  } catch (e) {
    failed.push({ url, reason: "fetch error: " + e.message });
    return;
  }
  if (r.status !== 200) {
    failed.push({ url, status: r.status, length: text.length });
    return;
  }
  // also read the file from disk to find more refs (since dynamic imports
  // won't show up in the fetched JS)
  let refs = [];
  try {
    const { refs: found } = await loadAndScan(url);
    refs = found;
  } catch {}
  for (const ref of refs) {
    if (ref.startsWith("http") || ref.startsWith("#") || ref.startsWith("data:")) continue;
    const abs = new URL(ref, BASE + url).pathname;
    await walk(abs);
  }
}

await walk("/index.html");
for (const u of ["/src/js/main.js"]) await walk(u);

console.log(`Visited ${visited.size} resources.`);
if (failed.length === 0) {
  console.log("✓ No 404s.");
} else {
  console.log(`✗ ${failed.length} resources failed:`);
  for (const f of failed) console.log(`  ${f.url}  status=${f.status}`);
}
console.log("\nAll visited URLs:");
for (const u of allUrls) console.log("  " + u);
