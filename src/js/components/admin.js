// src/js/components/admin.js
// M7 — minimal mod queue page. Admin only. Lists unresolved
// reports from /api/admin/reports and lets the admin dismiss or
// remove_content right from the page.

import { h, mount } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { timeAgo } from "../utils/format.js";
import { state } from "../state.js";
import { api } from "../api.js";
import { toast } from "./toast.js";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function AdminPage() {
  const u = state.get().user;
  if (!u) {
    return h(
      "div",
      { class: "empty-state" },
      h("div", { class: "empty-state__icon", html: "🔒" }),
      h("h3", { class: "empty-state__title" }, "登录后才能使用管理面板"),
      h("a", { class: "btn btn--primary", href: "#/login?next=%23/admin" }, "登录")
    );
  }
  if (u.role !== "admin") {
    return h(
      "div",
      { class: "empty-state" },
      h("div", { class: "empty-state__icon", html: "⛔" }),
      h("h3", { class: "empty-state__title" }, "需要管理员权限"),
      h("p", { class: "empty-state__copy" }, "只有 role=admin 的账号能打开这个页面。"),
      h("a", { class: "btn btn--secondary", href: "#/" }, "返回首页")
    );
  }

  const root = h("div", { class: "admin-page" });
  const head = h(
    "div",
    { class: "admin-page__head" },
    h("h1", {}, "举报队列"),
    h(
      "div",
      { class: "admin-page__tabs" },
      h("button", {
        class: "admin-page__tab is-active", "data-filter": "unresolved", type: "button",
        onClick: (e) => switchFilter(e.target),
      }, "未处理"),
      h("button", {
        class: "admin-page__tab", "data-filter": "resolved", type: "button",
        onClick: (e) => switchFilter(e.target),
      }, "已处理（含历史）")
    )
  );
  const list = h("ul", { class: "admin-list" });
  root.appendChild(head);
  root.appendChild(list);

  let currentFilter = "unresolved";

  function switchFilter(btn) {
    for (const b of head.querySelectorAll(".admin-page__tab")) b.classList.remove("is-active");
    btn.classList.add("is-active");
    currentFilter = btn.dataset.filter;
    load();
  }

  function renderItem(r) {
    const target = r.targetKind === "post" ? `帖子 p_${r.targetId}` : `评论 c_${r.targetId}`;
    return h(
      "li",
      { class: ["admin-item", r.resolved ? "admin-item--resolved" : ""].join(" ") },
      h(
        "div",
        { class: "admin-item__main" },
        h(
          "div",
          { class: "admin-item__head" },
          h("strong", {}, escapeHtml(r.reporter || "?")),
          h("span", { class: "admin-item__sep" }, " 举报了 "),
          h("strong", {}, escapeHtml(target)),
          r.targetAuthor ? h("span", { class: "admin-item__sep" }, `（作者 ${escapeHtml(r.targetAuthor)}）`) : null,
          h("span", { class: "admin-item__time" }, timeAgo(r.createdAt))
        ),
        h("p", { class: "admin-item__reason" }, `原因：${escapeHtml(r.reason || "未填")}`),
        r.detail ? h("p", { class: "admin-item__detail" }, escapeHtml(r.detail)) : null,
        r.resolved ? h(
          "p",
          { class: "admin-item__resolution" },
          `已处理（${escapeHtml(r.resolution || "?")}）by ${escapeHtml(r.resolvedBy || "?")}`
        ) : null
      ),
      r.resolved ? null : h(
        "div",
        { class: "admin-item__actions" },
        h(
          "button",
          {
            class: "btn btn--ghost",
            type: "button",
            onClick: () => resolve(r.id, "dismiss"),
          },
          "驳回"
        ),
        h(
          "button",
          {
            class: "btn btn--danger",
            type: "button",
            onClick: () => resolve(r.id, "remove_content"),
          },
          "移除内容"
        )
      )
    );
  }

  async function load() {
    list.replaceChildren(h("li", { class: "admin-item admin-item--loading" }, "正在加载举报…"));
    try {
      const items = await api.getAdminReports({ resolved: currentFilter === "resolved" });
      if (!items.length) {
        list.replaceChildren(
          h("li", { class: "admin-item admin-item--empty" }, h("p", {}, "暂无举报"))
        );
        return;
      }
      list.replaceChildren(...items.map(renderItem));
    } catch (err) {
      list.replaceChildren(
        h("li", { class: "admin-item admin-item--error" }, h("p", {}, `加载失败：${err?.message || err}`))
      );
    }
  }

  async function resolve(reportId, action) {
    try {
      await api.resolveReport(reportId, action);
      toast(action === "dismiss" ? "已驳回" : "已移除内容", { kind: "success" });
      await load();
    } catch (err) {
      toast(`操作失败：${err?.message || err}`, { kind: "error" });
    }
  }

  load();
  return root;
}
