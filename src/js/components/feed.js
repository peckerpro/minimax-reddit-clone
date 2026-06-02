// Feed — list of post cards with loading / empty / load-more states.

import { h, mount } from "../utils/dom.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { PostCard } from "./post-card.js";

const PAGE_SIZE = 10;

function SkeletonCard() {
  return h(
    "div",
    { class: "post post--skeleton", "aria-hidden": "true" },
    h("div", { class: "post__skel-line skel skel--title" }),
    h("div", { class: "post__skel-line skel skel--meta" }),
    h("div", { class: "post__skel-block skel" }),
    h("div", { class: "post__skel-line skel skel--actions" })
  );
}

function EmptyState({ message, action }) {
  return h(
    "div",
    { class: "empty-state" },
    h("div", { class: "empty-state__icon", html: "🗒️" }),
    h("h3", { class: "empty-state__title" }, "这里空空如也"),
    h("p", { class: "empty-state__copy" }, message),
    action
  );
}

/**
 * @param {Object} [opts]
 * @param {string} [opts.subreddit]   filter to a single subreddit
 * @param {string} [opts.emptyMessage]
 * @param {string} [opts.emptyActionLabel]
 * @param {string} [opts.emptyActionHash]
 */
export async function Feed(opts = {}) {
  const root = h("div", { class: "feed" });
  const view = state.get().view;
  const sort = state.get().sort;

  // loading skeleton
  const skel = h("div", { class: "feed__skel" });
  for (let i = 0; i < 4; i++) skel.appendChild(SkeletonCard());
  mount(root, skel);

  let posts;
  try {
    posts = await api.listPosts({ subreddit: opts.subreddit, sort });
  } catch (err) {
    mount(
      root,
      EmptyState({
        message: "加载失败：" + (err?.message || "未知错误"),
        action: h(
          "button",
          {
            class: "btn btn--secondary",
            onClick: () => {
              mount(root, skel);
              api.listPosts({ subreddit: opts.subreddit, sort }).then((p) => render(p));
            },
          },
          "重试"
        ),
      })
    );
    return root;
  }

  render(posts);

  function render(posts) {
    // hide-filtered: respect state.hidden
    posts = posts.filter((p) => !state.isHidden(p.id));

    if (posts.length === 0) {
      mount(
        root,
        EmptyState({
          message: opts.emptyMessage || "没有可显示的帖子。试着切换排序方式。",
          action: opts.emptyActionHash
            ? h(
                "a",
                { class: "btn btn--secondary", href: opts.emptyActionHash },
                opts.emptyActionLabel || "返回首页"
              )
            : null,
        })
      );
      return;
    }

    const list = h("div", { class: ["feed__list", `feed__list--${view}`].join(" ") });
    let shown = 0;
    const slice = posts.slice(0, PAGE_SIZE);
    for (const p of slice) {
      // Hydrate subreddit inline (mock data is in-memory)
      const sub = {
        name: p.subreddit,
        display: `r/${p.subreddit}`,
        color: "#ff4500",
        iconText: p.subreddit[0].toUpperCase(),
        description: "",
      };
      list.appendChild(PostCard({ post: p, subreddit: sub, view }));
      shown++;
    }
    mount(root, list);

    if (posts.length > shown) {
      const more = h(
        "button",
        {
          class: "btn btn--ghost feed__more",
          type: "button",
          onClick: () => {
            const next = posts.slice(shown, shown + PAGE_SIZE);
            for (const p of next) {
              const sub = {
                name: p.subreddit,
                display: `r/${p.subreddit}`,
                color: "#ff4500",
                iconText: p.subreddit[0].toUpperCase(),
              };
              list.appendChild(PostCard({ post: p, subreddit: sub, view }));
              shown++;
            }
            if (shown >= posts.length) more.remove();
          },
        },
        `加载更多 (${posts.length - shown})`
      );
      root.appendChild(more);
    }
  }

  // re-render on view / sort change
  const unsubscribe = state.subscribe(async (s) => {
    if (s.view === view && s.sort === sort) return;
    const fresh = await api.listPosts({ subreddit: opts.subreddit, sort: s.sort });
    render(fresh);
  });

  // detach the subscription when the feed is removed from the DOM
  const obs = new MutationObserver(() => {
    if (!document.body.contains(root)) {
      unsubscribe();
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  return root;
}
