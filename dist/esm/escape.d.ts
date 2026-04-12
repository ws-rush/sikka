/**
 * HTML Escaper
 *
 * Provides:
 *   - `RawHtml`  — a wrapper that marks content as trusted/pre-escaped
 *   - `escapeHtml` — escapes untrusted values before HTML insertion
 */
/** Wraps a string that should be inserted into HTML output verbatim (no escaping). */
export declare class RawHtml {
    readonly value: string;
    __isRawHtml: boolean;
    constructor(value: string);
}
/**
 * Escape an untrusted value for safe HTML insertion.
 */
export declare function escapeHtml(v: unknown): string;
//# sourceMappingURL=escape.d.ts.map