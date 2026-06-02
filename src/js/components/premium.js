// Premium page.

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { toast } from "./toast.js";

const PLANS = [
  {
    name: "免费",
    price: "¥0",
    per: "永久",
    perks: [
      "基础浏览与发帖",
      "标准广告",
      "加入任意公共社区",
    ],
    cta: "当前方案",
  },
  {
    name: "Premium 月度",
    price: "¥38",
    per: "/ 月",
    perks: [
      "无广告浏览",
      "每月 700 枚 Coins",
      "专属 r/Premium 徽章",
      "新功能抢先体验",
    ],
    cta: "升级到月度",
    primary: true,
  },
  {
    name: "Premium 年度",
    price: "¥328",
    per: "/ 年",
    perks: [
      "包含月度所有权益",
      "每月 1,500 枚 Coins",
      "专属客服",
      "节省约 28%",
    ],
    cta: "升级到年度",
  },
];

export function PremiumPage() {
  return h(
    "div",
    { class: "premium-page" },
    h(
      "div",
      { class: "premium-hero" },
      h("div", { class: "premium-hero__badge", html: icon("award", { size: 24 }) }),
      h("h1", {}, "Reddit Premium"),
      h("p", {}, "无广告、专属福利、抢先体验新功能。支持我们，让 Reddit 变得更好。")
    ),
    h(
      "div",
      { class: "premium-plans" },
      ...PLANS.map((p) =>
        h(
          "div",
          { class: ["premium-plan", p.primary ? "premium-plan--primary" : ""].join(" ") },
          h("h2", { class: "premium-plan__name" }, p.name),
          h(
            "div",
            { class: "premium-plan__price" },
            h("strong", {}, p.price),
            h("span", {}, p.per)
          ),
          h(
            "ul",
            { class: "premium-plan__perks" },
            ...p.perks.map((perk) =>
              h("li", {}, h("span", { html: icon("plus", { size: 12 }) }), perk)
            )
          ),
          h(
            "button",
            {
              class: ["btn", p.primary ? "btn--primary" : "btn--secondary", "btn--block"],
              type: "button",
              onClick: () => toast(`${p.cta}（mock，未真实扣款）`, { kind: "info" }),
            },
            p.cta
          )
        )
      )
    )
  );
}
