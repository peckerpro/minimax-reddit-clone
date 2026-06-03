// Global in-memory state. Single source of truth for the SPA.
// Persists to localStorage. v2.0.0: extended with blocked / recentlyViewed /
// drafts / coins / theme / time / density / leftNavCollapsed / recentSearches /
// unread / subscribedPosts / followedUsers.

import { signal } from "./utils/dom.js";
import { api } from "./api.js";

const STORAGE_KEY = "reddit-clone::state::v2";

/** @typedef {{ id: string, name: string, avatar: string, color: string, karma: number, coins: number }} User */

const initial = {
  /** @type {User|null} */
  user: null,

  // view prefs
  view: "card",                         // "card" | "compact"
  density: "standard",                  // "standard" | "compact"
  sort: "best",                         // "best" | "hot" | "new" | "top" | "rising"
  timeRange: "all",                     // "hour" | "day" | "week" | "month" | "year" | "all"
  location: "global",                   // "global" | "local"
  commentSort: "best",                  // "confidence" | "top" | "new" | "controversial" | "old" | "qa"
  theme: "auto",                        // "auto" | "light" | "dark"

  // community membership
  joined: /** @type {string[]} */ ([]),
  /** @type {Record<string, "all"|"posts"|"none">} */
  notifyLevel: {},

  // post-vote ledger: `${postId}` -> 1 | -1 | 0
  votes: /** @type {Record<string, 1|-1|0>} */ ({}),
  commentVotes: /** @type {Record<string, 1|-1|0>} */ ({}),

  // list management
  hidden: /** @type {string[]} */ ([]),
  saved: /** @type {string[]} */ ([]),
  subscribedPosts: /** @type {string[]} */ ([]),     // 订阅通知的帖子

  // block lists
  blocked: /** @type {{ users: string[], subreddits: string[] }} */ ({ users: [], subreddits: [] }),

  // social
  /** @type {string[]} */ followed: [],             // u/:name list

  // navigation state
  recentlyViewed: /** @type {Array<{kind:string, ref:string, ts:number}>} */ ([]),
  recentSearches: /** @type {string[]} */ ([]),
  leftNavCollapsed: false,

  // coins / wallet
  coins: 500,

  // unread badges
  unread: { comments: 0, mentions: 0, messages: 0 },

  // drafts (in-progress submit)
  drafts: /** @type {Array<{id:string, kind:string, subreddit:string, title:string, body:string, ts:number}>} */ ([]),
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
    const slim = { ...snapshot };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch {
    // ignore quota / privacy mode
  }
}

const stateSignal = signal({ ...initial, ...loadPersisted() });
stateSignal.subscribe(persist);

