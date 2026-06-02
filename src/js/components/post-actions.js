// Post action bar — comments, award, share, hide, save.

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { formatScore } from "../utils/format.js";
import { state } from "../state.js";
import { toast } from "./toast.js";
import { dropdown } from "./dropdown.js";

function AwardButton(post) {
  const btn = h(
    "button",
    {
      class: ["post-action", post.awards > 0 ? "post-action--awarded" : ""],
      type: "button",
      "aria-label": `给予奖励（已给予 ${post.awards || 0} 个奖励）`,
      onClick: () => toast(`已对帖子赠送 1 个奖励`, { kind: "success" }),
    },
    h("span", { class: "post-action__icon", html: icon("award", { size: 18 }) }),
    h("span", { class: "post-action__label" }, formatScore(post.awards || 0))
  );
  return btn;
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
  dropdown(trigger, () => SharePanel(post));
  return trigger;
}

function SharePanel(post) {
  const url = `${location.origin}${location.pathname}#/r/${post.subreddit}/comments/${post.id}`;
  return h(
    "div",
    { class: "share-panel" },
    h("h3", { class: "share-panel__title" }, "分享到"),
    h(
      "button",
      {
        class: "share-panel__item",
        onClick: () => {
          navigator.clipboard?.writeText(url);
          toast("链接已复制到剪贴板", { kind: "success" });
        },
      },
      h("span", { html: icon("link", { size: 18 }) }),
      "复制链接"
    ),
    h(
      "a",
      { class: "share-panel__item", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}`, target: "_blank", rel: "noreferrer" },
      h("span", { class: "share-panel__brand" }, "𝕏"),
      "X (Twitter)"
    ),
    h(
      "a",
      { class: "share-panel__item", href: `mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(url)}` },
      h("span", { html: icon("share", { size: 18 }) }),
      "电子邮件"
    )
  );
}

function MoreButton(post) {
  const trigger = h(
    "button",
    {
      class: "post-action",
      type: "button",
      "aria-label": "打开用户操作",
    },
    h("span", { class: "post-action__icon", html: icon("more", { size: 18 }) })
  );

  dropdown(trigger, () => {
    const isHidden = state.isHidden(post.id);
    const isSaved = state.isSaved(post.id);
    return h(
      "div",
      { class: "more-panel", role: "menu" },
      h(
        "button",
        {
          class: "more-panel__item",
          onClick: () => {
            state.toggleHidden(post.id);
            toast(isHidden ? "已取消隐藏" : "已隐藏此贴", { kind: "info" });
          },
        },
        h("span", { html: icon(isHidden ? "plus" : "close", { size: 16 }) }),
        isHidden ? "取消隐藏" : "隐藏"
      ),
      h(
        "button",
        {
          class: "more-panel__item",
          onClick: () => {
            state.toggleSaved(post.id);
            toast(isSaved ? "已取消收藏" : "已收藏到个人主页", { kind: "success" });
          },
        },
        h("span", { html: icon("award", { size: 16 }) }),
        isSaved ? "取消收藏" : "收藏"
      ),
      h(
        "a",
        { class: "more-panel__item", href: "#/report" },
        h("span", { html: icon("help", { size: 16 }) }),
        "举报"
      )
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
