// Global in-memory state. Single source of truth for the SPA.
// v0.1.0 only needs auth + UI prefs; later versions will add posts / comments.

import { signal } from "./utils/dom.js";

const STORAGE_KEY = "reddit-clone::state::v1";

/** @typedef {{ id: string, name: string, avatar: string }} User */

const initial = {
  /** @type {User|null} */
  user: null,
  /** "card" | "compact" */
  view: "card",
  /** "best" | "hot" | "new" | "top" | "rising" */
  sort: "best",
  /** "global" | "local" */
  location: "global",
  /** "best" | "top" | "new" | "controversial" | "old" | "qa" */
  commentSort: "best",
  /** joined subreddit names */
  joined: /** @type {string[]} */ ([]),
  /** post-vote ledger: `${postId}` -> 1 | -1 | 0 */
  votes: /** @type {Record<string, 1|-1|0>} */ ({}),
  /** comment-vote ledger */
  commentVotes: /** @type {Record<string, 1|-1|0>} */ ({}),
  /** hidden post ids */
  hidden: /** @type {string[]} */ ([]),
  /** saved post ids */
  saved: /** @type {string[]} */ ([]),
};

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function persist(snapshot) {
  try {
    // Only persist small / serialisable fields.
    const slim = {
      user: snapshot.user,
      view: snapshot.view,
      sort: snapshot.sort,
      location: snapshot.location,
      commentSort: snapshot.commentSort,
      joined: snapshot.joined,
      votes: snapshot.votes,
      commentVotes: snapshot.commentVotes,
      hidden: snapshot.hidden,
      saved: snapshot.saved,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch {
    // ignore quota / privacy mode
  }
}

const stateSignal = signal({ ...initial, ...loadPersisted() });

// Re-persist on every change.
stateSignal.subscribe(persist);

export const state = {
  get: () => stateSignal.get(),
  set: (patch) => stateSignal.set((prev) => ({ ...prev, ...patch })),

  // ── user ─────────────────────────────────────────────
  login: (user) => stateSignal.set((p) => ({ ...p, user })),
  logout: () => stateSignal.set((p) => ({ ...p, user: null })),

  // ── view / sort / location ───────────────────────────
  setView: (view) => stateSignal.set((p) => ({ ...p, view })),
  setSort: (sort) => stateSignal.set((p) => ({ ...p, sort })),
  setLocation: (location) => stateSignal.set((p) => ({ ...p, location })),
  setCommentSort: (commentSort) => stateSignal.set((p) => ({ ...p, commentSort })),

  // ── community membership ─────────────────────────────
  isJoined: (name) => stateSignal.get().joined.includes(name),
  toggleJoin: (name) =>
    stateSignal.set((p) => ({
      ...p,
      joined: p.joined.includes(name)
        ? p.joined.filter((n) => n !== name)
        : [...p.joined, name],
    })),

  // ── voting ───────────────────────────────────────────
  getVote: (postId) => stateSignal.get().votes[postId] || 0,
  votePost: (postId, dir) =>
    stateSignal.set((p) => {
      const prev = p.votes[postId] || 0;
      const next = prev === dir ? 0 : dir;
      return {
        ...p,
        votes: { ...p.votes, [postId]: next },
      };
    }),
  getCommentVote: (commentId) => stateSignal.get().commentVotes[commentId] || 0,
  voteComment: (commentId, dir) =>
    stateSignal.set((p) => {
      const prev = p.commentVotes[commentId] || 0;
      const next = prev === dir ? 0 : dir;
      return {
        ...p,
        commentVotes: { ...p.commentVotes, [commentId]: next },
      };
    }),

  // ── saved / hidden ───────────────────────────────────
  isHidden: (postId) => stateSignal.get().hidden.includes(postId),
  toggleHidden: (postId) =>
    stateSignal.set((p) => ({
      ...p,
      hidden: p.hidden.includes(postId)
        ? p.hidden.filter((id) => id !== postId)
        : [...p.hidden, postId],
    })),
  isSaved: (postId) => stateSignal.get().saved.includes(postId),
  toggleSaved: (postId) =>
    stateSignal.set((p) => ({
      ...p,
      saved: p.saved.includes(postId)
        ? p.saved.filter((id) => id !== postId)
        : [...p.saved, postId],
    })),

  // ── subscriptions ────────────────────────────────────
  subscribe: (fn) => stateSignal.subscribe(fn),
};
