// Mock API. Reads from /src/data/*.json via dynamic import (vite-style
// JSON modules are not available in vanilla — we have to fetch the file).
// Each method returns a Promise so swapping in a real backend later is a
// drop-in change at the call sites.

import subreddits from "../data/subreddits.json" with { type: "json" };

const NETWORK_DELAY_MS = 60;

function delay<T>(value, ms = NETWORK_DELAY_MS) {
  return new Promise((res) => setTimeout(() => res(value), ms));
}

/** @typedef {{ name: string, display: string, members: number, iconText: string, color: string, description: string, nsfw: boolean }} Subreddit */

const subredditIndex = new Map(subreddits.subreddits.map((s) => [s.name.toLowerCase(), s]));

export const api = {
  /** @returns {Promise<Subreddit[]>} */
  async listSubreddits() {
    return delay(subreddits.subreddits.slice());
  },

  /** @returns {Promise<Subreddit|null>} */
  async getSubreddit(name) {
    return delay(subredditIndex.get(String(name).toLowerCase()) || null);
  },

  /**
   * Top-N popular subreddits. Mirrors the live Reddit reference's
   * "热门社区" list: 5 cards above the fold, with a "查看更多" link.
   * @param {number} [n=5]
   */
  async popularSubreddits(n = 5) {
    const all = subreddits.subreddits.slice();
    return delay(all.slice(0, n));
  },
};
