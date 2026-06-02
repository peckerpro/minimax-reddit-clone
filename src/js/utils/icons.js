// Inline SVG icon strings. Stored as functions so callers can pass size/stroke.
// All icons inherit `currentColor` so CSS controls the color.

const ICONS = {
  menu: `<path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  search: `<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="m21 21-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  chevronDown: `<path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  chevronUp: `<path d="m18 15-6-6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  arrowUp: `<path d="M12 4v14M5 11l7-7 7 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  arrowDown: `<path d="M12 20V6M5 13l7 7 7-7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  comment: `<path d="M21 12a8 8 0 0 1-11.4 7.3L4 21l1.7-5.6A8 8 0 1 1 21 12Z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>`,
  share: `<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  award: `<path d="M12 2 9 7l-6 1 4.5 4.5L6 19l6-3 6 3-1.5-6.5L21 8l-6-1-3-5Z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>`,
  more: `<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>`,
  card: `<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3 10h18" stroke="currentColor" stroke-width="1.5"/>`,
  compact: `<path d="M3 5h18M3 9h18M3 13h18M3 17h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  user: `<circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,
  globe: `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" stroke="currentColor" stroke-width="1.5" fill="none"/>`,
  close: `<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  plus: `<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  link: `<path d="M9 15a4 4 0 0 1 0-6l3-3a4 4 0 0 1 6 6l-1 1M15 9a4 4 0 0 1 0 6l-3 3a4 4 0 0 1-6-6l1-1" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  image: `<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="9" cy="10" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="m21 16-5-5-9 9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>`,
  text: `<path d="M5 4h14M5 8h14M5 12h10M5 16h7M5 20h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  bell: `<path d="M6 8a6 6 0 1 1 12 0c0 5 2 7 2 7H4s2-2 2-7Z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M10 21a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,
  settings: `<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4.8a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.5a7 7 0 0 0-2 1.2l-2.4-.8-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-.8c.6.5 1.3.9 2 1.2L10 21h4l.5-2.5c.7-.3 1.4-.7 2-1.2l2.4.8 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>`,
  help: `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,
  logout: `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  pin: `<path d="M12 17v5M9 10V4h6v6l3 3v2H6v-2l3-3Z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>`,
};

/**
 * @param {keyof typeof ICONS} name
 * @param {Object} [opts]
 * @param {number} [opts.size]
 * @param {string} [opts.className]
 * @returns {string} HTML string for an <svg>
 */
export function icon(name, opts = {}) {
  const path = ICONS[name];
  if (!path) {
    console.warn(`[icons] unknown icon: ${name}`);
    return "";
  }
  const size = opts.size ?? 20;
  const cls = opts.className ? ` class="${opts.className}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"${cls} aria-hidden="true" focusable="false">${path}</svg>`;
}

export const ICON_NAMES = Object.keys(ICONS);
