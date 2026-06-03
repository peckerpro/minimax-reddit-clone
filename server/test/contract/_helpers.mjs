// server/test/contract/_helpers.mjs
// Shared test utilities. The req object we build must support the
// real Readable-stream interface that readBody() expects: emit
// 'data' for each chunk, then 'end'. Otherwise the handler hangs.

import { Readable } from "node:stream";

export function mkRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    text: "",
    setHeader(name, value) { (this.headers[name.toLowerCase()] = value); },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    end(body) {
      if (body !== undefined && body !== null) {
        const s = typeof body === "string" ? body : JSON.stringify(body);
        this.text += s;
        try { this.body = JSON.parse(this.text); } catch { this.body = null; }
      } else {
        try { this.body = this.text ? JSON.parse(this.text) : null; } catch { this.body = null; }
      }
    },
    write(chunk) {
      const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      this.text += s;
      return true;
    },
  };
  return res;
}

export function mkBodyReq(method, url, body) {
  // Build a real Readable so the readBody() consumer gets its
  // 'data' / 'end' events. The stream is in objectMode=false.
  let text = "";
  if (body !== null && body !== undefined) {
    text = JSON.stringify(body);
  }
  const req = new Readable({
    read() {
      // Push the entire body in one chunk, then end.
      if (text) {
        this.push(text);
        text = "";
      }
      this.push(null);
    },
  });
  req.method = method;
  req.url = url;
  req.headers = {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(text)),
  };
  return req;
}

export async function withCtx(router, req, ctx) {
  const res = mkRes();
  await router.handle(req, res, ctx);
  return res;
}
