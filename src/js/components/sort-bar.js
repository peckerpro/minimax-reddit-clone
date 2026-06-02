// Sort bar — sits below the header. Two select buttons (sort + location)
// plus a view toggle on the right.

import { h } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { state } from "../state.js";

export const SORT_OPTIONS = [
  { value: "best",   label: "最佳" },
  { value: "hot",    label: "热门" },
  { value: "new",    label: "最新" },
  { value: "top",    label: "最热" },
  { value: "rising", label: "上升" },
];

export const LOCATION_OPTIONS = [
  { value: "global", label: "全球" },
  { value: "local",  label: "本地" },
];

function SelectButton({ label, value, options, onChange }) {
  const current = options.find((o) => o.value === value) || options[0];
  const btn = h(
    "button",
    {
      class: "sort-btn",
      type: "button",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
    },
    h("span", { class: "sort-btn__label" }, label),
    h("span", { class: "sort-btn__value" }, current.label),
    h("span", { class: "sort-btn__caret", html: icon("chevronDown", { size: 16 }) })
  );
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wrap = h("div", { class: "sort-list", role: "listbox" });
    for (const opt of options) {
      const item = h(
        "button",
        {
          class: ["sort-list__item", opt.value === value ? "is-active" : ""],
          type: "button",
          role: "option",
          "aria-selected": opt.value === value ? "true" : "false",
          onClick: () => {
            onChange(opt.value);
            document.body.click(); // close any open dropdown
          },
        },
        h("span", {}, opt.label),
        opt.value === value ? h("span", { class: "sort-list__check" }, "✓") : null
      );
      wrap.appendChild(item);
    }
    btn._panel = wrap;
    btn._panelOpen = true;
    btn.setAttribute("aria-expanded", "true");

    // position below
    const rect = btn.getBoundingClientRect();
    document.body.appendChild(wrap);
    wrap.style.position = "absolute";
    wrap.style.top = `${rect.bottom + 4}px`;
    wrap.style.left = `${rect.left}px`;
    wrap.style.minWidth = `${rect.width}px`;
    requestAnimationFrame(() => wrap.classList.add("sort-list--open"));

    const close = () => {
      wrap.classList.remove("sort-list--open");
      btn.setAttribute("aria-expanded", "false");
      btn._panelOpen = false;
      setTimeout(() => wrap.remove(), 150);
      document.removeEventListener("click", close, true);
      document.removeEventListener("keydown", onKey, true);
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") close();
    };
    document.addEventListener("click", close, true);
    document.addEventListener("keydown", onKey, true);
  });
  return btn;
}

function ViewToggle() {
  const wrap = h("div", { class: "view-toggle", role: "group", "aria-label": "视图" });
  const cardBtn = h(
    "button",
    {
      class: "view-toggle__btn",
      type: "button",
      "aria-label": "卡片视图",
      "aria-pressed": "true",
      onClick: () => setView("card"),
    },
    h("span", { html: icon("card", { size: 18 }) })
  );
  const compactBtn = h(
    "button",
    {
      class: "view-toggle__btn",
      type: "button",
      "aria-label": "紧凑视图",
      "aria-pressed": "false",
      onClick: () => setView("compact"),
    },
    h("span", { html: icon("compact", { size: 18 }) })
  );
  function setView(v) {
    state.setView(v);
    cardBtn.setAttribute("aria-pressed", v === "card" ? "true" : "false");
    compactBtn.setAttribute("aria-pressed", v === "compact" ? "true" : "false");
  }
  // initial
  const cur = state.get().view;
  cardBtn.setAttribute("aria-pressed", cur === "card" ? "true" : "false");
  compactBtn.setAttribute("aria-pressed", cur === "compact" ? "true" : "false");

  // re-render highlight on state change
  state.subscribe((s) => {
    cardBtn.setAttribute("aria-pressed", s.view === "card" ? "true" : "false");
    compactBtn.setAttribute("aria-pressed", s.view === "compact" ? "true" : "false");
  });

  wrap.append(cardBtn, compactBtn);
  return wrap;
}

/**
 * Build the sort bar.
 * @param {{ onChange?: () => void }} [handlers]
 */
export function SortBar({ onChange } = {}) {
  const sortBtn = SelectButton({
    label: "排序方式",
    value: state.get().sort,
    options: SORT_OPTIONS,
    onChange: (v) => {
      state.setSort(v);
      onChange?.();
    },
  });
  const locBtn = SelectButton({
    label: "",
    value: state.get().location,
    options: LOCATION_OPTIONS,
    onChange: (v) => {
      state.setLocation(v);
      onChange?.();
    },
  });
  // hide the "排序方式" prefix on the location button since the icon already says it
  const locLabel = locBtn.querySelector(".sort-btn__label");
  if (locLabel) locLabel.remove();
  // add a globe icon to the location button
  const locVal = locBtn.querySelector(".sort-btn__value");
  if (locVal) locVal.prepend(h("span", { class: "sort-btn__icon", html: icon("globe", { size: 16 }) }));

  const root = h(
    "div",
    { class: "sortbar", role: "toolbar" },
    h("div", { class: "sortbar__left" }, sortBtn, locBtn),
    h("div", { class: "sortbar__right" }, ViewToggle())
  );

  // re-render button labels when state changes externally
  state.subscribe((s) => {
    const sortLabel = SORT_OPTIONS.find((o) => o.value === s.sort)?.label || s.sort;
    const locLabelText = LOCATION_OPTIONS.find((o) => o.value === s.location)?.label || s.location;
    sortBtn.querySelector(".sort-btn__value").lastChild.textContent = sortLabel;
    locBtn.querySelector(".sort-btn__value").lastChild.textContent = locLabelText;
  });

  return root;
}
