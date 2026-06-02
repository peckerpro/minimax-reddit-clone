// Share sheet modal — opens from post's share button.
// Lists 8 mock share targets: copy link / copy embed / X / Facebook / Tumblr /
// email / SMS / QR code. QR is a placeholder.

import { h } from "../utils/dom.js";
import { state } from "../state.js";
import { toast } from "./toast.js";
import { openModal } from "./modal.js";
import { api } from "../api.js";
import { icon } from "../utils/icons.js";

const ICON_BY_TARGET = {
  "copy-link": "link",
  "copy-embed": "code",
  "twitter": "twitter",
  "facebook": "facebook",
  "tumblr": "share",
  "email": "share",
  "sms": "share",
  "qr": "qr",
};

export async function openShareModal({ post }) {
  const targets = await api.listShareTargets();
  const url = `${location.origin}${location.pathname}#/r/${post.subreddit}/comments/${post.id}`;

  const list = h("div", { class: "share-modal__list" });
  for (const t of targets) {
    const item = h(
      "button",
      {
        class: "share-modal__item",
        type: "button",
        "data-id": t.id,
        onClick: () => {
          handleShare(t, post, url);
        },
      },
      h("span", { class: "share-modal__icon", html: icon(ICON_BY_TARGET[t.id] || "share", { size: 20 }) }),
      h("span", {}, t.name)
    );
    list.appendChild(item);
  }

  const u = state.get().user;
  const notifChk = h("input", {
    type: "checkbox",
    id: "share-notif",
    onChange: (e) => {
      if (e.target.checked) {
        state.toggleSubscribedPost(post.id);
        toast(state.isSubscribedPost(post.id) ? "已订阅帖子通知" : "已取消订阅", { kind: "info" });
      }
    },
  });

  function handleShare(t, post, url) {
    if (t.kind === "copy") {
      let text = url;
      if (t.id === "copy-embed") {
        text = `<iframe src="${url.replace("/comments/", "/embed/")}" width="640" height="360"></iframe>`;
      }
      navigator.clipboard?.writeText(text);
      toast("已复制到剪贴板", { kind: "success" });
      return;
    }
    if (t.kind === "mailto") {
      location.href = `mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(url)}`;
      return;
    }
    if (t.kind === "sms") {
      location.href = `sms:?body=${encodeURIComponent(post.title + " " + url)}`;
      return;
    }
    if (t.kind === "qr") {
      toast("QR 码生成（mock）", { kind: "info" });
      return;
    }
    if (t.kind === "external") {
      let target = "#";
      if (t.id === "twitter") target = `https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(url)}`;
      if (t.id === "facebook") target = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
      if (t.id === "tumblr") target = `https://www.tumblr.com/share/link?url=${encodeURIComponent(url)}&name=${encodeURIComponent(post.title)}`;
      window.open(target, "_blank", "noopener,noreferrer");
    }
  }

  const body = h("div", { class: "share-modal__body" },
    list,
    u ? h("label", { for: "share-notif", class: "share-modal__notif" },
      notifChk,
      h("span", {}, "通知我的关注者")
    ) : null
  );

  const api = openModal({
    title: "分享到",
    body,
    size: "sm",
  });
  return api;
}
