// Coins page (FSM: S_COINS).
//
// v2.1.0: standalone page (was reusing PremiumPage in v2.0.0 which had the
// wrong header copy). Shows the user's current coin balance + a buy
// Coins panel.

import { h } from "../utils/dom.js";
import { state } from "../state.js";
import { toast } from "./toast.js";
import { icon } from "../utils/icons.js";
import { formatCount } from "../utils/format.js";

const PACKS = [
  { coins: 500,  price: "¥8",   bonus: 0 },
  { coins: 1500, price: "¥22",  bonus: 100 },
  { coins: 5000, price: "¥68",  bonus: 500 },
  { coins: 12000, price: "¥148", bonus: 1500 },
];

export function CoinsPage() {
  const me = state.get().user;
  const root = h("div", { class: "coins-page" });
  root.appendChild(
    h(
      "header",
      { class: "coins-page__head" },
      h("h1", { class: "coins-page__title" }, "Coins"),
      h(
        "p",
        { class: "coins-page__sub" },
        me
          ? `当前余额：${formatCount(state.get().coins)} 枚`
          : "登录后即可充值与赠送 Coins"
      )
    )
  );

  if (!me) {
    root.appendChild(
      h(
        "div",
        { class: "empty-state" },
        h("div", { class: "empty-state__icon", html: "🪙" }),
        h("h3", { class: "empty-state__title" }, "登录后才能管理 Coins"),
        h("a", { class: "btn btn--primary", href: "#/login?next=%23/coins" }, "登录")
      )
    );
    return root;
  }

  const grid = h(
    "div",
    { class: "coins-page__grid" },
    ...PACKS.map((p) =>
      h(
        "div",
        { class: "coins-pack" },
        h("span", { class: "coins-pack__icon", html: icon("award", { size: 24 }) }),
        h("h2", { class: "coins-pack__amount" }, formatCount(p.coins)),
        h("p", { class: "coins-pack__sub" }, p.bonus ? `+ ${formatCount(p.bonus)} 赠送` : "无赠送"),
        h("p", { class: "coins-pack__price" }, p.price),
        h(
          "button",
          {
            class: "btn btn--primary",
            type: "button",
            onClick: () => toast(`已下单 ${p.coins} 枚（mock）`, { kind: "success" }),
          },
          "购买"
        )
      )
    )
  );
  root.appendChild(grid);
  return root;
}
