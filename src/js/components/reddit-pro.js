// Reddit Pro page (FSM: S_REDDIT_PRO).
//
// v2.1.0: replaces the v2.0.0 toast stub. Lightweight "coming soon" landing
// page describing what Reddit Pro would do for creators. Mirrors the look of
// the Premium page so it slots into the same visual language.

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { toast } from "./toast.js";

const FEATURES = [
  {
    icon: "shield",
    title: "创作者认证",
    blurb: "蓝色的 PRO 徽章，让你的帖子和评论一眼可辨。",
  },
  {
    icon: "text",
    title: "高级分析",
    blurb: "查看每条帖子的曝光、互动和粉丝增长曲线。",
  },
  {
    icon: "link",
    title: "自定义主页",
    blurb: "把 r/<your-sub> 钉在你自己的介绍页顶部。",
  },
  {
    icon: "award",
    title: "每月 Coins 赠送",
    blurb: "把 Coins 分发给最有价值的用户。",
  },
];

export function RedditProPage() {
  return h(
    "div",
    { class: "pro-page" },
    h(
      "header",
      { class: "pro-page__hero" },
      h(
        "span",
        { class: "pro-page__badge" },
        h("span", { html: icon("shield", { size: 14 }) }),
        "Reddit Pro"
      ),
      h("h1", { class: "pro-page__title" }, "把创作者当作一等公民"),
      h(
        "p",
        { class: "pro-page__sub" },
        "面向版主、内容创作者和社区运营者的付费计划。测试版限量开放。"
      ),
      h(
        "div",
        { class: "pro-page__cta" },
        h(
          "button",
          {
            class: "btn btn--primary",
            type: "button",
            onClick: () => toast("测试版已满员，加入候补名单（mock）", { kind: "info" }),
          },
          "加入候补名单"
        ),
        h(
          "a",
          { class: "btn btn--secondary", href: "#/premium" },
          "先看 Premium"
        )
      )
    ),
    h(
      "section",
      { class: "pro-page__features" },
      h("h2", { class: "pro-page__features-title" }, "Pro 提供什么"),
      h(
        "ul",
        { class: "pro-page__feature-list" },
        ...FEATURES.map((f) =>
          h(
            "li",
            { class: "pro-page__feature" },
            h("span", { class: "pro-page__feature-icon", html: icon(f.icon, { size: 20 }) }),
            h("h3", {}, f.title),
            h("p", {}, f.blurb)
          )
        )
      )
    ),
    h(
      "footer",
      { class: "pro-page__foot" },
      h("p", {}, "Reddit Pro 是测试版功能。功能与定价可能在 GA 前调整。")
    )
  );
}
