// Global in-memory state. Single source of truth for the SPA.
// Persists to localStorage. v2.0.0: extended with blocked / recentlyViewed /
// drafts / coins / theme / time / density / leftNavCollapsed / recentSearches /
// unread / subscribedPosts / followedUsers.

import { signal } from "./utils/dom.js";

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
  isJoined: (name) => stateSignal.get().joined.includes(name),
  toggleJoin: (name) =>
    stateSignal.set((p) => ({
      ...p,
      joined: p.joined.includes(name)
        ? p.joined.filter((n) => n !== name)
        : [...p.joined, name],
    })),

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
  getVote: (postId) => stateSignal.get().votes[postId] || 0,
  votePost: (postId, dir) =>
    stateSignal.set((p) => {
      const prev = p.votes[postId] || 0;
      const next = prev === dir ? 0 : dir;
      return { ...p, votes: { ...p.votes, [postId]: next } };
    }),
  getCommentVote: (commentId) => stateSignal.get().commentVotes[commentId] || 0,
  voteComment: (commentId, dir) =>
    stateSignal.set((p) => {
      const prev = p.commentVotes[commentId] || 0;
      const next = prev === dir ? 0 : dir;
      return { ...p, commentVotes: { ...p.commentVotes, [commentId]: next } };
    }),

  // ── hidden / saved / subscribed posts ───────────────
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

  isSubscribedPost: (postId) => stateSignal.get().subscribedPosts.includes(postId),
  toggleSubscribedPost: (postId) =>
    stateSignal.set((p) => ({
      ...p,
      subscribedPosts: p.subscribedPosts.includes(postId)
        ? p.subscribedPosts.filter((id) => id !== postId)
        : [...p.subscribedPosts, postId],
    })),

  // ── blocking ─────────────────────────────────────────
  isUserBlocked: (name) => stateSignal.get().blocked.users.includes(name),
  isSubredditBlocked: (name) => stateSignal.get().blocked.subreddits.includes(name),
  toggleBlockUser: (name) =>
    stateSignal.set((p) => ({
      ...p,
      blocked: {
        ...p.blocked,
        users: p.blocked.users.includes(name)
          ? p.blocked.users.filter((n) => n !== name)
          : [...p.blocked.users, name],
      },
    })),
  toggleBlockSubreddit: (name) =>
    stateSignal.set((p) => ({
      ...p,
      blocked: {
        ...p.blocked,
        subreddits: p.blocked.subreddits.includes(name)
          ? p.blocked.subreddits.filter((n) => n !== name)
          : [...p.blocked.subreddits, name],
      },
    })),

  // ── following ─────────────────────────────────────────
  isFollowing: (name) => stateSignal.get().followed.includes(name),
  toggleFollow: (name) =>
    stateSignal.set((p) => ({
      ...p,
      followed: p.followed.includes(name)
        ? p.followed.filter((n) => n !== name)
        : [...p.followed, name],
    })),

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
