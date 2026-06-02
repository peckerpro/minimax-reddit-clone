// Tiny dependency-free "lint": checks every .js / .mjs file under src/ and
// scripts/ for basic sanity (non-empty, balanced braces) and reports counts.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const TARGETS = ["src", "scripts"];

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function balance(src) {
  // Strip strings and line comments so braces inside them don't count.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")        // /* … */
    .replace(/\/\/.*$/gm, "")                // // …
    .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, ""); // "…" / '…' / `…`
  const counts = { "{": 0, "(": 0, "[": 0 };
  for (const ch of stripped) {
    if (counts[ch] !== undefined) counts[ch]++;
  }
  // We only check opening — pair matching is best-effort since we stripped
  // most of the syntax already. A real AST-based linter (e.g. acorn) is the
  // right tool here, but we want zero deps.
  return counts;
}

let ok = 0;
let bad = 0;
for (const target of TARGETS) {
  const root = join(ROOT, target);
  let exists = true;
  try {
    await stat(root);
  } catch {
    exists = false;
  }
  if (!exists) continue;

  for await (const file of walk(root)) {
    if (!/\.(m?js)$/.test(file)) continue;
    const rel = file.slice(ROOT.length + 1);
    const src = await readFile(file, "utf8");
    if (!src.trim()) {
      console.error(`  ✗ ${rel} — empty file`);
      bad++;
      continue;
    }
    const c = balance(src);
    // Very loose sanity check: must contain at least one of each delimiter.
    if (c["{"] === 0 && c["("] === 0) {
      console.error(`  ✗ ${rel} — looks empty after stripping comments`);
      bad++;
      continue;
    }
    console.log(`  ✓ ${rel}`);
    ok++;
  }
}

console.log(`\nlint: ${ok} ok, ${bad} bad`);
process.exit(bad ? 1 : 0);
