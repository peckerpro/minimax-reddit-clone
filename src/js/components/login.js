// src/js/components/login.js
// v3.0.0: real /api/auth/* integration. The page form has both a login
// and a register mode (selected by `mode` or by the URL path). The
// modal variant only supports login.

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { auth } from "../auth.js";
import { state } from "../state.js";
import { toast } from "./toast.js";
import { openModal } from "./modal.js";

export function LoginPage({ next, title = "登录", mode = "login" }) {
  return h("div", { class: "form-wrap" }, renderForm({
    title, mode, next,
    onSuccess: (user) => {
      state.login(user);
      toast(`欢迎回来，${user.name}`, { kind: "success" });
      location.hash = next || "#/";
    },
  }));
}

/**
 * Form renderer shared by the full page and the modal.
 *   mode: "login" | "register"
 */
function renderForm({ title, mode, next, onSuccess }) {
  const isRegister = mode === "register";
  const u = h("input", { class: "form__input", type: "text", placeholder: "用户名", autocomplete: "username", required: true });
  const eIn = h("input", { class: "form__input", type: "email", placeholder: "邮箱", autocomplete: "email", required: true });
  const p = h("input", { class: "form__input", type: "password", placeholder: "密码", autocomplete: isRegister ? "new-password" : "current-password", required: true });
  const errorEl = h("p", { class: "form__error", style: { display: "none" } });
  const submit = h("button", { class: "btn btn--primary btn--block", type: "submit" }, isRegister ? "注册" : "登录");

  const fields = h(
    "div",
    {},
    h("label", { class: "form__label" }, "用户名", u),
    isRegister ? h("label", { class: "form__label" }, "邮箱", eIn) : null,
    h("label", { class: "form__label" }, "密码", p),
  );

  const altLink = isRegister
    ? h("p", { class: "form__alt" }, "已有账户？", h("a", { href: "#/login" }, "登录"))
    : h("p", { class: "form__alt" }, "还没有账户？", h("a", { href: "#/register" }, "注册"));

  const form = h(
    "form",
    {
      class: "form",
      onSubmit: async (ev) => {
        ev.preventDefault();
        errorEl.style.display = "none";
        submit.disabled = true;
        submit.textContent = isRegister ? "注册中…" : "登录中…";
        let r;
        if (isRegister) {
          r = await auth.register({ name: u.value.trim(), email: eIn.value.trim(), password: p.value });
        } else {
          r = await auth.login(u.value.trim(), p.value);
        }
        if (r.ok) {
          onSuccess(r.user);
          return;
        }
        submit.disabled = false;
        submit.textContent = isRegister ? "注册" : "登录";
        errorEl.textContent = r.error || "请求失败";
        errorEl.style.display = "";
      },
    },
    h("h2", { class: "form__title" }, isRegister ? "创建账户" : title),
    h("p", { class: "form__hint" }, isRegister
      ? "用户名 3-20 字符（字母/数字/下划线/连字符），密码至少 8 位。"
      : "提示：登录后会创建一个会话 cookie，过期 30 天。"),
    errorEl,
    fields,
    submit,
    isRegister ? null : h("div", { class: "form__divider" }, h("span", {}, "或")),
    isRegister ? null : h(
      "button",
      {
        class: "btn btn--secondary btn--block",
        type: "button",
        onClick: () => toast("Google 登录未配置（mock）", { kind: "info" }),
      },
      h("span", { html: icon("user", { size: 16 }) }),
      " 继续使用 Google"
    ),
    isRegister ? null : h(
      "button",
      {
        class: "btn btn--secondary btn--block",
        type: "button",
        onClick: () => toast("Apple 登录未配置（mock）", { kind: "info" }),
      },
      h("span", { html: icon("user", { size: 16 }) }),
      " 继续使用 Apple"
    ),
    h("p", { class: "form__alt" }, "继续即表示你同意我们的 ", h("a", { href: "#/help/user-agreement" }, "用户协议"), " 与 ", h("a", { href: "#/help/privacy-policy" }, "隐私政策"), "。"),
    altLink,
  );
  return form;
}

/**
 * Programmatic login (used by the header's 登录 button).
 */
export function openLoginModal(next) {
  const form = renderForm({
    title: "登录", mode: "login", next,
    onSuccess: (user) => {
      state.login(user);
      toast(`欢迎回来，${user.name}`, { kind: "success" });
      api.close();
      if (next) location.hash = next;
    },
  });
  const api = openModal({
    title: "登录",
    subtitle: "继续即表示你同意我们的 用户协议 与 隐私政策。",
    body: form,
    footer: h("a", { class: "btn btn--ghost", href: "#/login" }, "打开完整登录页"),
  });
  return api;
}
