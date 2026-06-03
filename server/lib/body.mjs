// server/lib/body.mjs
// Read a JSON request body with a size cap. Returns the parsed value
// or throws an error with .code = "invalid" if the body is malformed
// or too large.

const MAX_BYTES = 256 * 1024; // 256 KB is plenty for our POSTs

export async function readBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BYTES) {
        req.destroy();
        return reject(Object.assign(new Error("body too large"), { code: "invalid" }));
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve({});
      try { resolve(JSON.parse(text)); }
      catch { reject(Object.assign(new Error("malformed JSON"), { code: "invalid" })); }
    });
    req.on("error", (e) => reject(e));
  });
}
