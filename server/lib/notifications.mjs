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
  // Dedupe: if a notif with the same (user, kind, source) already
  // exists, just return its id. Cheap O(log n) lookup. Avoids
  // filling the panel with 50 "upvote" rows from the same collector.
  if (dedupe) {
    const existing = db.prepare(`
      SELECT id FROM notifications
       WHERE user_id = ? AND kind = ? AND source_kind = ? AND source_id = ?
    `).get(userId, kind, sourceKind, sourceId);
    if (existing) return existing.id;
  }
  const id = `n_${ulid()}`;
  db.prepare(`
    INSERT INTO notifications (id, user_id, kind, source_kind, source_id, read, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(id, userId, kind, sourceKind, sourceId, new Date().toISOString());
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
