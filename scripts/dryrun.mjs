// Quick load test: try to call the mock API and confirm it works.
globalThis.window = { addEventListener() {}, location: { hash: "#/" } };
globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {}, classList: { add() {}, remove() {} } }, createElement: () => ({}), createDocumentFragment: () => ({}), addEventListener() {}, head: { appendChild() {} } };
globalThis.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
globalThis.structuredClone = (v) => JSON.parse(JSON.stringify(v));

// stub fetch to read from filesystem
globalThis.fetch = async (url) => {
  const path = "." + url.replace("http://localhost:5173", "");
  const fs = await import("node:fs/promises");
  try {
    const text = await fs.readFile(path, "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  } catch (e) {
    return { ok: false, status: 404, json: async () => null, text: async () => "" };
  }
};

const { api } = await import("../src/js/api.js");

console.log("→ listSubreddits:", (await api.listSubreddits()).length, "items");
console.log("→ popularSubreddits(5):", (await api.popularSubreddits(5)).length, "items");
console.log("→ getSubreddit('technology'):", (await api.getSubreddit("technology"))?.display);
console.log("→ getUser('ada'):", (await api.getUser("ada"))?.name);
console.log("→ listPosts({sort:'hot'}):", (await api.listPosts({ sort: "hot" })).length, "items");
console.log("→ getPost('p003'):", (await api.getPost("p003"))?.title?.slice(0, 40), "…");
console.log("→ listComments('p003'):", (await api.listComments("p003")).length, "comments");
console.log("→ getRules('technology'):", (await api.getRules("technology")).length, "rules");
console.log("→ searchPosts('gaming'):", (await api.searchPosts("gaming")).length, "matches");
