// Settings page.

import { h } from "../utils/dom.js";
import { state } from "../state.js";
import { auth } from "../auth.js";
import { toast } from "./toast.js";

function SettingRow({ label, desc, control }) {
  return h(
    "div",
    { class: "settings-row" },
    h(
      "div",
      { class: "settings-row__text" },
      h("h3", {}, label),
      desc ? h("p", {}, desc) : null
    ),
    h("div", { class: "settings-row__control" }, control)
  );
}

function Toggle({ initial, onChange }) {
  let on = !!initial;
  const btn = h("button", {
    class: ["toggle", on ? "is-on" : ""].join(" "),
    type: "button",
    "aria-pressed": on ? "true" : "false",
    onClick: () => {
      on = !on;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      onChange?.(on);
    },
  });
  return btn;
}

export function SettingsPage() {
  const u = state.get().user;

  if (!u) {
    return h(
      "div",
      { class: "empty-state" },
      h("div", { class: "empty-state__icon", html: "🔒" }),
      h("h3", { class: "empty-state__title" }, "登录后才能修改设置"),
      h("a", { class: "btn btn--primary", href: "#/login?next=%23/settings" }, "登录")
    );
  }

  return h(
    "div",
    { class: "settings-page" },
    h("h1", { class: "settings-page__title" }, "设置"),

    h(
      "section",
      { class: "settings-group" },
      h("h2", {}, "账户"),
      SettingRow({
        label: "用户名",
        desc: "你当前的显示名（不可修改）。",
        control: h("span", { class: "settings-row__static" }, u.name),
      }),
      SettingRow({
        label: "Karma",
        desc: "发帖和评论获得的积分。",
        control: h("span", { class: "settings-row__static" }, (u.karma || 0).toLocaleString()),
      }),
      SettingRow({
        label: "退出登录",
        desc: "从所有设备退出。",
        control: h(
          "button",
          {
            class: "btn btn--secondary",
            type: "button",
            onClick: async () => {
              await auth.logout();
              state.logout();
              toast("已退出登录", { kind: "info" });
              location.hash = "#/";
            },
          },
          "退出"
        ),
      })
    ),

    h(
      "section",
      { class: "settings-group" },
      h("h2", {}, "显示"),
      SettingRow({
        label: "深色模式",
        desc: "尚未支持，但占位 UI 已就位。",
        control: Toggle({ initial: false, onChange: () => toast("将在 v1.0.0 启用", { kind: "info" }) }),
      }),
      SettingRow({
        label: "紧凑信息流",
        desc: "信息流中的卡片显示为紧凑行。",
        control: Toggle({
          initial: state.get().view === "compact",
          onChange: (on) => {
            state.setView(on ? "compact" : "card");
            toast("已切换视图", { kind: "success" });
          },
        }),
      })
    ),

    h(
      "section",
      { class: "settings-group" },
      h("h2", {}, "通知"),
      SettingRow({
        label: "新评论提醒",
        desc: "当你的帖子收到新评论时通知你。",
        control: Toggle({ initial: true, onChange: () => toast("设置已保存（mock）", { kind: "success" }) }),
      }),
      SettingRow({
        label: "关注的社区有新帖",
        desc: "当你加入的社区有新帖子时通知你。",
        control: Toggle({ initial: false }),
      })
    )
  );
}
