// scripts/health.mjs
// Hit /api/health and exit non-zero on 5xx. Used by Docker HEALTHCHECK
// and by humans who want a one-shot "is the server up?" check.
import { request } from "node:http";

const url = new URL(process.argv[2] || "http://localhost:5173/api/health");
try {
  const r = await new Promise((resolve, reject) => {
    const req = request(url, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(3000, () => req.destroy(new Error("timeout")));
    req.end();
  });
  console.log(r.status, r.body);
  process.exit(r.status >= 500 ? 1 : 0);
} catch (e) {
  console.error("[health] failed:", e.message);
  process.exit(1);
}
