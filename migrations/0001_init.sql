-- migrations/0001_init.sql
-- v3.0.0 initial schema. All ids are 26-char ULID TEXT.
-- Timestamps are ISO 8601 TEXT. Booleans are 0/1 INTEGER.
-- Foreign keys use ON DELETE CASCADE where the dependent is a child
-- (votes, comments, etc.) and ON DELETE SET NULL where the
-- relationship is a soft reference (e.g. comments.parent_id).
--
-- PRAGMAs (foreign_keys, journal_mode, synchronous) are set on the
-- connection in `server/db.mjs` when the app opens the DB. SQLite
-- rejects PRAGMA journal_mode inside a transaction, so we keep it
-- out of the migration body.

-- ── users & sessions ──────────────────────────────────────

-- ── users & sessions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  bio           TEXT NOT NULL DEFAULT '',
  avatar_color  TEXT NOT NULL DEFAULT '#ff4500',
  karma         INTEGER NOT NULL DEFAULT 1,
  role          TEXT NOT NULL DEFAULT 'user',     -- 'user' | 'admin'
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,                    -- random 256-bit hex
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ── communities ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subreddits (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display             TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  color               TEXT NOT NULL DEFAULT '#ff4500',
  icon_text           TEXT NOT NULL DEFAULT '',
  category            TEXT NOT NULL DEFAULT 'other',
  type                TEXT NOT NULL DEFAULT 'public', -- 'public' | 'restricted' | 'private'
  rules_json          TEXT NOT NULL DEFAULT '[]',
  weekly_visitors     INTEGER NOT NULL DEFAULT 0,
  weekly_contributors INTEGER NOT NULL DEFAULT 0,
  members             INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subreddits_category ON subreddits(category);

-- ── posts & comments ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id            TEXT PRIMARY KEY,
  subreddit_id  TEXT NOT NULL REFERENCES subreddits(id) ON DELETE CASCADE,
  author_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT 'text',     -- 'text' | 'image' | 'link' | 'video'
  image         TEXT,
  url           TEXT,
  domain        TEXT,
  flair         TEXT,
  score         INTEGER NOT NULL DEFAULT 1,
  nsfw          INTEGER NOT NULL DEFAULT 0,
  spoiler       INTEGER NOT NULL DEFAULT 0,
  pinned        INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_sub_created ON posts(subreddit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES comments(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  score       INTEGER NOT NULL DEFAULT 1,
  depth       INTEGER NOT NULL DEFAULT 0,
  path        TEXT NOT NULL DEFAULT '',            -- '/<id>/<id>/...'
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id, created_at DESC);

-- ── votes (composite PK, no surrogate id) ─────────────────
CREATE TABLE IF NOT EXISTS post_votes (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  value       INTEGER NOT NULL CHECK (value IN (-1, 1)),
  created_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_post_votes_post ON post_votes(post_id);

CREATE TABLE IF NOT EXISTS comment_votes (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id  TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  value       INTEGER NOT NULL CHECK (value IN (-1, 1)),
  created_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, comment_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_votes_comment ON comment_votes(comment_id);

-- ── relationships ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subreddit_id TEXT NOT NULL REFERENCES subreddits(id) ON DELETE CASCADE,
  level        TEXT NOT NULL DEFAULT 'all',       -- 'all' | 'posts' | 'none'
  created_at   TEXT NOT NULL,
  PRIMARY KEY (user_id, subreddit_id)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_sub ON subscriptions(subreddit_id);

CREATE TABLE IF NOT EXISTS saved_posts (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS hidden_posts (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS followed_users (
  follower_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS idx_followed_followee ON followed_users(followee_id);

CREATE TABLE IF NOT EXISTS blocked_users (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, blocked_id),
  CHECK (user_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS blocked_subreddits (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subreddit_id TEXT NOT NULL REFERENCES subreddits(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (user_id, subreddit_id)
);

-- ── notifications & messages ──────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                       -- 'reply' | 'upvote' | 'follow' | 'mention' | 'mod' | 'award'
  source_kind TEXT NOT NULL,                       -- 'post' | 'comment' | 'user' | 'subreddit'
  source_id   TEXT NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read) WHERE read = 0;

CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  from_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  read          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_to_created ON messages(to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_from_created ON messages(from_user_id, created_at DESC);

-- ── economy ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coins_ledger (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL,                    -- positive grant, negative spend
  kind        TEXT NOT NULL,                       -- 'signup' | 'purchase' | 'award_given' | 'award_received'
  ref_id      TEXT,                                -- optional related entity id
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coins_ledger_user ON coins_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS awards_given (
  id          TEXT PRIMARY KEY,
  giver_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL,                       -- 'post' | 'comment'
  target_id   TEXT NOT NULL,
  award_id    TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_awards_target ON awards_given(target_kind, target_id);

-- ── moderation ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_kind, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);

-- ── drafts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drafts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,                     -- 'text' | 'link' | 'image' | 'video'
  subreddit_id  TEXT REFERENCES subreddits(id) ON DELETE SET NULL,
  title         TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  ts            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drafts_user_ts ON drafts(user_id, ts DESC);
