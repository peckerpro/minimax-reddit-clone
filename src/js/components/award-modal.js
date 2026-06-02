// Award sheet modal — opens from post's award button.
// Lists 8 mock awards in 3 categories (Silver / Gold / Platinum).
// Coin balance is shown. Submit spends coins (mock).

import { h, mount } from "../utils/dom.js";
import { state } from "../state.js";
import { toast } from "./toast.js";
import { openModal } from "./modal.js";
import { api } from "../api.js";

const CATEGORY_LABEL = {
  silver: "白银 (Silver)",
  gold: "黄金 (Gold)",
  platinum: "铂金 (Platinum)",
};

export async function openAwardModal({ post }) {
  const awards = await api.listAwards();
  const u = state.get().user;
  const balance = u ? state.get().coins : 0;
  const grouped = awards.reduce((acc, a) => {
    (acc[a.category] = acc[a.category] || []).push(a);
    return acc;
  }, {});

  let activeCat = "silver";
  let selectedAward = null;
  let quantity = 1;
  let anonymous = false;

  const tabBar = h("div", { class: "award-modal__tabs" });
  for (const cat of Object.keys(grouped)) {
    tabBar.appendChild(
      h(
        "button",
        {
          class: ["award-modal__tab", cat === activeCat ? "is-active" : ""],
          type: "button",
          "data-cat": cat,
          onClick: () => {
            activeCat = cat;
            for (const t of tabBar.children) t.classList.toggle("is-active", t.dataset.cat === cat);
            renderGrid();
          },
        },
        CATEGORY_LABEL[cat] || cat
      )
    );
  }

  const grid = h("div", { class: "award-modal__grid" });
  function renderGrid() {
    grid.replaceChildren();
    for (const a of grouped[activeCat] || []) {
      const card = h(
        "button",
        {
          class: ["award-modal__item", selectedAward?.id === a.id ? "is-selected" : ""],
          type: "button",
          "data-id": a.id,
          onClick: () => {
            selectedAward = a;
            for (const t of grid.children) t.classList.toggle("is-selected", t.dataset.id === a.id);
            summary.textContent = `${a.name} · ${a.price * quantity} Coins`;
          },
        },
        h("div", { class: "award-modal__item-icon" }, a.icon),
        h("div", { class: "award-modal__item-name" }, a.name),
        h("div", { class: "award-modal__item-price" }, `${a.price} Coins`)
      );
      grid.appendChild(card);
    }
  }
  renderGrid();

  const summary = h("div", { class: "award-modal__summary" }, "请选择一个奖励");

  const qtyInp = h("input", {
    class: "award-modal__qty",
    type: "number",
    min: "1",
    max: "100",
    value: "1",
    onInput: (e) => {
      quantity = Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1));
    },
  });

  const anonChk = h("input", {
    type: "checkbox",
    id: "award-anon",
    onChange: (e) => (anonymous = e.target.checked),
  });

  const body = h("div", { class: "award-modal__body" },
    h("div", { class: "award-modal__balance" },
      h("span", {}, "你的余额: "),
      h("strong", {}, `${balance} Coins`)
    ),
    tabBar,
    grid,
    h("div", { class: "award-modal__row" },
      h("label", { for: "award-qty" }, "数量"),
      qtyInp
    ),
    h("div", { class: "award-modal__row" },
      h("label", { for: "award-anon", class: "award-modal__check" },
        anonChk,
        h("span", {}, "匿名赠送")
      )
    ),
    summary
  );

  const submit = h("button", {
    class: "btn btn--primary",
    type: "button",
    onClick: () => {
      if (!u) {
        toast("登录后才能赠送奖励", { kind: "warn" });
        api.close();
        location.hash = "#/login?next=" + encodeURIComponent(location.hash || "#/");
        return;
      }
      if (!selectedAward) {
        toast("请选择一个奖励", { kind: "warn" });
        return;
      }
      const total = selectedAward.price * quantity;
      if (total > balance) {
        toast(`余额不足（需要 ${total} Coins）`, { kind: "error" });
        return;
      }
      if (state.spendCoins(total)) {
        toast(`已赠送 ${quantity}× ${selectedAward.name}${anonymous ? "（匿名）" : ""}`, { kind: "success" });
        api.close();
      }
    },
  }, "赠送");

  const api = openModal({
    title: "赠送奖励",
    subtitle: "给这个帖子或评论赠送奖励。",
    body,
    footer: h("div", { class: "award-modal__foot" },
      h("a", { class: "btn btn--ghost", href: "#/coins" }, "充值 Coins"),
      submit
    ),
    size: "md",
  });
  return api;
}
