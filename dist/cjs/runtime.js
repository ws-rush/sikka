"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNTIME_ABI_VERSION = void 0;
exports.runtime = runtime;
const escape_js_1 = require("./escape.js");
/** The generated-runtime ABI version. */
exports.RUNTIME_ABI_VERSION = 2;
/**
 * Returns the stable helper set for a generated module. Generated `render` and
 * `stream` exports call this with their `this` receiver, so a host runtime can
 * supply rendering options without rebuilding the artifact.
 */
// fallow-ignore-next-line complexity
function runtime(receiver) {
    const options = receiver?.options ?? receiver;
    return {
        escape: options?.autoEscape === false ? escape_js_1.stringifyHtml : escape_js_1.escapeHtml,
        RawHtml: escape_js_1.RawHtml,
        components: options?.components ?? {},
        classList,
        styleObject,
        filter: options?.autoFilter ? (options.filterFunction ?? identity) : identity,
        aggregateAssets: options?.aggregateAssets === true,
    };
}
function identity(value) {
    return value;
}
// fallow-ignore-next-line complexity
function classList(value) {
    if (typeof value === 'string')
        return value;
    if (value instanceof Set || Array.isArray(value))
        return Array.from(value, classList).filter(Boolean).join(' ');
    if (!value || typeof value !== 'object')
        return '';
    return Object.entries(value)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .join(' ');
}
// fallow-ignore-next-line complexity
function styleObject(value) {
    if (typeof value === 'string')
        return value;
    if (!value || typeof value !== 'object')
        return '';
    if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString)
        return String(value.toString());
    return Object.entries(value)
        .filter(([, item]) => item != null && typeof item !== 'boolean' && item !== '')
        .map(([name, item]) => `${name.replace(/[A-Z]/g, toKebabCase)}:${item}`)
        .join(';');
}
function toKebabCase(match) {
    return '-' + match.toLowerCase();
}
//# sourceMappingURL=runtime.js.map