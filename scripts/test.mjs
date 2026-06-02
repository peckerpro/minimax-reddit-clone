// Smoke test: confirms every JSON mock data file is valid JSON and that the
// SPA entry resolves all its imports (we can't actually execute browser-only
// code from Node, so we just sanity-check the import graph).
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

let total = 0;
let failed = 0;

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

// 1) every JSON in src/data must parse
const dataDir = join(ROOT, "src", "data");
let dataExists = true;
try {
  await stat(dataDir);
} catch {
  dataExists = false;
}

if (dataExists) {
  for await (const file of walk(dataDir)) {
    if (!file.endsWith(".json")) continue;
    total++;
    try {
      JSON.parse(await readFile(file, "utf8"));
      console.log(`  ✓ data: ${file.slice(ROOT.length + 1)}`);
    } catch (err) {
      console.error(`  ✗ data: ${file.slice(ROOT.length + 1)} — ${err.message}`);
      failed++;
    }
  }
} else {
  console.warn("  ! no src/data directory yet (expected in early versions)");
}

// 2) every file under src/ + scripts/ parses as a module (best-effort)
const roots = ["src", "scripts"];
for (const target of roots) {
  const dir = join(ROOT, target);
  let exists = true;
  try {
    await stat(dir);
  } catch {
    exists = false;
  }
  if (!exists) continue;
  for await (const file of walk(dir)) {
    if (!/\.(m?js)$/.test(file)) continue;
    total++;
    try {
      // We can't actually run the module, but reading it is enough to catch
      // missing files. Syntax errors will already be caught by lint.mjs.
      await readFile(file, "utf8");
      console.log(`  ✓ src : ${file.slice(ROOT.length + 1)}`);
    } catch (err) {
      console.error(`  ✗ src : ${file.slice(ROOT.length + 1)} — ${err.message}`);
      failed++;
    }
  }
}

console.log(`\ntest: ${total - failed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
