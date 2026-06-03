// scripts/_bench.mjs
// M8 — performance baseline. Spawns the real server on a free port,
// then hammers a small set of hot endpoints with raw `http.request`
// (skipping the fetch / fetch-then-await-headers overhead) to
// measure p50 / p95 / p99 latency under a modest concurrent load.
//
// What it does NOT measure: client-side render time, network RTT
// from the user's machine, DB throughput under realistic data
// volume. The seed data is the same 24-user / 25-sub / 40-post
// / 32-comment set the in-process smokes use, so this is an
// apples-to-apples baseline, not a real-world perf number.
//
// Run:  node scripts/_bench.mjs [--port 5174] [--duration 5] [--concurrency 8]
//
// Exits 0 always — this is a baseline, not a gate.

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const PORT = arg("port", 5174);
const DURATION_SEC = arg("duration", 5);
const CONCURRENCY = arg("concurrency", 8);
const DB_PATH = `${ROOT}/data/bench-${PORT}.db`;

// ── spawn the server ──────────────────────────────────────
console.log(`[bench] spawning server on :${PORT} (db: ${DB_PATH})`);
const server = spawn(process.execPath, ["server/index.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DB_PATH, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverStderr = "";
server.stderr.on("data", (b) => { serverStderr += b.toString(); });

// Wait for the server to print its ready line.
await new Promise((resolve, reject) => {
  const onData = (b) => {
    const s = b.toString();
    if (s.includes(`http://localhost:${PORT}`)) {
      server.stdout.off("data", onData);
      resolve();
    }
  };
  server.stdout.on("data", onData);
  setTimeout(() => reject(new Error("server didn't start within 10s")), 10000);
});

// ── pick the endpoints to hammer ──────────────────────────
// These are the "hot" reads + writes. Each scenario does one
// request; the latency is measured client-side.
const scenarios = [
  // reads (no auth, fast path)
  { name: "GET /api/posts",                    method: "GET",  path: "/api/posts?limit=25" },
  { name: "GET /api/posts/:id (hot post)",     method: "GET",  path: "/api/posts/p001" },
  { name: "GET /api/posts/:id/comments",        method: "GET",  path: "/api/posts/p001/comments" },
  { name: "GET /api/subreddits",               method: "GET",  path: "/api/subreddits?limit=15" },
  { name: "GET /api/search",                   method: "GET",  path: "/api/search?q=ai&type=posts" },
  { name: "GET /api/health",                   method: "GET",  path: "/api/health" },
];

function timeit(method, path) {
  const t0 = process.hrtime.bigint();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method,
        hostname: "127.0.0.1",
        port: PORT,
        path,
        headers: { "user-agent": "bench/1.0" },
      },
      (res) => {
        // Drain so the socket can be reused.
        res.on("data", () => {});
        res.on("end", () => {
          const t1 = process.hrtime.bigint();
          resolve({ status: res.statusCode, ns: Number(t1 - t0) });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const i = Math.min(arr.length - 1, Math.floor((arr.length - 1) * p));
  return arr[i];
}

async function runOne(scenario) {
  const samples = [];
  const start = Date.now();
  const end = start + DURATION_SEC * 1000;
  // simple per-scenario concurrency = CONCURRENCY; in practice each
  // scenario just gets 1 concurrent worker that loops, so total
  // in-flight ≈ CONCURRENCY * num_scenarios.
  const workers = [];
  for (let c = 0; c < CONCURRENCY; c++) {
    workers.push((async () => {
      while (Date.now() < end) {
        try {
          const r = await timeit(scenario.method, scenario.path);
          if (r.status >= 500) {
            console.warn(`[bench] ${scenario.name} got ${r.status}`);
            continue;
          }
          samples.push(r.ns);
        } catch (e) {
          // ignore individual timeouts
        }
      }
    })());
  }
  await Promise.all(workers);
  samples.sort((a, b) => a - b);
  const total = samples.length;
  const totalMs = samples.reduce((s, x) => s + x, 0) / 1e6;
  return {
    name: scenario.name,
    method: scenario.method,
    path: scenario.path,
    requests: total,
    rps: total / DURATION_SEC,
    avgMs: totalMs / Math.max(1, total),
    p50Ms: pct(samples, 0.50) / 1e6,
    p95Ms: pct(samples, 0.95) / 1e6,
    p99Ms: pct(samples, 0.99) / 1e6,
    maxMs: samples.at(-1) / 1e6,
  };
}

console.log(`[bench] running ${scenarios.length} scenarios for ${DURATION_SEC}s each, ${CONCURRENCY} concurrent per scenario`);

const results = [];
for (const s of scenarios) {
  const r = await runOne(s);
  results.push(r);
  console.log(
    `  ${r.name.padEnd(34)} ${r.requests.toString().padStart(5)} req   ` +
    `rps=${r.rps.toFixed(1).padStart(7)}   ` +
    `avg=${r.avgMs.toFixed(2).padStart(7)}ms   ` +
    `p50=${r.p50Ms.toFixed(2).padStart(6)}ms   ` +
    `p95=${r.p95Ms.toFixed(2).padStart(6)}ms   ` +
    `p99=${r.p99Ms.toFixed(2).padStart(6)}ms`
  );
}

// kill server
server.kill("SIGTERM");
await sleep(200);
// remove bench db
import { unlinkSync } from "node:fs";
try { unlinkSync(DB_PATH); } catch {}
try { unlinkSync(`${DB_PATH}-wal`); } catch {}
try { unlinkSync(`${DB_PATH}-shm`); } catch {}

console.log(`\n[bench] done. run again with --duration 10 --concurrency 32 for a stress run.`);
console.log(`[bench] (caller exits 0; bench is a baseline, not a gate)`);
process.exit(0);
