// Post detail page. Composes the post card (full view) + comment tree +
// right sidebar (signup CTA / related posts / about community).

import { h, mount } from "../utils/dom.js";
import { api } from "../api.js";
import { icon } from "../utils/icons.js";
import { VoteColumn } from "./vote-column.js";
import { PostMeta } from "./post-meta.js";
import { PostActions } from "./post-actions.js";
import { Comment } from "./comment.js";
import { state } from "../state.js";
import { formatCount, timeAgo } from "../utils/format.js";
import { DetailRightSidebar } from "./detail-sidebar.js";

const COMMENT_SORTS = [
  { value: "best",           label: "最佳" },
  { value: "top",            label: "最热" },
  { value: "new",            label: "最新" },
  { value: "controversial",  label: "争议" },
];

function buildTree(flatComments) {
  // group by parentId
  const byParent = new Map();
  for (const c of flatComments) {
    if (!byParent.has(c.parentId)) byParent.set(c.parentId, []);
    byParent.get(c.parentId).push(c);
  }
  // sort by score desc (best/top); applied per sort elsewhere
  for (const arr of byParent.values()) {
    arr.sort((a, b) => b.score - a.score);
  }
  return byParent;
}

function renderTree(byParent, sort, authorsByName) {
  const roots = byParent.get(null) || [];
  function build(c) {
    const kids = byParent.get(c.id) || [];
    const builtKids = kids.map(build);
    return Comment(c, builtKids, { authorsByName });
  }
  return roots.map(build);
}

/**
 * @param {{ postId: string }} params
 */
