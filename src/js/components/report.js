// Report dialog (real).

import { h } from "../utils/dom.js";
import { toast } from "./toast.js";
import { openModal } from "./modal.js";

const REASONS = [
  { value: "spam",          label: "垃圾广告" },
  { value: "harassment",    label: "骚扰或人身攻击" },
  { value: "hate",          label: "仇恨言论" },
  { value: "violence",      label: "暴力或血腥内容" },
  { value: "sexual",        label: "色情内容" },
  { value: "minor",         label: "涉及未成年人" },
  { value: "copyright",     label: "侵犯版权" },
  { value: "impersonation", label: "冒充他人" },
  { value: "dox",           label: "泄露隐私" },
  { value: "other",         label: "其他" },
];

export function ReportPage() {
  const reasonSel = h(
    "select",
    { class: "form__input" },
    h("option", { value: "" }, "选择举报原因（必填）"),
    ...REASONS.map((r) => h("option", { value: r.value }, r.label))
  );
  const detail = h("textarea", {
    class: "form__input form__input--area",
    rows: 4,
    placeholder: "补充说明（可选）",
  });

  const submit = h(
    "button",
    {
      class: "btn btn--primary",
      type: "button",
      onClick: () => {
        if (!reasonSel.value) return toast("请选择原因", { kind: "warn" });
        toast("举报已提交，Reddit 团队会尽快审核（mock）", { kind: "success" });
        location.hash = "#/";
      },
    },
    "提交举报"
  );

  return h(
    "div",
    { class: "form-wrap" },
    h(
      "div",
      { class: "form" },
      h("h1", { class: "form__title" }, "举报"),
      h("p", { class: "form__hint" }, "我们会审核每一个举报，并根据社区准则采取行动。"),
      h("label", { class: "form__label" }, "原因", reasonSel),
      h("label", { class: "form__label" }, "详情", detail),
      h("div", { class: "submit-page__bar" }, submit)
    )
  );
}

export function openReportModal({ context = "post" } = {}) {
  const reasonSel = h(
    "select",
    { class: "form__input" },
    h("option", { value: "" }, "选择举报原因（必填）"),
    ...REASONS.map((r) => h("option", { value: r.value }, r.label))
  );
  const detail = h("textarea", {
    class: "form__input form__input--area",
    rows: 3,
    placeholder: "补充说明（可选）",
  });

  const submit = h(
    "button",
    {
      class: "btn btn--primary",
      type: "button",
      onClick: () => {
        if (!reasonSel.value) return toast("请选择原因", { kind: "warn" });
        toast("举报已提交（mock）", { kind: "success" });
        api.close();
      },
    },
    "提交举报"
  );

  const api = openModal({
    title: "举报",
    subtitle: `举报这个${context === "comment" ? "评论" : "帖子"}`,
    body: h(
      "div",
      { class: "form" },
      h("label", { class: "form__label" }, "原因", reasonSel),
      h("label", { class: "form__label" }, "详情", detail)
    ),
    footer: submit,
  });
  return api;
}
