// scripts/reset-db.mjs
// Delete the local SQLite file. Idempotent: missing file is fine.
// Re-running `npm run dev` after this re-seeds from src/data/*.json.
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const dbPath = process.env.DB_PATH || join(ROOT, "data", "reddit.db");

for (const p of [dbPath, dbPath + "-journal", dbPath + "-wal", dbPath + "-shm"]) {
  if (existsSync(p)) {
    rmSync(p, { force: true });
    console.log(`[reset-db] removed ${p}`);
  }
}
console.log(`[reset-db] done. next dev run will re-seed.`);