export async function PostDetail({ postId }) {
  const root = h("div", { class: "post-detail" });
  mount(root, h("p", { class: "rail-loading" }, "正在加载帖子…"));

  const post = await api.getPost(postId);
  if (!post) {
    mount(
      root,
      h(
        "div",
        { class: "empty-state" },
        h("div", { class: "empty-state__icon", html: "🕳️" }),
        h("h3", { class: "empty-state__title" }, "未找到此帖子"),
        h("p", { class: "empty-state__copy" }, `id = ${postId} 的帖子不存在，或已被删除。`),
        h("a", { class: "btn btn--secondary", href: "#/" }, "返回首页")
      )
    );
    return root;
  }

  const sub = await api.getSubreddit(post.subreddit);
  const flatComments = await api.listComments(postId);
  const author = await api.getUser(post.author);
  const authorsByName = new Map([[(author?.name || post.author).toLowerCase(), author]]);
  for (const c of flatComments) {
    const a = await api.getUser(c.author);
    if (a) authorsByName.set(a.name.toLowerCase(), a);
  }

  // ── the post (full-width) ─────────────────────────────
  const postEl = h("article", { class: "post post--detail" });
  const top = h("div", { class: "post__top" });
  top.appendChild(VoteColumn(post));

  const body = h("div", { class: "post__body" });

  // meta
  const header = h("div", { class: "post__header" });
  header.appendChild(PostMeta({ subreddit: sub, createdAt: post.createdAt }));
  if (post.flair) header.appendChild(h("span", { class: "post__flair" }, post.flair));
  body.appendChild(header);

  // title (h1 on detail pages)
  body.appendChild(h("h1", { class: "post__title post__title--detail" }, post.title));

  // body
  if (post.kind === "image" && post.image) {
    body.appendChild(
      h(
        "a",
        { class: "post__media", href: post.image, target: "_blank", rel: "noreferrer" },
        h("img", {
          class: "post__img",
          src: post.image,
          alt: `${sub.display} — ${post.title}`,
          loading: "lazy",
        })
      )
    );
  }
  if (post.kind === "text" && post.body) {
    body.appendChild(h("div", { class: "post__text post__text--full" }, post.body));
  }
  if (post.kind === "link" && post.url) {
    body.appendChild(
      h(
        "a",
        {
          class: "post__link post__link--full",
          href: post.url,
          target: "_blank",
          rel: "noreferrer noopener",
        },
        h("span", { html: icon("link", { size: 16 }) }),
        post.domain || post.url
      )
    );
  }

  // post actions
  body.appendChild(PostActions(post));

  // posted-by line
  body.appendChild(
    h(
      "div",
      { class: "post__postedby" },
      h("span", {}, "由 "),
      h(
        "a",
        { href: `#/u/${(author?.name || post.author).replace(/^u\//, "")}` },
        author?.name || post.author
      ),
      h("span", {}, ` 发布于 ${timeAgo(post.createdAt)}`)
    )
  );

  top.appendChild(body);
  postEl.appendChild(top);
  root.appendChild(postEl);

  // ── comments section ──────────────────────────────────
  const cmtHeader = h("div", { class: "comments__head" });
  cmtHeader.appendChild(
    h("h2", { class: "comments__title" }, `${formatCount(flatComments.length || 0)} 条评论`)
  );
  const cmtSort = h(
    "div",
    { class: "comments__sort" },
    h("span", { class: "comments__sort-label" }, "排序方式"),
    h("span", { class: "comments__sort-value" }, "最佳")
  );
  // build a simple select
  const sortBtn = h(
    "button",
    {
      class: "sort-btn",
      type: "button",
      onClick: (e) => {
        e.stopPropagation();
        const list = h("div", { class: "sort-list", role: "listbox" });
        for (const opt of COMMENT_SORTS) {
          list.appendChild(
            h(
              "button",
              {
                class: ["sort-list__item", opt.value === state.get().commentSort ? "is-active" : ""],
                role: "option",
                onClick: () => {
                  state.setCommentSort(opt.value);
                  cmtSort.querySelector(".comments__sort-value").textContent = opt.label;
                  list.remove();
                  rerenderComments();
                },
              },
              h("span", {}, opt.label),
              opt.value === state.get().commentSort ? h("span", { class: "sort-list__check" }, "✓") : null
            )
          );
        }
        const rect = sortBtn.getBoundingClientRect();
        document.body.appendChild(list);
        list.style.position = "absolute";
        list.style.top = `${rect.bottom + 4}px`;
        list.style.left = `${rect.left}px`;
        list.style.minWidth = `${rect.width}px`;
        requestAnimationFrame(() => list.classList.add("sort-list--open"));
        const close = () => {
          list.classList.remove("sort-list--open");
          setTimeout(() => list.remove(), 150);
          document.removeEventListener("click", close, true);
        };
        document.addEventListener("click", close, true);
      },
    },
    h("span", { class: "sort-btn__label" }, "排序方式"),
    h("span", { class: "sort-btn__value" }, "最佳"),
    h("span", { class: "sort-btn__caret", html: icon("chevronDown", { size: 16 }) })
  );
  cmtSort.replaceChildren(sortBtn);

  cmtHeader.appendChild(cmtSort);
  root.appendChild(cmtHeader);

  // sort selector mirror
  state.subscribe((s) => {
    const cur = COMMENT_SORTS.find((o) => o.value === s.commentSort) || COMMENT_SORTS[0];
    sortBtn.querySelector(".sort-btn__value").textContent = cur.label;
    rerenderComments();
  });

  const cmtList = h("div", { class: "comments__list" });
  root.appendChild(cmtList);

  function rerenderComments() {
    const sort = state.get().commentSort;
    const byParent = buildTree(flatComments);
    if (sort === "new") {
      for (const arr of byParent.values()) arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === "controversial") {
      for (const arr of byParent.values()) arr.sort((a, b) => (b.score + b.replies || 0) - (a.score + a.replies || 0));
    } else if (sort === "top") {
      for (const arr of byParent.values()) arr.sort((a, b) => b.score - a.score);
    } else {
      for (const arr of byParent.values()) arr.sort((a, b) => b.score - a.score);
    }
    const tree = renderTree(byParent, sort, authorsByName);
    cmtList.replaceChildren(...tree);
    if (flatComments.length === 0) {
      cmtList.appendChild(
        h(
          "div",
          { class: "empty-state" },
          h("div", { class: "empty-state__icon", html: "💬" }),
          h("h3", { class: "empty-state__title" }, "暂无评论"),
          h("p", { class: "empty-state__copy" }, "成为第一个发言的人。")
        )
      );
    }
  }
  rerenderComments();

  // ── reply composer ────────────────────────────────────
  const composer = h("div", { class: "comments__composer" });
  const u = state.get().user;
  if (u) {
    const ta = h("textarea", {
      class: "comments__composer-input",
      rows: 4,
      placeholder: `以 ${u.name} 的身份发表评论…`,
    });
    const submit = h(
      "button",
      {
        class: "btn btn--primary",
        type: "button",
        onClick: () => {
          const t = ta.value.trim();
          if (!t) {
            toast("请输入评论内容", { kind: "warn" });
            return;
          }
          toast("评论已发布（mock）", { kind: "success" });
          ta.value = "";
        },
      },
      "评论"
    );
    composer.append(ta, h("div", { class: "comments__composer-bar" }, submit));
  } else {
    composer.appendChild(
      h(
        "div",
        { class: "comments__composer-cta" },
        h("span", {}, "登录后即可发表评论"),
        h(
          "a",
          { class: "btn btn--primary", href: "#/login?next=" + encodeURIComponent(location.hash || "#/") },
          "登录"
        )
      )
    );
  }
  root.appendChild(composer);

  return root;
}

/**
 * Wrapper that returns both the post-detail body AND the right sidebar,
 * to be rendered by the router in a two-column layout.
 */
export async function PostDetailPage({ postId }) {
  const post = await api.getPost(postId);
  if (!post) {
    return {
      main: h(
        "div",
        { class: "empty-state" },
        h("div", { class: "empty-state__icon", html: "🕳️" }),
        h("h3", { class: "empty-state__title" }, "未找到此帖子"),
        h("p", { class: "empty-state__copy" }, `id = ${postId} 的帖子不存在，或已被删除。`),
        h("a", { class: "btn btn--secondary", href: "#/" }, "返回首页")
      ),
      aside: null,
    };
  }
  return {
    main: await PostDetail({ postId }),
    aside: await DetailRightSidebar({ post }),
  };
}
