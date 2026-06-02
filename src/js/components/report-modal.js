// Report dialog modal — used by post 跟帖 dropdown and comment 跟帖 dropdown.

import { h } from "../utils/dom.js";
import { state } from "../state.js";
import { toast } from "./toast.js";
import { openModal } from "./modal.js";
import { api } from "../api.js";

export async function openReportModal({ target = "post" } = {}) {
  const reasons = await api.listReportReasons();
  const sel = h("select", { class: "form__input" },
    h("option", { value: "" }, "选择举报原因（必填）"),
    ...reasons.map((r) => h("option", { value: r.value }, r.name))
  );
  const detail = h("textarea", {
    class: "form__input form__input--area",
    rows: 4,
    placeholder: "补充说明（可选）",
  });
  const blockUser = h("input", { type: "checkbox", id: "report-block-user" });
  const blockSub = h("input", { type: "checkbox", id: "report-block-sub" });
  const hide = h("input", { type: "checkbox", id: "report-hide" });

  const submit = h("button", {
    class: "btn btn--primary",
    type: "button",
    onClick: () => {
      if (!sel.value) return toast("请选择原因", { kind: "warn" });
      if (blockUser.checked) state.toggleBlockUser(state.get().user?.name || "");
      toast("举报已提交（mock）", { kind: "success" });
      api.close();
    },
  }, "提交举报");

  const api = openModal({
    title: "举报",
    subtitle: `举报这个${target === "comment" ? "评论" : "帖子"}`,
    body: h("div", { class: "form" },
      h("label", { class: "form__label" }, "原因", sel),
      h("label", { class: "form__label" }, "详情", detail),
      h("div", { class: "report-modal__opts" },
        h("label", { class: "form__check", for: "report-block-user" }, blockUser, h("span", {}, "屏蔽此用户")),
        h("label", { class: "form__check", for: "report-block-sub" }, blockSub, h("span", {}, "屏蔽此社区")),
        h("label", { class: "form__check", for: "report-hide" }, hide, h("span", {}, "不再显示"))
      )
    ),
    footer: submit,
    size: "sm",
  });
  return api;
}
