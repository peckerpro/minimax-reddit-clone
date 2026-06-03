// scripts/migrate.mjs
// Idempotent migration runner + JSON seed.
// Usage:  node scripts/migrate.mjs                # migrate + seed if empty
//         node scripts/migrate.mjs --no-seed     # migrate only
//         runMigrations(dbPath, rootPath)         # programmatic (used by server)

import { readdir, readFile } from "node:fs/promises";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, "..");
const MIGRATIONS_DIR = join(DEFAULT_ROOT, "migrations");
const DATA_DIR = join(DEFAULT_ROOT, "src", "data");

export async function runMigrations(dbPath, rootPath = DEFAULT_ROOT) {
  if (!existsSync(dirname(dbPath))) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const dir = join(rootPath, "migrations");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    applied_at  TEXT NOT NULL
  )`);

  const applied = new Set(db.prepare("SELECT name FROM _migrations").all().map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = await readFile(join(dir, f), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      // Use a literal exec instead of a prepared statement to avoid
      // dangling statement handles (matters for short-lived test DBs).
      const now = Date.now();
      const iso = new Date().toISOString();
      db.exec(`INSERT INTO _migrations (id, name, applied_at) VALUES (${now}, '${f.replace(/'/g, "''")}', '${iso}')`);
      db.exec("COMMIT");
      console.log(`[migrate] applied ${f}`);
    } catch (e) {
      db.exec("ROLLBACK");
      db.close();
      throw new Error(`[migrate] failed on ${f}: ${e.message}`);
    }
  }
  db.close();
}

export async function seedFromJson(dbPath, rootPath = DEFAULT_ROOT) {
  if (!existsSync(dirname(dbPath))) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const dataDir = join(rootPath, "src", "data");
  const db = new DatabaseSync(dbPath);
  try {
    const { users } = JSON.parse(await readFile(join(dataDir, "users.json"), "utf8"));
    if (Array.isArray(users) && users.length > 0 && db.prepare("SELECT COUNT(*) AS c FROM users").get().c === 0) {
      seedUsers(db, users);
      console.log(`[seed] users: ${users.length}`);
    }
    const { subreddits } = JSON.parse(await readFile(join(dataDir, "subreddits.json"), "utf8"));
    if (Array.isArray(subreddits) && subreddits.length > 0 && db.prepare("SELECT COUNT(*) AS c FROM subreddits").get().c === 0) {
      seedSubreddits(db, subreddits);
      console.log(`[seed] subreddits: ${subreddits.length}`);
    }
    const { posts } = JSON.parse(await readFile(join(dataDir, "posts.json"), "utf8"));
    if (Array.isArray(posts) && posts.length > 0 && db.prepare("SELECT COUNT(*) AS c FROM posts").get().c === 0) {
      seedPosts(db, posts, rootPath);
      console.log(`[seed] posts: ${posts.length}`);
    }
    const { comments } = JSON.parse(await readFile(join(dataDir, "comments.json"), "utf8"));
    if (Array.isArray(comments) && comments.length > 0 && db.prepare("SELECT COUNT(*) AS c FROM comments").get().c === 0) {
      seedComments(db, comments);
      console.log(`[seed] comments: ${comments.length}`);
    }
  } finally {
    db.close();
  }
}

function seedUsers(db, users) {
  const ins = db.prepare(`INSERT INTO users
    (id, name, email, password_hash, salt, bio, avatar_color, karma, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tx = db.exec.bind(db);
  tx("BEGIN");
  try {
    for (const u of users) {
      ins.run(
        u.id || `u_${u.name.toLowerCase()}`,
        u.name,
        u.email || `${u.name.toLowerCase()}@reddit.local`,
        u.passwordHash || "seed-no-login",
        u.salt || "seed-salt",
        u.bio || "",
        u.color || "#ff4500",
        u.karma || 1,
        u.role || "user",
        u.createdAt || new Date().toISOString(),
      );
    }
    tx("COMMIT");
  } catch (e) { tx("ROLLBACK"); throw e; }
}

function seedSubreddits(db, subs) {
  const ins = db.prepare(`INSERT INTO subreddits
    (id, name, display, description, color, icon_text, category, type,
     rules_json, weekly_visitors, weekly_contributors, members, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tx = db.exec.bind(db);
  tx("BEGIN");
  try {
    for (const s of subs) {
      ins.run(
        s.id || `s_${s.name}`,
        s.name,
        s.display || s.name,
        s.description || "",
        s.color || "#ff4500",
        s.iconText || (s.name[0] || "?").toUpperCase(),
        s.category || "other",
        s.type || "public",
        JSON.stringify(s.rules || []),
        s.weeklyVisitors || 0,
        s.weeklyContributors || 0,
        s.members || 0,
        s.createdAt || new Date().toISOString(),
      );
    }
    tx("COMMIT");
  } catch (e) { tx("ROLLBACK"); throw e; }
}

function seedPosts(db, posts, rootPath) {
  // posts reference author name ("u_<name>") and subreddit name; we
  // need to translate to the seeded ids. Look them up once.
  const userById = new Map(db.prepare("SELECT id, name FROM users").all().map((u) => [`u_${u.name}`, u.id]));
  const subByName = new Map(db.prepare("SELECT id, name FROM subreddits").all().map((s) => [s.name, s.id]));
  const ins = db.prepare(`INSERT INTO posts
    (id, subreddit_id, author_id, title, body, kind, image, url, domain, flair,
     score, nsfw, spoiler, pinned, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tx = db.exec.bind(db);
  tx("BEGIN");
  try {
    for (const p of posts) {
      const authorId = userById.get(p.author) || p.author;
      const subId = subByName.get(p.subreddit) || null;
      if (!subId) continue;
      ins.run(
        p.id,
        subId,
        authorId,
        p.title || "",
        p.body || "",
        p.kind || "text",
        p.image || null,
        p.url || null,
        p.domain || null,
        p.flair || null,
        p.score || 1,
        p.nsfw ? 1 : 0,
        p.spoiler ? 1 : 0,
        p.pinned ? 1 : 0,
        p.createdAt || new Date().toISOString(),
      );
    }
    tx("COMMIT");
  } catch (e) { tx("ROLLBACK"); throw e; }
}

function seedComments(db, comments) {
  const userById = new Map(db.prepare("SELECT id, name FROM users").all().map((u) => [`u_${u.name}`, u.id]));
  const ins = db.prepare(`INSERT INTO comments
    (id, post_id, parent_id, author_id, body, score, depth, path, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tx = db.exec.bind(db);
  tx("BEGIN");
  try {
    for (const c of comments) {
      const authorId = userById.get(c.author) || c.author;
      ins.run(
        c.id,
        c.postId,
        c.parentId || null,
        authorId,
        c.body || "",
        c.score || 1,
        c.depth || 0,
        c.path || "",
        c.createdAt || new Date().toISOString(),
      );
    }
    tx("COMMIT");
  } catch (e) { tx("ROLLBACK"); throw e; }
}

// CLI entry. Normalize paths to file:// URLs so the check works on
// both POSIX and Windows.
const thisFile = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const argvFile = (process.argv[1] || "").replace(/\\/g, "/");
if (argvFile === thisFile || argvFile.endsWith(thisFile)) {
  const noSeed = process.argv.includes("--no-seed");
  const dbPath = process.env.DB_PATH || join(DEFAULT_ROOT, "data", "reddit.db");
  await runMigrations(dbPath);
  if (!noSeed) await seedFromJson(dbPath);
  console.log(`[migrate] done. db: ${dbPath}`);
}
