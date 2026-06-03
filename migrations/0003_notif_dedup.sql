-- migrations/0003_notif_dedup.sql
-- M8.audit (B2): the dedup logic in server/lib/notifications.mjs
-- is an O(log n) SELECT-then-INSERT. That's racy under concurrent
-- writes (two votes from the same user on the same post at the
-- same time can both pass the SELECT and both INSERT, leaving two
-- notification rows). A UNIQUE index makes the second INSERT fail
-- with SQLITE_CONSTRAINT_UNIQUE, which the handler can swallow as
-- a dedup hit.
--
-- This migration adds the index. Existing duplicates (if any) would
-- block the index creation. We dedupe-then-create in the migration
-- runner via a one-shot DELETE; see scripts/migrate.mjs's per-file
-- block for the rationale.

-- Step 1: delete any existing duplicate notification rows.
-- We keep the oldest row for each (user_id, kind, source_kind, source_id)
-- tuple; the rest are dupes we no longer need.
DELETE FROM notifications
 WHERE id NOT IN (
   SELECT MIN(id) FROM notifications
   GROUP BY user_id, kind, source_kind, source_id
 );

-- Step 2: add the UNIQUE index. Future INSERTs that violate the
-- constraint will fail with SQLITE_CONSTRAINT_UNIQUE, which
-- fireNotification() catches and treats as "already there".
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_target
  ON notifications (user_id, kind, source_kind, source_id);
