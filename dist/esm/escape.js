/**
 * HTML Escaper
 *
 * Provides:
 *   - `RawHtml`  — a wrapper that marks content as trusted/pre-escaped
 *   - `escapeHtml` — escapes untrusted values before HTML insertion
 */
/** Wraps a string that should be inserted into HTML output verbatim (no escaping). */
const RAW_HTML = Symbol.for('sikka.raw-html');
export class RawHtml {
    value;
    [RAW_HTML] = true;
    constructor(value) {
        this.value = value;
    }
}
const ESCAPE_TEST_RE = /[&<>"']/;
/**
 * Escape an untrusted value for safe HTML insertion.
 */
export function escapeHtml(value) {
    if (typeof value === 'string')
        return escapeString(value);
    if (isRawHtml(value))
        return value.value;
    if (Array.isArray(value))
        return escapeArray(value);
    return escapeString(stringifyHtml(value));
}
/** Coerce an Expression value without HTML escaping. */
export function stringifyHtml(value) {
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
    return (value instanceof RawHtml ||
        (!!value &&
            typeof value === 'object' &&
            value[RAW_HTML] === true &&
            typeof value.value === 'string'));
}
function escapeString(value) {
    const match = ESCAPE_TEST_RE.exec(value);
    return match ? replaceEscapedCharacters(value, match.index) : value;
}
function replaceEscapedCharacters(value, start) {
    let output = '';
    let lastIndex = 0;
    for (let index = start; index < value.length; index++) {
        const escaped = escapeCharacterCode(value.charCodeAt(index));
        if (escaped === undefined)
            continue;
        output += value.slice(lastIndex, index) + escaped;
        lastIndex = index + 1;
    }
    return output + value.slice(lastIndex);
}
function escapeCharacterCode(code) {
    return code < 40 ? escapeLowCharacterCode(code) : escapeHighCharacterCode(code);
}
function escapeLowCharacterCode(code) {
    switch (code) {
        case 34:
            return '&quot;';
        case 38:
            return '&amp;';
        case 39:
            return '&#39;';
    }
}
function escapeHighCharacterCode(code) {
    switch (code) {
        case 60:
            return '&lt;';
        case 62:
            return '&gt;';
    }
}
function escapeArray(values) {
    let output = '';
    for (let index = 0; index < values.length; index++)
        output += escapeHtml(values[index]);
    return output;
}
function stringifyArray(values) {
    let output = '';
    for (let index = 0; index < values.length; index++)
        output += stringifyHtml(values[index]);
    return output;
}
//# sourceMappingURL=escape.js.map