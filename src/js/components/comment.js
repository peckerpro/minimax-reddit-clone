// Comment — a single node in a comment tree. Supports voting, collapse /
// expand, reply box, and renders recursively.

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { formatScore, timeAgo } from "../utils/format.js";
import { state } from "../state.js";
import { toast } from "./toast.js";

const COLLAPSE_INDENT = 24;       // px per depth level
const MAX_VISUAL_DEPTH = 8;       // cap the indent after this many levels
const REPLY_BOX_PLACEHOLDER = "写下你的回复…";

function VoteCell(comment) {
  const up = h("button", {
    class: "vote-btn",
    type: "button",
    "aria-label": "赞同",
    onClick: () => onVote(1),
  });
  up.innerHTML = icon("arrowUp", { size: 16 });
  const score = h("span", { class: "vote-score", "aria-live": "polite" }, formatScore(displayScore()));
  const down = h("button", {
    class: "vote-btn",
    type: "button",
    "aria-label": "反对",
    onClick: () => onVote(-1),
  });
  down.innerHTML = icon("arrowDown", { size: 16 });

  function displayScore() {
    const v = state.getCommentVote(comment.id);
    return (comment.score || 0) + (v === 1 ? 1 : 0) + (v === -1 ? -1 : 0);
  }

  function applyVisual() {
    const v = state.getCommentVote(comment.id);
    up.classList.toggle("is-up", v === 1);
    down.classList.toggle("is-down", v === -1);
    score.textContent = formatScore(displayScore());
    score.classList.toggle("is-up", v === 1);
    score.classList.toggle("is-down", v === -1);
  }

  function onVote(dir) {
    const u = state.get().user;
    if (!u) {
      toast("登录后即可投票", { kind: "info" });
      location.hash = "#/login?next=" + encodeURIComponent(location.hash || "#/");
      return;
    }
    state.voteComment(comment.id, dir);
    applyVisual();
  }

  applyVisual();
  return h("div", { class: "vote-col vote-col--sm" }, up, score, down);
}

function MetaLine(comment) {
  return h(
    "div",
    { class: "c-meta" },
    h("span", { class: "c-meta__author" }, comment.author),
    h("span", { class: "c-meta__sep" }, "•"),
    h("span", { class: "c-meta__time" }, timeAgo(comment.createdAt)),
    comment.edited ? h("span", { class: "c-meta__edited" }, "• 已编辑") : null
  );
}

function ActionBar({ onReply, onToggleCollapse }) {
  return h(
    "div",
    { class: "c-actions" },
    h(
      "button",
      {
        class: "c-action",
        type: "button",
        onClick: onReply,
      },
      h("span", { html: icon("comment", { size: 14 }) }),
      "回复"
    ),
    h(
      "button",
      {
        class: "c-action",
        type: "button",
        onClick: onToggleCollapse,
      },
      h("span", { html: icon("chevronUp", { size: 14 }) }),
      h("span", { class: "c-action__label-collapse" }, "折叠")
    ),
    h(
      "button",
      {
        class: "c-action",
        type: "button",
        onClick: () => toast("已举报此评论", { kind: "warn" }),
      },
      h("span", { html: icon("help", { size: 14 }) }),
      "举报"
    ),
    h(
      "button",
      {
        class: "c-action",
        type: "button",
        onClick: () => toast("已收藏此评论", { kind: "success" }),
      },
      h("span", { html: icon("award", { size: 14 }) }),
      "收藏"
    )
  );
}

function ReplyBox({ onCancel, onSubmit }) {
  const ta = h("textarea", {
    class: "c-reply__input",
    rows: 3,
    placeholder: REPLY_BOX_PLACEHOLDER,
    "aria-label": "回复内容",
  });
  const submit = h(
    "button",
    {
      class: "btn btn--primary",
      type: "button",
      onClick: () => onSubmit(ta.value),
    },
    "回复"
  );
  const cancel = h(
    "button",
    {
      class: "btn btn--ghost",
      type: "button",
      onClick: onCancel,
    },
    "取消"
  );
  return h(
    "div",
    { class: "c-reply" },
    ta,
    h("div", { class: "c-reply__bar" }, cancel, submit)
  );
}

