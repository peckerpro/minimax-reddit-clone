// server/lib/notifications.mjs
// M6 — notification trigger helpers.
//
// `fireNotification(db, targetUserId, kind, sourceKind, sourceId)` is
// called from the post / comment / vote / follow handlers to insert
// a row into the `notifications` table. The /api/notifications GET
// endpoint (M5) is the read side; this is the write side.
//
// We dedupe by (user_id, kind, source_id) so a user can only get
// one "upvote" notif per post — otherwise the notifications panel
// would fill with 50 "upvote" rows from the same upvote-collector
// bot. The unique-on-source constraint is enforced by a UNIQUE
// index added in migration 0003 (see M6 commit message).

import { ulid } from "./ulid.mjs";

export function fireNotification(db, { userId, kind, sourceKind, sourceId, dedupe = true }) {
  if (!userId || !kind || !sourceKind || !sourceId) return null;
  // Dedupe: M8.audit (B2). The UNIQUE index
  // `uq_notif_target(user_id, kind, source_kind, source_id)` added in
  // migration 0003 makes the second INSERT fail with
  // SQLITE_CONSTRAINT_UNIQUE under concurrent writes. We rely on
  // that as the authoritative gate; the pre-SELECT is just a cheap
  // optimization that lets the common (non-racing) case return the
  // existing id without raising an exception.
  if (dedupe) {
    const existing = db.prepare(`
      SELECT id FROM notifications
       WHERE user_id = ? AND kind = ? AND source_kind = ? AND source_id = ?
    `).get(userId, kind, sourceKind, sourceId);
    if (existing) return existing.id;
  }
  const id = `n_${ulid()}`;
  try {
    db.prepare(`
      INSERT INTO notifications (id, user_id, kind, source_kind, source_id, read, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(id, userId, kind, sourceKind, sourceId, new Date().toISOString());
  } catch (e) {
    // UNIQUE constraint violation: a concurrent writer just inserted
    // the same (user, kind, source) tuple. Look up the winner and
    // return its id; drop the new id we just minted (it never made
    // it into the table because the INSERT was a single statement
    // and failed atomically).
    if (e?.code === "SQLITE_CONSTRAINT_UNIQUE" || /UNIQUE constraint failed/i.test(e?.message || "")) {
      const winner = db.prepare(`
        SELECT id FROM notifications
         WHERE user_id = ? AND kind = ? AND source_kind = ? AND source_id = ?
      `).get(userId, kind, sourceKind, sourceId);
      return winner?.id || null;
    }
    throw e;
  }
  return id;
}

// Convenience: fire a "reply" notification when someone comments on
// the caller's post or on the caller's comment. Skips self-replies
// (author replying to themselves).
export function fireReplyNotification(db, { recipientId, sourceKind, sourceId, actorId }) {
  if (!recipientId || recipientId === actorId) return null;
  return fireNotification(db, {
    userId: recipientId,
    kind: "reply",
    sourceKind,
    sourceId,
  });
}
