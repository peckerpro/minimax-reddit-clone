// Notifications page.

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { timeAgo } from "../utils/format.js";
import { state } from "../state.js";
import { toast } from "./toast.js";

const NOTIFICATIONS = [
  { id: "n1", kind: "reply",   from: "u_ada",         text: "回复了你的评论：「Source: was in the room. Can confirm…」",   at: "2026-06-02T05:14:00Z", unread: true,  link: "#/r/technology/comments/p003" },
  { id: "n2", kind: "upvote",  from: "u_pixel",       text: "在 r/aww 给你的帖子点了 50 个赞",                                at: "2026-06-02T04:30:00Z", unread: true,  link: "#/r/aww" },
  { id: "n3", kind: "follow",  from: "u_logwelder",   text: "关注了你",                                                  at: "2026-06-01T22:18:00Z", unread: false, link: "#/u/Logical_Welder3467" },
  { id: "n4", kind: "mention", from: "u_zenos",       text: "在 r/technology 提到了你：「@you 在这个 thread 总结得很好」",     at: "2026-06-01T20:50:00Z", unread: false, link: "#/r/technology/comments/p003" },
  { id: "n5", kind: "mod",     from: "r/technology",  text: "你的帖子已被版主批准并发布到 r/technology",                       at: "2026-06-01T18:22:00Z", unread: false, link: "#/r/technology" },
  { id: "n6", kind: "award",   from: "u_ada",         text: "给了你的评论一个「Heartwarming」奖励",                          at: "2026-06-01T12:00:00Z", unread: false, link: "#/r/funny" },
];

const ICON_BY_KIND = {
  reply:   "comment",
  upvote:  "arrowUp",
  follow:  "user",
  mention: "text",
  mod:     "shield",
  award:   "award",
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

  return h(
    "div",
    { class: "notifications-page" },
    h(
      "div",
      { class: "notifications-page__head" },
      h("h1", {}, "通知"),
      h(
        "button",
        {
          class: "btn btn--ghost",
          type: "button",
          onClick: () => toast("已全部标为已读", { kind: "success" }),
        },
        "全部标为已读"
      )
    ),
    h(
      "ul",
      { class: "notif-list" },
      ...NOTIFICATIONS.map((n) =>
        h(
          "li",
          { class: ["notif", n.unread ? "notif--unread" : ""].join(" ") },
          h(
            "a",
            { class: "notif__link", href: n.link },
            h(
              "span",
              { class: "notif__icon", html: icon(ICON_BY_KIND[n.kind] || "bell", { size: 18 }) }
            ),
            h(
              "div",
              { class: "notif__body" },
              h("p", { class: "notif__text" }, n.text),
              h("span", { class: "notif__time" }, timeAgo(n.at))
            )
          )
        )
      )
    )
  );
}