/**
 * @param {Object} comment
 * @param {Array}  children  array of child comment nodes (already built)
 * @param {Object} [opts]
 * @param {Map}    [opts.authorsByName]   username → user object
 */
export function Comment(comment, children, opts = {}) {
  const authorsByName = opts.authorsByName || new Map();
  const author = authorsByName.get((comment.author || "").replace(/^u\//, "").toLowerCase());

  const body = h("div", { class: "c-body" });
  body.appendChild(h("p", { class: "c-text" }, comment.body));

  const replyBoxSlot = h("div", { class: "c-reply-slot" });
  const childSlot = h("div", { class: "c-children" });
  for (const c of children) childSlot.appendChild(c);

  const collapseLabel = h("span", { class: "c-action__label-collapse" }, "折叠");
  const headerActions = ActionBar({
    onReply: () => toggleReply(),
    onToggleCollapse: () => setCollapsed(!collapsed),
  });
  // replace the placeholder label node
  headerActions.querySelector(".c-action__label-collapse").replaceWith(collapseLabel);

  const actionBar = headerActions;

  const header = h(
    "div",
    { class: "c-head" },
    VoteCell(comment),
    h(
      "div",
      { class: "c-head__main" },
      h(
        "div",
        { class: "c-head__row" },
        h(
          "a",
          {
            class: "c-author",
            href: `#/u/${(author?.name || comment.author).replace(/^u\//, "")}`,
          },
          h(
            "span",
            {
              class: "subicon subicon--xs",
              style: { background: author?.color || "#ff4500" },
              "aria-hidden": "true",
            },
            (author?.name || comment.author)[2]?.toUpperCase() || "U"
          ),
          h("span", { class: "c-author__name" }, author?.name || comment.author)
        ),
        MetaLine(comment)
      ),
      body,
      actionBar
    )
  );

  // ── collapse / expand ─────────────────────────────────
  let collapsed = false;
  function setCollapsed(v) {
    collapsed = v;
    body.style.display = v ? "none" : "";
    actionBar.style.display = v ? "none" : "";
    replyBoxSlot.style.display = v ? "none" : "";
    childSlot.style.display = v ? "none" : "";
    collapseLabel.textContent = v
      ? `[+] ${children.length || 0} 条回复`
      : "折叠";
  }

  // ── reply box ─────────────────────────────────────────
  function toggleReply() {
    const u = state.get().user;
    if (!u) {
      toast("登录后即可回复", { kind: "info" });
      location.hash = "#/login?next=" + encodeURIComponent(location.hash || "#/");
      return;
    }
    const open = replyBoxSlot.childElementCount > 0;
    if (open) {
      replyBoxSlot.replaceChildren();
    } else {
      replyBoxSlot.appendChild(
        ReplyBox({
          onCancel: () => toggleReply(),
          onSubmit: async (text) => {
            const t = (text || "").trim();
            if (!t) {
              toast("请输入内容", { kind: "warn" });
              return;
            }
            try {
              await api.submitComment(comment.postId, {
                body: t,
                parentId: comment.id,
              });
              toast("回复已发布（刷新可见）", { kind: "success" });
              toggleReply();
            } catch (err) {
              toast(`发布失败：${err?.message || err}`, { kind: "error" });
            }
          },
        })
      );
    }
  }

  const indent = Math.min(comment.depth || 0, MAX_VISUAL_DEPTH) * COLLAPSE_INDENT;

  return h(
    "div",
    {
      class: "comment",
      "data-comment-id": comment.id,
      style: { marginLeft: `${indent}px` },
    },
    header,
    replyBoxSlot,
    childSlot
  );
}
