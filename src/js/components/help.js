import { h } from "../utils/dom.js";

const TITLES = {
  "content-policy": "Reddit 规则",
  "privacy-policy": "隐私政策",
  "user-agreement": "用户协议",
  "accessibility": "辅助功能",
  "inc": "Reddit, Inc.",
};

export function HelpPage({ slug }) {
  return h(
    "div",
    { class: "help-page" },
    h("h1", {}, TITLES[slug] || slug),
    h(
      "p",
      {},
      "这是一个占位帮助页面，正式版本会展示 Reddit 官方文档 / 链接。slug = " + slug
    ),
    h("a", { class: "btn btn--secondary", href: "#/" }, "返回首页")
  );
}
