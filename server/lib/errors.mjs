// server/lib/errors.mjs
// Uniform error envelope. `sendError(res, code, msg, fields?)` writes
// `{ error, fields? }` with the matching status code and `Content-Type: application/json`.

export class HttpError extends Error {
  constructor(code, msg, fields) {
    super(msg);
    this.code = code;
    this.fields = fields;
  }
}

export function sendError(res, code, msg, fields) {
  if (res.headersSent) return;
  const status =
    code === "unauthorized" ? 401 :
    code === "forbidden" ? 403 :
    code === "not_found" ? 404 :
    code === "invalid" ? 400 :
    code === "conflict" ? 409 :
    code === "rate_limited" ? 429 :
    500;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(fields ? { error: code, message: msg, fields } : { error: code, message: msg }));
}

export function sendJson(res, body, status = 200) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
