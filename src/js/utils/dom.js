// Tiny DOM helper. Returns an HTMLElement. No virtual DOM, no diffing — just
// a thin wrapper around document.createElement that supports nested children
// and event listeners inline. Keeps component code readable.

/**
 * @param {string} tag
 * @param {Object} [props]
 * @param  {...(Node|string|number|false|null|undefined|Array)} children
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);

  for (const [key, raw] of Object.entries(props || {})) {
    if (raw == null || raw === false) continue;
    if (key === "class" || key === "className") {
      el.className = Array.isArray(raw) ? raw.filter(Boolean).join(" ") : String(raw);
    } else if (key === "style" && typeof raw === "object") {
      Object.assign(el.style, raw);
    } else if (key === "dataset" && typeof raw === "object") {
      for (const [dk, dv] of Object.entries(raw)) el.dataset[dk] = String(dv);
    } else if (key === "ref" && typeof raw === "function") {
      raw(el);
    } else if (key.startsWith("on") && typeof raw === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), raw);
    } else if (key === "html") {
      el.innerHTML = String(raw);
    } else if (key in el && key !== "list") {
      try {
        el[key] = raw;
      } catch {
        el.setAttribute(key, String(raw));
      }
    } else {
      el.setAttribute(key, String(raw));
    }
  }

  appendChildren(el, children);
  return el;
}

function appendChildren(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
}

/**
 * Replace the contents of `parent` with `node`. Convenience wrapper.
 * @param {Element} parent
 * @param {Node} node
 */
export function mount(parent, node) {
  parent.replaceChildren(node);
  return node;
}

/**
 * Build a DocumentFragment from a list of children.
 * @param  {...Node} nodes
 */
export function frag(...nodes) {
  const f = document.createDocumentFragment();
  for (const n of nodes) if (n) f.appendChild(n);
  return f;
}

/**
 * Query helper. Throws if not found in dev.
 */
export function $(sel, root = document) {
  const el = root.querySelector(sel);
  if (!el) console.warn(`[dom] $: no match for ${sel}`);
  return el;
}

export function $$(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

/**
 * Trap focus inside a container (used by modals).
 * @param {HTMLElement} container
 */
export function trapFocus(container) {
  const focusable = container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return () => {};
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  function onKey(e) {
    if (e.key !== "Tab") return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  container.addEventListener("keydown", onKey);
  return () => container.removeEventListener("keydown", onKey);
}

/**
 * Returns a one-shot subscriber pattern: each call returns an unsubscribe.
 * @template T
 * @param {T} initial
 */
export function signal(initial) {
  let value = initial;
  const subs = new Set();
  return {
    get: () => value,
    set: (next) => {
      const prev = value;
      value = typeof next === "function" ? next(prev) : next;
      for (const s of subs) s(value, prev);
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
