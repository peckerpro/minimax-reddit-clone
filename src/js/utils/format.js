// Display formatters. Keep deterministic / locale-stable so the UI doesn't
// "wiggle" between server-render and client-render. English-only by design
// since Reddit's UI strings in our screenshots are simplified-Chinese.

const NUM_ABBREV = [
  { v: 1e9, s: "B" },
  { v: 1e6, s: "M" },
  { v: 1e3, s: "k" },
];

/**
 * Compact number formatter. 5042 → "5k", 7_272_447 → "7.2M".
 * @param {number} n
 */
export function formatScore(n) {
  if (n == null || Number.isNaN(n)) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs < 1000) return `${sign}${abs}`;
  for (const { v, s } of NUM_ABBREV) {
    if (abs >= v) {
      const out = abs / v;
      // 1 decimal unless >= 10
      const fixed = out >= 10 ? Math.round(out) : Math.round(out * 10) / 10;
      return `${sign}${fixed}${s}`;
    }
  }
  return `${sign}${abs}`;
}

/**
 * Full member-count formatter. 7,272,447 → "7,272,447".
 * @param {number} n
 */
export function formatCount(n) {
  if (n == null || Number.isNaN(n)) return "0";
  return n.toLocaleString("en-US");
}

/**
 * Relative time. Always Chinese, simple thresholds, no Intl.RelativeTimeFormat
 * (we want the same wording as the live Reddit reference).
 * @param {string|number|Date} ts
 */
export function timeAgo(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)} 周前`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} 个月前`;
  return `${Math.floor(diff / 31536000)} 年前`;
}

/**
 * Truncate a string to N chars, add ellipsis if clipped.
 * @param {string} s
 * @param {number} n
 */
export function truncate(s, n = 200) {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
