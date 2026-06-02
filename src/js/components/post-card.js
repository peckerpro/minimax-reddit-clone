// Post card — the atomic unit of every feed. Renders a post according to
// its kind (text / image / link) and decorates with vote / meta / actions.

import { h } from "../utils/dom.js";
import { truncate } from "../utils/format.js";
import { icon } from "../utils/icons.js";
import { VoteColumn } from "./vote-column.js";
import { PostMeta } from "./post-meta.js";
import { PostActions } from "./post-actions.js";

/**
 * @param {object} opts
 * @param {object} opts.post
 * @param {object} opts.subreddit
 * @param {"card"|"compact"} [opts.view]
 * @param {boolean} [opts.dense]
 */
export function PostCard({ post, subreddit, view = "card", dense = false }) {
  const card = h("article", {
    class: [
      "post",
      `post--${view}`,
      post.nsfw ? "post--nsfw" : "",
      post.spoiler ? "post--spoiler" : "",
      post.pinned ? "post--pinned" : "",
    ].filter(Boolean).join(" "),
    "data-post-id": post.id,
  });

  // Top row: vote column + meta header + actions
  const top = h("div", { class: "post__top" });
  top.appendChild(VoteColumn(post));

  const body = h("div", { class: "post__body" });

  // meta line
  const header = h("div", { class: "post__header" });
  header.appendChild(PostMeta({ subreddit, createdAt: post.createdAt }));
  if (post.flair) {
    header.appendChild(
      h("span", { class: "post__flair" }, post.flair)
    );
  }
  if (post.spoiler) {
    header.appendChild(h("span", { class: "post__chip post__chip--warn" }, "剧透"));
  }
  if (post.nsfw) {
    header.appendChild(h("span", { class: "post__chip post__chip--nsfw" }, "NSFW"));
  }
  body.appendChild(header);

  // title
  const title = h(
    "h2",
    { class: "post__title" },
    h(
      "a",
      {
        href: `#/r/${post.subreddit}/comments/${post.id}`,
        class: "post__title-link",
      },
      post.title
    )
  );
  body.appendChild(title);

  // body content
  if (view === "card") {
    if (post.kind === "image" && post.image) {
      body.appendChild(
        h(
          "a",
          {
            class: "post__media",
            href: `#/r/${post.subreddit}/comments/${post.id}`,
            "aria-label": post.title,
            tabindex: "-1",
          },
          h("img", {
            class: "post__img",
            src: post.image,
            alt: `${subreddit.display} — ${post.title}`,
            loading: "lazy",
            decoding: "async",
          })
        )
      );
    } else if (post.kind === "text" && post.body) {
      body.appendChild(
        h(
          "div",
          { class: "post__text" },
          truncate(post.body, view === "compact" ? 120 : 280)
        )
      );
    } else if (post.kind === "link" && post.image) {
      body.appendChild(
        h(
          "a",
          {
            class: "post__media post__media--thumb",
            href: post.url || "#",
            target: "_blank",
            rel: "noreferrer noopener",
          },
          h("img", {
            class: "post__thumb",
            src: post.image,
            alt: "",
            loading: "lazy",
          })
        )
      );
    } else if (post.kind === "link" && post.domain) {
      body.appendChild(
        h(
          "a",
          {
            class: "post__link",
            href: post.url || "#",
            target: "_blank",
            rel: "noreferrer noopener",
          },
          h("span", { html: icon("link", { size: 16 }) }),
          post.domain
        )
      );
    }
  } else if (view === "compact" && post.body) {
    body.appendChild(
      h("div", { class: "post__text" }, truncate(post.body, 120))
    );
  } else if (view === "compact" && post.domain) {
    body.appendChild(
      h("span", { class: "post__link" },
        h("span", { html: icon("link", { size: 14 }) }),
        post.domain
      )
    );
  }

  // actions
  body.appendChild(PostActions(post));

  top.appendChild(body);
  card.appendChild(top);
  return card;
}
