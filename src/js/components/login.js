// Placeholder. Filled in by v0.6.0.

import { h } from "../utils/dom.js";
import { auth } from "../auth.js";
import { state } from "../state.js";
import { toast } from "./toast.js";

export function LoginPage({ next }) {
  const u = h("input", { class: "form__input", type: "text", placeholder: "用户名", name: "username", required: true });
  const p = h("input", { class: "form__input", type: "password", placeholder: "密码", name: "password", required: true });
  const btn = h(
    "button",
    {
      class: "btn btn--primary btn--block",
      type: "submit",
    },
    "登录"
  );
  const form = h(
    "form",
    {
      class: "form",
      onSubmit: async (e) => {
        e.preventDefault();
        btn.disabled = true;
        btn.textContent = "登录中…";
        const r = await auth.login(u.value, p.value);
        btn.disabled = false;
        btn.textContent = "登录";
        if (r.ok) {
          state.login(r.user);
          toast(`欢迎回来，${r.user.name}`, { kind: "success" });
          location.hash = next || "#/";
        } else {
          toast(r.error, { kind: "error" });
        }
      },
    },
    h("h2", { class: "form__title" }, "登录以继续"),
    h("p", { class: "form__hint" }, "提示：任意非空用户名 + 密码均可登录。"),
    h("label", { class: "form__label" }, "用户名", u),
    h("label", { class: "form__label" }, "密码", p),
    btn
  );
  return h(
    "div",
    { class: "form-wrap" },
    form,
    h("p", { class: "form__alt" }, "v0.6.0 将加上「继续使用 Google / Apple」按钮。")
  );
}
