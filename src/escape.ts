/**
 * HTML Escaper
 *
 * Provides:
 *   - `RawHtml`  — a wrapper that marks content as trusted/pre-escaped
 *   - `escapeHtml` — escapes untrusted values before HTML insertion
 *   - `html`     — tagged template literal that produces a `RawHtml` instance
 */

/** Wraps a string that should be inserted into HTML output verbatim (no escaping). */
export class RawHtml {
  __isRawHtml = true;
  constructor(public readonly value: string) { }
}

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const ESCAPE_RE = /[&<>"']/g;
const ESCAPE_TEST_RE = /[&<>"']/;

/**
 * Escape an untrusted value for safe HTML insertion.
 *
 * - `null` / `undefined`  → `""`
 * - `RawHtml` instance    → `.value` verbatim
 * - Array                 → recursively escape and join elements without commas
 * - number / boolean      → coerce to string, then escape
 * - string                → escape `& < > " '`
 */
export function escapeHtml(v: any): string {
  if (typeof v === 'string') {
    if (v.length === 0) return '';
    if (!ESCAPE_TEST_RE.test(v)) return v;
    return v.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
  }
  if (v === null || v === undefined || v === true || v === false) return '';
  if (typeof v === 'object') {
    if (v.__isRawHtml) return v.value;
    if (Array.isArray(v)) {
      let s = '';
      for (let i = 0; i < v.length; i++) s += escapeHtml(v[i]);
      return s;
    }
  }
  if (typeof v === 'number') return '' + v;
  const s = String(v);
  return ESCAPE_TEST_RE.test(s) ? s.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]) : s;
}

/**
 * Tagged template literal that assembles a trusted HTML string.
 * Each interpolated value is passed through `escapeHtml` so that
 * dynamic parts are escaped while the static template strings are
 * treated as trusted markup.
 *
 * Returns a `RawHtml` instance so the result is never double-escaped
 * when used inside another `html` tag or passed to `escapeHtml`.
 *
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): RawHtml {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += escapeHtml(values[i]);
    }
  }
  return new RawHtml(result);
}
