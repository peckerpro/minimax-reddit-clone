// Vote column — vertical stack with up arrow, score, down arrow.
// Optimistic UI: clicking updates the score immediately; state.js persists.

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { formatScore } from "../utils/format.js";
import { state } from "../state.js";
import { toast } from "./toast.js";

/**
 * @param {Object} post  { id, score }
 */
export function VoteColumn(post) {
  const up = h("button", {
    class: "vote-btn",
    type: "button",
    "aria-label": "赞同",
    onClick: () => onVote(1),
  });
  up.innerHTML = icon("arrowUp", { size: 20 });
  const score = h("div", { class: "vote-score", "aria-live": "polite" }, formatScore(displayScore(post)));
  const down = h("button", {
    class: "vote-btn",
    type: "button",
    "aria-label": "反对",
    onClick: () => onVote(-1),
  });
  down.innerHTML = icon("arrowDown", { size: 20 });

  function applyVisual() {
    const v = state.getVote(post.id);
    up.classList.toggle("is-up", v === 1);
    down.classList.toggle("is-down", v === -1);
    up.setAttribute("aria-pressed", v === 1 ? "true" : "false");
    down.setAttribute("aria-pressed", v === -1 ? "true" : "false");
    score.textContent = formatScore(displayScore(post));
    score.classList.toggle("is-up", v === 1);
    score.classList.toggle("is-down", v === -1);
  }

  function displayScore(p) {
    const v = state.getVote(post.id);
    return (p.score || 0) + (v === 1 ? 1 : 0) + (v === -1 ? -1 : 0);
  }

  function onVote(dir) {
    const u = state.get().user;
    if (!u) {
      toast("登录后即可投票", { kind: "info" });
      location.hash = "#/login?next=" + encodeURIComponent(location.hash || "#/");
      return;
    }
    state.votePost(post.id, dir);
    applyVisual();
  }

  applyVisual();
  // re-render on state change (e.g. when sorting flips the order)
  state.subscribe(() => applyVisual());

  return h(
    "div",
    { class: "vote-col" },
    up,
    score,
    down
  );
}
