/**
 * HTML Escaper
 *
 * Provides:
 *   - `RawHtml`  — a wrapper that marks content as trusted/pre-escaped
 *   - `escapeHtml` — escapes untrusted values before HTML insertion
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
/**
 * Escape an untrusted value for safe HTML insertion.
 */
export function escapeHtml(v) {
    if (typeof v === 'string') {
        if (!ESCAPE_TEST_RE.test(v))
            return v;
        return v.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
    }
    if (v == null || v === true || v === false)
        return '';
    if (typeof v === 'object') {
        if (v instanceof RawHtml)
            return v.value;
        if (Array.isArray(v)) {
            let s = '';
            for (let i = 0; i < v.length; i++)
                s += escapeHtml(v[i]);
            return s;
        }
    }
    if (typeof v === 'number')
        return '' + v;
    const s = String(v);
    return ESCAPE_TEST_RE.test(s) ? s.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]) : s;
}
//# sourceMappingURL=escape.js.map