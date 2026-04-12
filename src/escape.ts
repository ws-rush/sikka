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
export function escapeHtml(value: unknown): string {
  if (typeof value === 'string') {
    if (value.length === 0) return '';
    if (!ESCAPE_TEST_RE.test(value)) return value;
    return value.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
  }
  if (value == null || value === true || value === false) return '';
  if (typeof value === 'object') {
    if ((value as { __isRawHtml?: boolean }).__isRawHtml) {
      return (value as { value: string }).value;
    }
    if (Array.isArray(value)) {
      let result = '';
      for (let i = 0; i < value.length; i++) {
        const v = value[i];
        if (v != null && v !== false && v !== true) {
          result += escapeHtml(v);
        }
      }
      return result;
    }
  }
  const s = String(value);
  if (s.length === 0) return '';
  if (!ESCAPE_TEST_RE.test(s)) return s;
  return s.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
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
