/**
 * HTML Escaper
 *
 * Provides:
 *   - `RawHtml`  — a wrapper that marks content as trusted/pre-escaped
 *   - `escapeHtml` — escapes untrusted values before HTML insertion
 */
/** Wraps a string that should be inserted into HTML output verbatim (no escaping). */
declare const RAW_HTML: unique symbol;
export declare class RawHtml {
    readonly value: string;
    [RAW_HTML]: boolean;
    constructor(value: string);
}
/**
 * Escape an untrusted value for safe HTML insertion.
 */
export declare function escapeHtml(value: unknown): string;
/** Coerce an Expression value without HTML escaping. */
export declare function stringifyHtml(value: unknown): string;
export {};
