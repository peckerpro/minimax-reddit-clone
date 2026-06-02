// Subreddit chip + author chip + time. Shown above a post's title.

import { h } from "../utils/dom.js";
import { timeAgo } from "../utils/format.js";

/**
 * @param {{ subreddit: object, createdAt: string }} meta
 */
export function PostMeta(meta) {
  const sub = meta.subreddit;
  const wrap = h("div", { class: "post-meta" });
  wrap.appendChild(
    h(
      "a",
      {
        class: "post-meta__sub",
        href: `#/r/${sub.name}`,
        title: sub.description,
      },
      h(
        "span",
        {
          class: "subicon subicon--xs",
          style: { background: sub.color || "#ff4500" },
          "aria-hidden": "true",
        },
        sub.iconText || sub.name[0]?.toUpperCase() || "?"
      ),
      h("span", { class: "post-meta__sub-name" }, sub.display)
    )
  );
  wrap.appendChild(h("span", { class: "post-meta__sep" }, "•"));
  wrap.appendChild(
    h("span", { class: "post-meta__time" }, timeAgo(meta.createdAt))
  );
  return wrap;
}
