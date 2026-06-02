// scripts/serve.mjs (v3.0.0 shim)
//
// v2.x used this as the standalone static dev server. v3.0.0 unified
// serving into `server/index.mjs` (frontend + /api on the same port).
// This shim keeps the old entry point working for muscle memory and
// older tooling, but it just spawns the new server.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const server = resolve(__dirname, "..", "server", "index.mjs");
const port = process.argv[2] || process.env.PORT || 5173;

console.log(`[serve.mjs] v3.0.0 shim → spawning server/index.mjs (PORT=${port})`);
const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  env: { ...process.env, PORT: String(port) },
});
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
