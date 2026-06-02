// Login page — full form with mock OAuth buttons, error states, etc.

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { auth } from "../auth.js";
import { state } from "../state.js";
import { toast } from "./toast.js";
import { openModal } from "./modal.js";

export function LoginPage({ next }) {
  const u = h("input", { class: "form__input", type: "text", placeholder: "用户名", autocomplete: "username", required: true });
  const p = h("input", { class: "form__input", type: "password", placeholder: "密码", autocomplete: "current-password", required: true });
  const errorEl = h("p", { class: "form__error", style: { display: "none" } });
  const submit = h(
    "button",
    { class: "btn btn--primary btn--block", type: "submit" },
    "登录"
  );

  const form = h(
    "form",
    {
      class: "form",
      onSubmit: async (e) => {
        e.preventDefault();
        errorEl.style.display = "none";
        submit.disabled = true;
        submit.textContent = "登录中…";
        const r = await auth.login(u.value, p.value);
        submit.disabled = false;
        submit.textContent = "登录";
        if (r.ok) {
          state.login(r.user);
          toast(`欢迎回来，${r.user.name}`, { kind: "success" });
          location.hash = next || "#/";
        } else {
          errorEl.textContent = r.error;
          errorEl.style.display = "";
        }
      },
    },
    h("h2", { class: "form__title" }, "登录以继续"),
    h("p", { class: "form__hint" }, "提示：任意非空用户名 + 密码均可登录。"),
    errorEl,
    h("label", { class: "form__label" }, "用户名", u),
    h("label", { class: "form__label" }, "密码", p),
    submit,
    h("div", { class: "form__divider" }, h("span", {}, "或")),
    h(
      "button",
      {
        class: "btn btn--secondary btn--block",
        type: "button",
        onClick: () => toast("Google 登录未配置（mock）", { kind: "info" }),
      },
      h("span", { html: icon("user", { size: 16 }) }),
      " 继续使用 Google"
    ),
    h(
      "button",
      {
        class: "btn btn--secondary btn--block",
        type: "button",
        onClick: () => toast("Apple 登录未配置（mock）", { kind: "info" }),
      },
      h("span", { html: icon("user", { size: 16 }) }),
      " 继续使用 Apple"
    ),
    h("p", { class: "form__alt" }, "继续即表示你同意我们的 用户协议 与 隐私政策。")
  );

  return h("div", { class: "form-wrap" }, form);
}

/**
 * Programmatic login (used by the header's 登录 button — opens a modal
 * instead of routing to a separate page).
 */
export function openLoginModal(next) {
  const u = h("input", { class: "form__input", type: "text", placeholder: "用户名", autocomplete: "username", required: true });
  const p = h("input", { class: "form__input", type: "password", placeholder: "密码", autocomplete: "current-password", required: true });
  const errorEl = h("p", { class: "form__error", style: { display: "none" } });
  const submit = h("button", { class: "btn btn--primary", type: "submit" }, "登录");

  const form = h(
    "form",
    {
      class: "form",
      onSubmit: async (e) => {
        e.preventDefault();
        errorEl.style.display = "none";
        submit.disabled = true;
        submit.textContent = "登录中…";
        const r = await auth.login(u.value, p.value);
        if (r.ok) {
          state.login(r.user);
          toast(`欢迎回来，${r.user.name}`, { kind: "success" });
          api.close();
          if (next) location.hash = next;
        } else {
          errorEl.textContent = r.error;
          errorEl.style.display = "";
          submit.disabled = false;
          submit.textContent = "登录";
        }
      },
    },
    errorEl,
    h("label", { class: "form__label" }, "用户名", u),
    h("label", { class: "form__label" }, "密码", p),
    submit
  );

  const api = openModal({
    title: "登录",
    subtitle: "继续即表示你同意我们的 用户协议 与 隐私政策。",
    body: form,
    footer: h(
      "a",
      { class: "btn btn--ghost", href: "#/login" },
      "打开完整登录页"
    ),
  });
  return api;
}
