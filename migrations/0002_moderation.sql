-- migrations/0002_moderation.sql
-- M6 — moderation columns on posts / comments + reports resolution.
-- All additive: ALTER TABLE ... ADD COLUMN. The init migration
-- already has the base `posts`, `comments`, `reports` tables; this
-- migration just adds the bookkeeping fields the mod queue reads.

ALTER TABLE posts    ADD COLUMN removed_at TEXT;
ALTER TABLE posts    ADD COLUMN removed_by TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE comments ADD COLUMN removed_at TEXT;
ALTER TABLE comments ADD COLUMN removed_by TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE reports  ADD COLUMN resolved_at TEXT;
ALTER TABLE reports  ADD COLUMN resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE reports  ADD COLUMN resolution   TEXT;  -- 'dismissed' | 'removed'
