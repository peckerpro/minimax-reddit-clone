// Mock auth. Login is a no-op in the real backend sense; we just synthesize
// a User object and shove it into state.js. Password is ignored.
// Any non-empty username / password is accepted (and "demo" gets a canned
// profile so screenshots have something to render).

const CANNED = {
  demo: {
    id: "u_demo",
    name: "demo",
    avatarColor: "#ff4500",
    karma: 12_345,
  },
  snek: {
    id: "u_snek",
    name: "snek_99",
    avatarColor: "#46d160",
    karma: 42_018,
  },
  pixel: {
    id: "u_pixel",
    name: "pixel_witch",
    avatarColor: "#7193ff",
    karma: 7_812,
  },
};

const AVATAR_COLORS = ["#ff4500", "#46d160", "#7193ff", "#ffb000", "#a02cd2", "#0dd3bb"];

function pickColor(seed) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export const auth = {
  /** @returns {Promise<{ok: true, user: object}|{ok: false, error: string}>} */
  async login(username, password) {
    const u = (username || "").trim();
    if (!u) return { ok: false, error: "请输入用户名" };
    if (!password) return { ok: false, error: "请输入密码" };

    // simulate network delay
    await new Promise((r) => setTimeout(r, 250));

    if (CANNED[u]) {
      return { ok: true, user: { ...CANNED[u] } };
    }
    return {
      ok: true,
      user: {
        id: `u_${u.toLowerCase()}`,
        name: u,
        avatarColor: pickColor(u),
        karma: Math.floor(Math.random() * 30_000) + 100,
      },
    };
  },

  async signup(username, password) {
    // alias of login for the mock
    return this.login(username, password);
  },

  async logout() {
    await new Promise((r) => setTimeout(r, 100));
    return { ok: true };
  },
};
