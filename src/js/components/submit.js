// Submit (create post) page — full UI with kind selector, validation.

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { toast } from "./toast.js";

const KINDS = [
  { value: "text",  label: "文本", iconName: "text" },
  { value: "link",  label: "链接", iconName: "link" },
  { value: "image", label: "图片", iconName: "image" },
];

export function SubmitPage() {
  const u = state.get().user;
  if (!u) {
    return h(
      "div",
      { class: "empty-state" },
      h("div", { class: "empty-state__icon", html: "🔒" }),
      h("h3", { class: "empty-state__title" }, "登录后才能发帖"),
      h(
        "a",
        { class: "btn btn--primary", href: "#/login?next=%23/submit" },
        "登录"
      )
    );
  }

  let kind = "text";
  const subSel = h(
    "select",
    { class: "form__input form__input--select" },
    h("option", { value: "" }, "选择社区（必填）")
  );
  const titleIn = h("input", {
    class: "form__input",
    type: "text",
    placeholder: "标题",
    maxlength: 300,
  });
  const bodyIn = h("textarea", {
    class: "form__input form__input--area",
    rows: 8,
    placeholder: "正文（文本帖子）",
  });
  const urlIn = h("input", {
    class: "form__input",
    type: "url",
    placeholder: "https://example.com",
  });
  const imgIn = h("input", {
    class: "form__input",
    type: "url",
    placeholder: "https://example.com/image.jpg",
  });

  const kindPicker = h("div", { class: "submit-kind" });
  for (const k of KINDS) {
    kindPicker.appendChild(
      h(
        "button",
        {
          class: ["submit-kind__btn", kind === k.value ? "is-active" : ""],
          type: "button",
          "data-kind": k.value,
          onClick: () => {
            kind = k.value;
            for (const b of kindPicker.children) {
              b.classList.toggle("is-active", b.dataset.kind === kind);
            }
            updateFields();
          },
        },
        h("span", { class: "submit-kind__icon", html: icon(k.iconName, { size: 18 }) }),
        h("span", {}, k.label)
      )
    );
  }

  const fieldText = h("div", { class: "submit-fields" }, bodyIn);
  const fieldLink = h("div", { class: "submit-fields", style: { display: "none" } }, urlIn);
  const fieldImage = h("div", { class: "submit-fields", style: { display: "none" } }, imgIn);

  function updateFields() {
    fieldText.style.display = kind === "text" ? "" : "none";
    fieldLink.style.display = kind === "link" ? "" : "none";
    fieldImage.style.display = kind === "image" ? "" : "none";
  }

  // populate subreddit select
  api.listSubreddits().then((subs) => {
    for (const s of subs) {
      subSel.appendChild(h("option", { value: s.name }, `${s.display} — ${s.members.toLocaleString()} 成员`));
    }
  });

  const submit = h(
    "button",
    {
      class: "btn btn--primary",
      type: "button",
      onClick: async () => {
        const sub = subSel.value;
        const title = titleIn.value.trim();
        if (!sub) return toast("请选择一个社区", { kind: "warn" });
        if (!title) return toast("请输入标题", { kind: "warn" });
        if (kind === "link" && !urlIn.value.trim()) return toast("请输入链接 URL", { kind: "warn" });
        if (kind === "image" && !imgIn.value.trim()) return toast("请输入图片 URL", { kind: "warn" });
        if (kind === "text" && !bodyIn.value.trim()) return toast("请输入正文", { kind: "warn" });
        try {
          const post = await api.submitPost({
            subreddit: sub,
            kind,
            title,
            body: bodyIn.value.trim(),
            url: kind === "link" ? urlIn.value.trim() : undefined,
            image: kind === "image" ? imgIn.value.trim() : undefined,
          });
          toast("帖子已发布", { kind: "success" });
          setTimeout(() => {
            location.hash = `#/r/${sub}/comments/${post.id}`;
          }, 400);
        } catch (err) {
          toast(`发布失败：${err?.message || err}`, { kind: "error" });
        }
      },
    },
    "发布"
  );

  const saveDraft = h(
    "button",
    {
      class: "btn btn--ghost",
      type: "button",
      onClick: async () => {
        const title = titleIn.value.trim();
        if (!title && !bodyIn.value.trim()) {
          return toast("标题和正文都为空，没法保存草稿", { kind: "warn" });
        }
        try {
          const d = await api.submitDraft({
            kind,
            title,
            body: bodyIn.value.trim(),
          });
          state.saveDraft({
            id: d.id,
            kind,
            subreddit: subSel.value,
            title,
            body: bodyIn.value.trim(),
            ts: Date.now(),
          });
          toast("草稿已保存到服务器", { kind: "success" });
        } catch (err) {
          toast(`保存草稿失败：${err?.message || err}`, { kind: "error" });
        }
      },
    },
    "保存草稿"
  );

  return h(
    "div",
    { class: "form-wrap form-wrap--wide" },
    h(
      "div",
      { class: "submit-page" },
      h("h1", { class: "submit-page__title" }, "创建帖子"),
      h("p", { class: "submit-page__hint" }, `以 ${u.name} 的身份发布到任何社区。`),
      h("div", { class: "submit-page__row" }, h("label", { class: "form__label" }, "社区", subSel)),
      h("div", { class: "submit-page__row" }, h("label", { class: "form__label" }, "标题", titleIn)),
      h("div", { class: "submit-page__row" }, h("label", { class: "form__label" }, "类型"), kindPicker),
      fieldText,
      fieldLink,
      fieldImage,
      h("div", { class: "submit-page__bar" }, saveDraft, submit)
    )
  );
}
