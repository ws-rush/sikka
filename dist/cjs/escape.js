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
    value;
    __isRawHtml = true;
    constructor(value) {
        this.value = value;
    }
}
const ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};
const ESCAPE_RE = /[&<>"']/g;
const ESCAPE_TEST_RE = /[&<>"']/;
function escapeChar(ch) {
    switch (ch) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return ch;
    }
}
/**
 * Escape an untrusted value for safe HTML insertion.
 *
 * - `null` / `undefined`  → `""`
 * - `RawHtml` instance    → `.value` verbatim
 * - Array                 → recursively escape and join elements without commas
 * - number / boolean      → coerce to string, then escape
 * - string                → escape `& < > " '`
 */
export function escapeHtml(v) {
    const type = typeof v;
    if (type === 'string') {
        if (!ESCAPE_TEST_RE.test(v))
            return v;
        return v.replace(ESCAPE_RE, escapeChar);
    }
    if (v == null || v === true || v === false)
        return '';
    if (type === 'object') {
        if (v.__isRawHtml)
            return v.value;
        if (Array.isArray(v)) {
            let result = '';
            for (let i = 0; i < v.length; i++) {
                const item = v[i];
                if (item == null || item === true || item === false)
                    continue;
                if (typeof item === 'object' && item.__isRawHtml) {
                    result += item.value;
                }
                else {
                    result += escapeHtml(item);
                }
            }
            return result;
        }
    }
    if (type === 'number')
        return '' + v;
    const s = String(v);
    if (!ESCAPE_TEST_RE.test(s))
        return s;
    return s.replace(ESCAPE_RE, escapeChar);
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
export function html(strings, ...values) {
    let result = '';
    for (let i = 0; i < strings.length; i++) {
        result += strings[i];
        if (i < values.length) {
            result += escapeHtml(values[i]);
        }
    }
    return new RawHtml(result);
}
//# sourceMappingURL=escape.js.map