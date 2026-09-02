"use strict";
/**
 * HTML Escaper
 *
 * Provides:
 *   - `RawHtml`  — a wrapper that marks content as trusted/pre-escaped
 *   - `escapeHtml` — escapes untrusted values before HTML insertion
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RawHtml = void 0;
exports.escapeHtml = escapeHtml;
exports.stringifyHtml = stringifyHtml;
/** Wraps a string that should be inserted into HTML output verbatim (no escaping). */
const RAW_HTML = Symbol.for('sikka.raw-html');
class RawHtml {
    value;
    [RAW_HTML] = true;
    constructor(value) {
        this.value = value;
    }
}
exports.RawHtml = RawHtml;
const ESCAPE_TEST_RE = /[&<>"']/;
/**
 * Escape an untrusted value for safe HTML insertion.
 */
function escapeHtml(value) {
    if (typeof value === 'string')
        return escapeString(value);
    if (isRawHtml(value))
        return value.value;
    if (Array.isArray(value))
        return escapeArray(value);
    return escapeString(stringifyHtml(value));
}
/** Coerce an Expression value without HTML escaping. */
function stringifyHtml(value) {
    return Array.isArray(value) ? stringifyArray(value) : stringifyValue(value);
}
function stringifyValue(value) {
    if (value == null || typeof value === 'boolean')
        return '';
    if (isRawHtml(value))
        return value.value;
    return String(value);
}
function isRawHtml(value) {
    return value instanceof RawHtml || isBrandedRawHtml(value);
}
function isBrandedRawHtml(value) {
    if (Object(value) !== value)
        return false;
    const raw = value;
    return raw[RAW_HTML] === true && typeof raw.value === 'string';
}
function escapeString(value) {
    const match = ESCAPE_TEST_RE.exec(value);
    return match ? replaceEscapedCharacters(value, match.index) : value;
}
function replaceEscapedCharacters(value, start) {
    let output = '';
    let lastIndex = 0;
    for (let index = start; index < value.length; index++) {
        let escaped;
        switch (value.charCodeAt(index)) {
            case 34:
                escaped = '&quot;';
                break;
            case 38:
                escaped = '&amp;';
                break;
            case 39:
                escaped = '&#39;';
                break;
            case 60:
                escaped = '&lt;';
                break;
            case 62:
                escaped = '&gt;';
                break;
            default:
                continue;
        }
        output += value.slice(lastIndex, index) + escaped;
        lastIndex = index + 1;
    }
    return output + value.slice(lastIndex);
}
function escapeArray(values) {
    let output = '';
    for (let index = 0; index < values.length; index++) {
        const value = values[index];
        output += value instanceof RawHtml ? value.value : escapeHtml(value);
    }
    return output;
}
function stringifyArray(values) {
    let output = '';
    for (let index = 0; index < values.length; index++)
        output += stringifyHtml(values[index]);
    return output;
}
//# sourceMappingURL=escape.js.map