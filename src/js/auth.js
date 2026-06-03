// src/js/auth.js
// v3.0.0 real auth: thin client around /api/auth/*. The Set-Cookie
// happens server-side; the browser sends it back automatically. We
// use credentials: 'same-origin' so the cookie round-trips.

const BASE = "";  // same origin

function err(code, fields) {
  // Map server error envelope to a friendly message.
  if (code === "unauthorized") return "用户名或密码错误";
  if (code === "conflict") return "该用户名或邮箱已被使用";
  if (code === "invalid") {
    if (fields) {
      const first = Object.entries(fields)[0];
      if (first) return `${first[0]}: ${first[1]}`;
    }
    return "输入有误";
  }
  return "请求失败";
}

async function postJson(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) {
    return { ok: false, status: res.status, error: err(json?.error, json?.fields), fields: json?.fields };
  }
  return { ok: true, status: res.status, data: json };
}

async function getJson(path) {
  const res = await fetch(BASE + path, {
    method: "GET",
    credentials: "same-origin",
    headers: { "accept": "application/json" },
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, status: res.status, data: await res.json() };
}

export const auth = {
  /**
   * Login with username + password. Server sets the session cookie.
   * @returns {Promise<{ok:true,user}|{ok:false,error:string}>}
   */
  async login(name, password) {
    const r = await postJson("/api/auth/login", { name, password });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, user: r.data.user };
  },

  /**
   * Register a new account. Server creates the user + session.
   * @param {{name: string, email: string, password: string}} body
   */
  async register({ name, email, password }) {
    const r = await postJson("/api/auth/register", { name, email, password });
    if (!r.ok) return { ok: false, error: r.error, fields: r.fields };
    return { ok: true, user: r.data.user };
  },

  /** Kill the server-side session + clear the cookie. */
  async logout() {
    await postJson("/api/auth/logout", {});
    return { ok: true };
  },

  /**
   * Rehydrate the current user from the cookie. Returns null when
   * the cookie is missing/expired.
   * @returns {Promise<object|null>}
   */
  async me() {
    const r = await getJson("/api/auth/me");
    if (!r.ok) return null;
    return r.data.user;
  },
};
