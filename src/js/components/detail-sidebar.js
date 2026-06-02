// Post detail right sidebar — 3 sections:
// 1. Signup CTA (logged out only)
// 2. Related posts (cross-posts from other subs)
// 3. About community card
// Mirrors real Reddit 2026 detail page.

import { h } from "../utils/dom.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { formatCount, formatScore, timeAgo } from "../utils/format.js";
import { icon } from "../utils/icons.js";

function SignupCTA() {
  return h(
    "section",
    { class: "rail-card detail-cta" },
    h("h2", { class: "rail-card__title" }, "Reddit 新用户？"),
    h("p", { class: "detail-cta__copy" }, "创建账户，畅游精彩的社区世界。"),
    h(
      "a",
      { class: "btn btn--primary btn--block", href: "#/register" },
      "通过电子邮件地址继续"
    ),
    h(
      "a",
      { class: "btn btn--secondary btn--block", href: "#/register" },
      "通过电话号码继续"
    ),
    h(
      "p",
      { class: "detail-cta__legal" },
      "继续操作即表示您同意我们的 ",
      h("a", { href: "#/help/user-agreement" }, "用户协议"),
      " 并确认您已了解我们的 ",
      h("a", { href: "#/help/privacy-policy" }, "隐私政策"),
      "。"
    )
  );
}

function RelatedPostCard(x) {
  return h(
    "a",
    { class: "detail-related", href: `#/r/${x.subreddit}/comments/${x.sourcePostId}` },
    h("h3", { class: "detail-related__title" }, x.title),
    h(
      "div",
      { class: "detail-related__meta" },
      h("span", {}, `r/${x.subreddit}`),
      h("span", { class: "detail-related__sep" }, "·"),
      h("span", {}, timeAgo(x.createdAt))
    ),
    h(
      "div",
      { class: "detail-related__score" },
      h("span", { html: icon("arrowUp", { size: 12 }) }),
      h("span", {}, formatCount(x.score)),
      h("span", { class: "detail-related__sep" }, "·"),
      h("span", {}, `${formatCount(x.comments)} 条评论`)
    )
  );
}

function RelatedPostsCard(items) {
  if (items.length === 0) return null;
  return h(
    "section",
    { class: "rail-card detail-relateds" },
    h("h2", { class: "rail-card__title" }, "相关内容"),
    h(
      "div",
      { class: "detail-relateds__list" },
      ...items.map((x) => RelatedPostCard(x))
    )
  );
}

function AboutCommunityCard(sub) {
  const joined = state.isJoined(sub.name);
  const joinBtn = h(
    "button",
    {
      class: ["btn", joined ? "btn--ghost" : "btn--primary", "btn--block"],
      type: "button",
      onClick: () => {
        if (!state.get().user) {
          location.hash = "#/login?next=" + encodeURIComponent(location.hash || "#/");
          return;
        }
        state.toggleJoin(sub.name);
      },
    },
    joined ? "✓ 已加入" : "加入"
  );
  state.subscribe(() => {
    const j = state.isJoined(sub.name);
    joinBtn.textContent = j ? "✓ 已加入" : "加入";
    joinBtn.classList.toggle("btn--primary", !j);
    joinBtn.classList.toggle("btn--ghost", j);
  });

  return h(
    "section",
    { class: "rail-card detail-about" },
    h(
      "div",
      { class: "detail-about__head" },
      h(
        "span",
        {
          class: "subicon subicon--lg",
          style: { background: sub.color || "#ff4500" },
        },
        sub.iconText || sub.name[0]?.toUpperCase() || "?"
      ),
      h(
        "div",
        { class: "detail-about__heading" },
        h("h2", { class: "detail-about__name" }, sub.display),
        h("p", { class: "detail-about__handle" }, `r/${sub.name}`)
      )
    ),
    h("p", { class: "detail-about__desc" }, sub.description),
    h(
      "div",
      { class: "detail-about__stats" },
      h("div", { class: "detail-about__stat" }, h("strong", {}, formatCount(sub.members || 0)), h("span", {}, "成员")),
      h("div", { class: "detail-about__stat" }, h("strong", {}, formatCount(sub.weeklyVisitors || 0)), h("span", {}, "在线"))
    ),
    joinBtn
  );
}

/**
 * @param {Object} opts
 * @param {Object} opts.post
 */
export async function DetailRightSidebar({ post }) {
  const u = state.get().user;
  const [sub, related] = await Promise.all([
    api.getSubreddit(post.subreddit),
    api.crossPosts(post.id, 3),
  ]);

  const root = h("div", { class: "detail-sidebar" });
  if (!u) root.appendChild(SignupCTA());
  if (related.length > 0) root.appendChild(RelatedPostsCard(related));
  if (sub) root.appendChild(AboutCommunityCard(sub));
  return root;
}
