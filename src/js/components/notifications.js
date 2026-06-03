// Notifications page.

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { timeAgo } from "../utils/format.js";
import { state } from "../state.js";
import { api } from "../api.js";
import { toast } from "./toast.js";

const ICON_BY_KIND = {
  reply:   "comment",
  upvote:  "arrowUp",
  follow:  "user",
  mention: "text",
  mod:     "shield",
  award:   "award",
};

// Notification.kind -> short text. The actual content (e.g. the
// "50 个赞" or "回复了 X 评论") is left to the server's source
// record when M6 wires the triggers; for now we render a generic
// label keyed on the kind.
const LABEL_BY_KIND = {
  reply:   "回复了你的内容",
  upvote:  "给你点了赞",
  follow:  "关注了你",
  mention: "在评论中提到了你",
  mod:     "版主操作",
  award:   "奖励了你的内容",
};

export function NotificationsPage() {
  const u = state.get().user;
  if (!u) {
    return h(
      "div",
      { class: "empty-state" },
      h("div", { class: "empty-state__icon", html: "🔒" }),
      h("h3", { class: "empty-state__title" }, "登录后才能查看通知"),
      h("a", { class: "btn btn--primary", href: "#/login?next=%23/notifications" }, "登录")
    );
  }

  // Render skeleton; replace with fetched list once it arrives.
  const list = h("ul", { class: "notif-list" });
  const headCount = h("span", { class: "notif__count" }, "…");

  const root = h(
    "div",
    { class: "notifications-page" },
    h(
      "div",
      { class: "notifications-page__head" },
      h("h1", {}, "通知", headCount),
      h(
        "button",
        {
          class: "btn btn--ghost",
          type: "button",
          onClick: async () => {
            try {
              await api.markAllNotificationsRead();
              toast("已全部标为已读", { kind: "success" });
              await load();
            } catch (err) {
              toast(`操作失败：${err?.message || err}`, { kind: "error" });
            }
          },
        },
        "全部标为已读"
      )
    ),
    list
  );

  function renderItem(n) {
    const kind = n.kind || "reply";
    const label = LABEL_BY_KIND[kind] || "新通知";
    return h(
      "li",
      { class: ["notif", n.read ? "" : "notif--unread"].filter(Boolean).join(" ") },
      h(
        "a",
        {
          class: "notif__link",
          href: "#/",
          onClick: async (e) => {
            // mark as read on click
            if (!n.read) {
              try { await api.markNotificationRead(n.id); } catch {}
            }
          },
        },
        h("span", { class: "notif__icon", html: icon(ICON_BY_KIND[kind] || "bell", { size: 18 }) }),
        h(
          "div",
          { class: "notif__body" },
          h("p", { class: "notif__text" }, label),
          h("span", { class: "notif__time" }, timeAgo(n.createdAt))
        )
      )
    );
  }

  async function load() {
    list.replaceChildren(h("li", { class: "notif notif--loading" }, "正在加载通知…"));
    try {
      const items = await api.getNotifications();
      headCount.textContent = items.length ? `（${items.filter((n) => !n.read).length} 未读）` : "";
      if (!items.length) {
        list.replaceChildren(
          h(
            "li",
            { class: "notif notif--empty" },
            h("p", {}, "暂无通知")
          )
        );
        return;
      }
      list.replaceChildren(...items.map(renderItem));
      // update unread count in the header
      const unread = items.filter((n) => !n.read).length;
      state.setUnread({ mentions: unread, comments: unread });
    } catch (err) {
      list.replaceChildren(
        h("li", { class: "notif notif--error" }, h("p", {}, `加载失败：${err?.message || err}`))
      );
    }
  }
  load();

  return root;
}