export const state = {
  get: () => stateSignal.get(),
  set: (patch) => stateSignal.set((prev) => ({ ...prev, ...patch })),
  subscribe: (fn) => stateSignal.subscribe(fn),

  // ── auth ─────────────────────────────────────────────
  login: (user) => stateSignal.set((p) => ({ ...p, user })),
  logout: () => stateSignal.set((p) => ({ ...p, user: null })),

  // ── view / sort / location / theme ──────────────────
  setView: (view) => stateSignal.set((p) => ({ ...p, view })),
  setDensity: (density) => stateSignal.set((p) => ({ ...p, density })),
  setSort: (sort) => stateSignal.set((p) => ({ ...p, sort })),
  setTimeRange: (timeRange) => stateSignal.set((p) => ({ ...p, timeRange })),
  setLocation: (location) => stateSignal.set((p) => ({ ...p, location })),
  setCommentSort: (commentSort) => stateSignal.set((p) => ({ ...p, commentSort })),
  setTheme: (theme) => stateSignal.set((p) => ({ ...p, theme })),
  setLeftNavCollapsed: (leftNavCollapsed) => stateSignal.set((p) => ({ ...p, leftNavCollapsed })),

  // ── community membership ─────────────────────────────
  // M5: subscribe / unsubscribe is server-backed. The local joined
  // list is the optimistic view; the server returns the authoritative
  // state. We roll back on failure.
  isJoined: (name) => stateSignal.get().joined.includes(name),
  toggleJoin: (name) => {
    const cur = stateSignal.get();
    if (!cur.user) return;
    const wasJoined = cur.joined.includes(name);
    const action = wasJoined ? "leave" : "join";
    // Optimistic toggle
    stateSignal.set((p) => ({
      ...p,
      joined: wasJoined
        ? p.joined.filter((n) => n !== name)
        : [...p.joined, name],
    }));
    api.subscribe(name, action).then((res) => {
      if (res && typeof res.subscribed === "boolean" && res.subscribed !== !wasJoined) {
        // server disagrees (e.g. another tab); reconcile
        stateSignal.set((p) => ({
          ...p,
          joined: res.subscribed
            ? (p.joined.includes(name) ? p.joined : [...p.joined, name])
            : p.joined.filter((n) => n !== name),
        }));
      }
    }).catch((err) => {
      // Roll back
      stateSignal.set((p) => ({
        ...p,
        joined: wasJoined
          ? (p.joined.includes(name) ? p.joined : [...p.joined, name])
          : p.joined.filter((n) => n !== name),
      }));
      console.warn("[state.toggleJoin]", err?.message || err);
    });
  },

  getNotifyLevel: (name) => stateSignal.get().notifyLevel[name] || "none",
  setNotifyLevel: (name, level) =>
    stateSignal.set((p) => ({
      ...p,
      notifyLevel: { ...p.notifyLevel, [name]: level },
    })),

  // ── voting (4-state machine) ─────────────────────────
  // States: 0 = none, 1 = up, -1 = down
  // Transitions:
  //   none + up   -> up     (score+1)
  //   none + down -> down   (score-1)
  //   up   + up   -> none   (score-1, 取消)
  //   up   + down -> down   (score-2, 切换)
  //   down + up   -> up     (score+2, 切换)
  //   down + down -> none   (score+1, 取消)
  //
  // M3: each click also fires POST /api/posts/:id/vote with the
  // RESOLVED next value (1/-1/0). The server applies the delta to
  // the stored previous vote and updates post.score + author.karma
  // atomically. On server error we roll back the optimistic state
  // and surface a toast. Net effect: the local state always matches
  // what the server thinks happened, even if the user double-taps
  // or switches tabs.
  getVote: (postId) => stateSignal.get().votes[postId] || 0,
  votePost: (postId, dir) => {
    const cur = stateSignal.get();
    if (!cur.user) return;          // gated by the component already
    const prev = cur.votes[postId] || 0;
    const next = prev === dir ? 0 : dir;
    if (next === prev) return;      // no-op, don't even call the server
    // Optimistic local update
    stateSignal.set((p) => ({ ...p, votes: { ...p.votes, [postId]: next } }));
    api.votePost(postId, next).then((res) => {
      // Reconcile with server truth (in case the server saw a
      // different prev, e.g. another tab voted on the same post).
      if (res && typeof res.userVote === "number") {
        stateSignal.set((p) => ({ ...p, votes: { ...p.votes, [postId]: res.userVote } }));
      }
    }).catch((err) => {
      // Roll back. The component will re-render on subscribe.
      stateSignal.set((p) => ({ ...p, votes: { ...p.votes, [postId]: prev } }));
      console.warn("[state.votePost]", err?.message || err);
    });
  },
  getCommentVote: (commentId) => stateSignal.get().commentVotes[commentId] || 0,
  voteComment: (commentId, dir) => {
    const cur = stateSignal.get();
    if (!cur.user) return;
    const prev = cur.commentVotes[commentId] || 0;
    const next = prev === dir ? 0 : dir;
    if (next === prev) return;
    stateSignal.set((p) => ({ ...p, commentVotes: { ...p.commentVotes, [commentId]: next } }));
    api.voteComment(commentId, next).then((res) => {
      if (res && typeof res.userVote === "number") {
        stateSignal.set((p) => ({ ...p, commentVotes: { ...p.commentVotes, [commentId]: res.userVote } }));
      }
    }).catch((err) => {
      stateSignal.set((p) => ({ ...p, commentVotes: { ...p.commentVotes, [commentId]: prev } }));
      console.warn("[state.voteComment]", err?.message || err);
    });
  },

  // ── hidden / saved / subscribed posts ───────────────
  // M3: save / hide are server-backed (POST .../save and .../hide
  // toggle the saved_posts / hidden_posts row). Subscribed-posts is
  // post-level notification subscription, not part of M3.
  isHidden: (postId) => stateSignal.get().hidden.includes(postId),
  toggleHidden: (postId) => {
    const cur = stateSignal.get();
    if (!cur.user) return;
    const isHidden = cur.hidden.includes(postId);
    // Optimistic toggle
    stateSignal.set((p) => ({
      ...p,
      hidden: isHidden
        ? p.hidden.filter((id) => id !== postId)
        : [...p.hidden, postId],
    }));
    api.toggleHidePost(postId).then((res) => {
      // No further state change needed; the toggle was correct.
      if (!res) {
        // 404 — post gone. Roll back.
        stateSignal.set((p) => ({
          ...p,
          hidden: isHidden
            ? [...p.hidden, postId]
            : p.hidden.filter((id) => id !== postId),
        }));
      }
    }).catch((err) => {
      stateSignal.set((p) => ({
        ...p,
        hidden: isHidden
          ? [...p.hidden, postId]
          : p.hidden.filter((id) => id !== postId),
      }));
      console.warn("[state.toggleHidden]", err?.message || err);
    });
  },

  isSaved: (postId) => stateSignal.get().saved.includes(postId),
  toggleSaved: (postId) => {
    const cur = stateSignal.get();
    if (!cur.user) return;
    const isSaved = cur.saved.includes(postId);
    stateSignal.set((p) => ({
      ...p,
      saved: isSaved
        ? p.saved.filter((id) => id !== postId)
        : [...p.saved, postId],
    }));
    api.toggleSavePost(postId).then((res) => {
      if (!res) {
        // 404 — roll back
        stateSignal.set((p) => ({
          ...p,
          saved: isSaved
            ? [...p.saved, postId]
            : p.saved.filter((id) => id !== postId),
        }));
      }
    }).catch((err) => {
      stateSignal.set((p) => ({
        ...p,
        saved: isSaved
          ? [...p.saved, postId]
          : p.saved.filter((id) => id !== postId),
      }));
      console.warn("[state.toggleSaved]", err?.message || err);
    });
  },

  isSubscribedPost: (postId) => stateSignal.get().subscribedPosts.includes(postId),
  toggleSubscribedPost: (postId) =>
    stateSignal.set((p) => ({
      ...p,
      subscribedPosts: p.subscribedPosts.includes(postId)
        ? p.subscribedPosts.filter((id) => id !== postId)
        : [...p.subscribedPosts, postId],
    })),

  // ── blocking ─────────────────────────────────────────
  // M5: block / unblock is server-backed.
  isUserBlocked: (name) => stateSignal.get().blocked.users.includes(name),
  isSubredditBlocked: (name) => stateSignal.get().blocked.subreddits.includes(name),
  toggleBlockUser: (name) => {
    const cur = stateSignal.get();
    if (!cur.user) return;
    const wasBlocked = cur.blocked.users.includes(name);
    const action = wasBlocked ? "unblock" : "block";
    const rollback = (p) => ({
      ...p,
      blocked: {
        ...p.blocked,
        users: wasBlocked
          ? (p.blocked.users.includes(name) ? p.blocked.users : [...p.blocked.users, name])
          : p.blocked.users.filter((n) => n !== name),
      },
    });
    stateSignal.set((p) => ({
      ...p,
      blocked: {
        ...p.blocked,
        users: wasBlocked
          ? p.blocked.users.filter((n) => n !== name)
          : [...p.blocked.users, name],
      },
    }));
    api.blockUser(name, action).then((res) => {
      if (res && typeof res.blocked === "boolean" && res.blocked !== !wasBlocked) rollback(stateSignal.get());
    }).catch((err) => {
      rollback(stateSignal.get());
      console.warn("[state.toggleBlockUser]", err?.message || err);
    });
  },
  toggleBlockSubreddit: (name) => {
    const cur = stateSignal.get();
    if (!cur.user) return;
    const wasBlocked = cur.blocked.subreddits.includes(name);
    const action = wasBlocked ? "unblock" : "block";
    const rollback = (p) => ({
      ...p,
      blocked: {
        ...p.blocked,
        subreddits: wasBlocked
          ? (p.blocked.subreddits.includes(name) ? p.blocked.subreddits : [...p.blocked.subreddits, name])
          : p.blocked.subreddits.filter((n) => n !== name),
      },
    });
    stateSignal.set((p) => ({
      ...p,
      blocked: {
        ...p.blocked,
        subreddits: wasBlocked
          ? p.blocked.subreddits.filter((n) => n !== name)
          : [...p.blocked.subreddits, name],
      },
    }));
    api.blockSubreddit(name, action).then((res) => {
      if (res && typeof res.blocked === "boolean" && res.blocked !== !wasBlocked) rollback(stateSignal.get());
    }).catch((err) => {
      rollback(stateSignal.get());
      console.warn("[state.toggleBlockSubreddit]", err?.message || err);
    });
  },

  // ── following ─────────────────────────────────────────
  // M5: follow / unfollow is server-backed.
  isFollowing: (name) => stateSignal.get().followed.includes(name),
  toggleFollow: (name) => {
    const cur = stateSignal.get();
    if (!cur.user) return;
    const wasFollowing = cur.followed.includes(name);
    const action = wasFollowing ? "unfollow" : "follow";
    const rollback = (p) => ({
      ...p,
      followed: wasFollowing
        ? (p.followed.includes(name) ? p.followed : [...p.followed, name])
        : p.followed.filter((n) => n !== name),
    });
    stateSignal.set((p) => ({
      ...p,
      followed: wasFollowing
        ? p.followed.filter((n) => n !== name)
        : [...p.followed, name],
    }));
    api.followUser(name, action).then((res) => {
      if (res && typeof res.following === "boolean" && res.following !== !wasFollowing) rollback(stateSignal.get());
    }).catch((err) => {
      rollback(stateSignal.get());
      console.warn("[state.toggleFollow]", err?.message || err);
    });
  },

  // ── recently viewed (FIFO 10) ────────────────────────
  pushRecent: (kind, ref) =>
    stateSignal.set((p) => {
      const filtered = p.recentlyViewed.filter(
        (e) => !(e.kind === kind && e.ref === ref)
      );
      return {
        ...p,
        recentlyViewed: [{ kind, ref, ts: Date.now() }, ...filtered].slice(0, 10),
      };
    }),

  // ── recent searches (5) ─────────────────────────────
  pushRecentSearch: (q) =>
    stateSignal.set((p) => {
      const filtered = p.recentSearches.filter((s) => s !== q);
      return { ...p, recentSearches: [q, ...filtered].slice(0, 5) };
    }),

  // ── coins ─────────────────────────────────────────────
  spendCoins: (amount) => {
    const cur = stateSignal.get().coins;
    if (cur < amount) return false;
    stateSignal.set((p) => ({ ...p, coins: p.coins - amount }));
    return true;
  },
  grantCoins: (amount) =>
    stateSignal.set((p) => ({ ...p, coins: p.coins + amount })),

  // ── unread ───────────────────────────────────────────
  setUnread: (patch) => stateSignal.set((p) => ({ ...p, unread: { ...p.unread, ...patch } })),
  markAllRead: () => stateSignal.set((p) => ({ ...p, unread: { comments: 0, mentions: 0, messages: 0 } })),

  // ── drafts ───────────────────────────────────────────
  saveDraft: (draft) =>
    stateSignal.set((p) => ({
      ...p,
      drafts: [
        { id: `d_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ts: Date.now(), ...draft },
        ...p.drafts,
      ].slice(0, 10),
    })),
  deleteDraft: (id) =>
    stateSignal.set((p) => ({ ...p, drafts: p.drafts.filter((d) => d.id !== id) })),
};
