// Communities page — all communities with category filter + search.

import { h } from "../utils/dom.js";
import { api } from "../api.js";
import { formatCount } from "../utils/format.js";

export async function CommunitiesPage() {
  const subs = await api.listSubreddits();

  const search = h("input", {
    class: "form__input",
    type: "search",
    placeholder: "搜索社区…",
  });

  const root = h("div", { class: "communities-page" });
  root.appendChild(
    h(
      "div",
      { class: "communities-page__head" },
      h("h1", {}, "所有社区"),
      h("p", {}, `共 ${subs.length} 个社区`)
    )
  );
  root.appendChild(
    h("div", { class: "communities-page__search" }, search)
  );

  const grid = h("div", { class: "communities-grid" });
  for (const s of subs) {
    grid.appendChild(
      h(
        "a",
        { class: "com-card", href: `#/r/${s.name}` },
        h(
          "span",
          {
            class: "subicon subicon--md",
            style: { background: s.color || "#ff4500" },
            "aria-hidden": "true",
          },
          s.iconText || s.name[0].toUpperCase()
        ),
        h(
          "div",
          { class: "com-card__body" },
          h("h3", { class: "com-card__name" }, s.display),
          h("p", { class: "com-card__desc" }, s.description),
          h(
            "div",
            { class: "com-card__meta" },
            h("span", {}, `${formatCount(s.members)} 成员`),
            h("span", {}, `· ${s.category || "其他"}`)
          )
        )
      )
    );
  }
  root.appendChild(grid);

  // simple search filter
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    for (const c of grid.children) {
      const text = c.textContent.toLowerCase();
      c.style.display = !q || text.includes(q) ? "" : "none";
    }
  });

  return root;
}
