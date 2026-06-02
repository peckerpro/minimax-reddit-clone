// Compose Message page (FSM: S_MESSAGE_COMPOSE).
//
// v2.1.0: replaces the v2.0.0 toast + back-to-home stub. Real composer UI
// with a "to" recipient, subject and body. The submit just toasts success.

import { h } from "../utils/dom.js";
import { state } from "../state.js";
import { toast } from "./toast.js";
import { api } from "../api.js";

export function ComposePage({ to = "" }) {
  const me = state.get().user;
  if (!me) {
    return h(
      "div",
      { class: "empty-state" },
      h("div", { class: "empty-state__icon", html: "🔒" }),
      h("h3", { class: "empty-state__title" }, "登录后才能发私信"),
      h(
        "a",
        {
          class: "btn btn--primary",
          href: "#/login?next=" + encodeURIComponent("#/message/compose?to=" + to),
        },
        "登录"
      )
    );
  }

  const root = h("div", { class: "compose-page" });
  const toIn = h("input", {
    class: "form__input",
    type: "text",
    placeholder: "收件人（u/<name>）",
    value: to,
  });
  const subjectIn = h("input", {
    class: "form__input",
    type: "text",
    placeholder: "主题",
  });
  const bodyIn = h("textarea", {
    class: "form__input form__input--textarea",
    rows: 8,
    placeholder: "说点什么…",
  });

  const sendBtn = h(
    "button",
    {
      class: "btn btn--primary",
      type: "button",
      onClick: async () => {
        const recipient = toIn.value.trim().replace(/^u\//, "").replace(/^u_/, "");
        const subject = subjectIn.value.trim();
        const body = bodyIn.value.trim();
        if (!recipient) return toast("请填写收件人", { kind: "warn" });
        if (!subject) return toast("请填写主题", { kind: "warn" });
        if (!body) return toast("请填写内容", { kind: "warn" });
        const u = await api.getUser(recipient).catch(() => null);
        if (!u) return toast(`未找到用户 u/${recipient}`, { kind: "error" });
        toast(`已发送给 u/${u.name}（mock）`, { kind: "success" });
        subjectIn.value = "";
        bodyIn.value = "";
      },
    },
    "发送"
  );

  root.appendChild(
    h(
      "header",
      { class: "compose-page__head" },
      h("h1", {}, "发私信"),
      h("p", { class: "compose-page__sub" }, `以 ${me.name} 的身份发送`)
    )
  );
  root.appendChild(
    h(
      "form",
      { class: "compose-page__form", onSubmit: (e) => e.preventDefault() },
      h("label", { class: "form__label" }, "收件人"),
      toIn,
      h("label", { class: "form__label" }, "主题"),
      subjectIn,
      h("label", { class: "form__label" }, "内容"),
      bodyIn,
      h(
        "div",
        { class: "compose-page__bar" },
        h("a", { class: "btn btn--ghost", href: "#/u/" + (to || me.name) }, "取消"),
        sendBtn
      )
    )
  );
  return root;
}
