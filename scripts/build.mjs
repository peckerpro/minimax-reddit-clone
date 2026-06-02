// Build = "verify everything is in place, then copy the dev tree to dist/".
// We don't transpile or bundle (vanilla project); we just stage a clean copy.
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "dist");

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const INCLUDE = ["index.html", "public", "src", "CHANGELOG.md", "README.md"];
for (const item of INCLUDE) {
  await cp(resolve(ROOT, item), resolve(OUT, item), { recursive: true });
}

console.log(`[reddit-clone] build → ${OUT}`);
