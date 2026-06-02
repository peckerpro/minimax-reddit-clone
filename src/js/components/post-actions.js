// Post action bar — comments, award, share, more (跟帖 dropdown).
// v2.0.0: more dropdown now has 隐藏/收藏/举报/屏蔽社区/屏蔽作者/订阅通知
// 6 个真选项。

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { formatScore } from "../utils/format.js";
import { state } from "../state.js";
import { toast } from "./toast.js";
import { dropdown } from "./dropdown.js";
import { openAwardModal } from "./award-modal.js";
import { openShareModal } from "./share-modal.js";
import { openReportModal } from "./report-modal.js";

function AwardButton(post) {
  return h(
    "button",
    {
      class: ["post-action", post.awards > 0 ? "post-action--awarded" : ""],
      type: "button",
      "aria-label": `给予奖励（已给予 ${post.awards || 0} 个奖励）`,
      onClick: () => openAwardModal({ post }),
    },
    h("span", { class: "post-action__icon", html: icon("award", { size: 18 }) }),
    h("span", { class: "post-action__label" }, formatScore(post.awards || 0))
  );
}

function CommentsLink(post) {
  return h(
    "a",
    {
      class: "post-action",
      href: `#/r/${post.subreddit}/comments/${post.id}`,
      "aria-label": `${post.comments} 转到评论`,
    },
    h("span", { class: "post-action__icon", html: icon("comment", { size: 18 }) }),
    h("span", { class: "post-action__label" }, formatScore(post.comments || 0)),
    h("span", { class: "post-action__sublabel" }, "评论")
  );
}

function ShareButton(post) {
  const trigger = h(
    "button",
    {
      class: "post-action",
      type: "button",
      "aria-label": "共享",
    },
    h("span", { class: "post-action__icon", html: icon("share", { size: 18 }) }),
    h("span", { class: "post-action__label" }, "共享")
  );
  dropdown(trigger, () => {
    // Single-click also opens the share modal — we open the modal on the
    // trigger click and let the dropdown close itself. To avoid a double-open
    // we use mousedown on a different element.
    return h("span", { class: "dd__panel--hidden" });
  });
  // override: open the modal when triggered, don't use the dropdown
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    // close any open dropdown
    document.body.click();
    openShareModal({ post });
  });
  return trigger;
}

function MoreButton(post) {
  const trigger = h(
    "button",
    {
      class: "post-action post-action--more",
      type: "button",
      "aria-label": "更多操作",
    },
    h("span", { class: "post-action__icon", html: icon("more", { size: 18 }) })
  );

  dropdown(trigger, () => {
    const isHidden = state.isHidden(post.id);
    const isSaved = state.isSaved(post.id);
    const isSubscribed = state.isSubscribedPost(post.id);
    const isUserBlocked = state.isUserBlocked(post.author);
    const isSubBlocked = state.isSubredditBlocked(post.subreddit);

    return h("div", { class: "more-panel", role: "menu" },
      h("button", {
        class: "more-panel__item",
        onClick: () => {
          state.toggleHidden(post.id);
          toast(isHidden ? "已取消隐藏" : "已隐藏", { kind: "info" });
          document.body.click();
        },
      }, h("span", { html: icon(isHidden ? "plus" : "close", { size: 16 }) }), isHidden ? "取消隐藏" : "隐藏"),

      h("button", {
        class: "more-panel__item",
        onClick: () => {
          state.toggleSaved(post.id);
          toast(isSaved ? "已取消收藏" : "已收藏", { kind: "success" });
          document.body.click();
        },
      }, h("span", { html: icon("award", { size: 16 }) }), isSaved ? "取消收藏" : "收藏"),

      h("button", {
        class: "more-panel__item",
        onClick: () => {
          state.toggleSubscribedPost(post.id);
          toast(isSubscribed ? "已取消订阅通知" : "已订阅通知", { kind: "info" });
          document.body.click();
        },
      }, h("span", { html: icon("bell", { size: 16 }) }), isSubscribed ? "取消订阅通知" : "订阅通知"),

      h("hr", { class: "more-panel__sep" }),

      h("button", {
        class: "more-panel__item",
        onClick: () => {
          state.toggleBlockUser(post.author);
          toast(isUserBlocked ? `已取消屏蔽 u/${post.author}` : `已屏蔽 u/${post.author}`, { kind: "info" });
          document.body.click();
        },
      }, h("span", { html: icon("eyeOff", { size: 16 }) }), isUserBlocked ? `取消屏蔽 u/${post.author}` : `屏蔽 u/${post.author}`),

      h("button", {
        class: "more-panel__item",
        onClick: () => {
          state.toggleBlockSubreddit(post.subreddit);
          toast(isSubBlocked ? `已取消屏蔽 r/${post.subreddit}` : `已屏蔽 r/${post.subreddit}`, { kind: "info" });
          document.body.click();
        },
      }, h("span", { html: icon("eyeOff", { size: 16 }) }), isSubBlocked ? `取消屏蔽 r/${post.subreddit}` : `屏蔽 r/${post.subreddit}`),

      h("hr", { class: "more-panel__sep" }),

      h("button", {
        class: "more-panel__item more-panel__item--warn",
        onClick: () => {
          document.body.click();
          openReportModal({ target: "post" });
        },
      }, h("span", { html: icon("help", { size: 16 }) }), "举报"),

      h("button", {
        class: "more-panel__item",
        onClick: () => {
          navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/r/${post.subreddit}/comments/${post.id}`);
          toast("链接已复制", { kind: "success" });
          document.body.click();
        },
      }, h("span", { html: icon("link", { size: 16 }) }), "复制链接")
    );
  });

  return trigger;
}

/**
 * @param {object} post
 */
export function PostActions(post) {
  return h(
    "div",
    { class: "post-actions" },
    CommentsLink(post),
    AwardButton(post),
    ShareButton(post),
    MoreButton(post)
  );
}
