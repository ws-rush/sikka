"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNTIME_ABI_VERSION = void 0;
exports.bindRuntime = bindRuntime;
exports.runtime = runtime;
const escape_js_1 = require("./escape.js");
/** The generated-runtime ABI version. */
exports.RUNTIME_ABI_VERSION = 3;
const RUNTIME_HELPERS = Symbol('sikka.runtime-helpers');
/** Binds one stable helper set to a host receiver. */
function bindRuntime(receiver, helpers) {
    Object.defineProperty(receiver, RUNTIME_HELPERS, { value: helpers });
}
/**
 * Returns the stable helper set for a generated module. Generated `render` and
 * `stream` exports call this with their `this` receiver, so a host runtime can
 * supply rendering options without rebuilding the artifact.
 */
function runtime(receiver) {
    const cached = receiver && receiver[RUNTIME_HELPERS];
    if (cached)
        return cached;
    const options = receiver?.options ?? receiver;
    const escape = options?.autoEscape === false ? escape_js_1.stringifyHtml : escape_js_1.escapeHtml;
    const filter = options?.autoFilter ? (options.filterFunction ?? identity) : identity;
    return {
        escape,
        expression: options?.autoFilter ? (value) => escape(filter(value)) : escape,
        RawHtml: escape_js_1.RawHtml,
        components: options?.components ?? {},
        classList,
        styleObject,
        filter,
        autoFilter: options?.autoFilter === true,
        aggregateAssets: options?.aggregateAssets === true,
    };
}
function identity(value) {
    return value;
}
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