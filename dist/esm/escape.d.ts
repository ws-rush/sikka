/**
 * HTML Escaper — Requirements 3.1, 3.2, 3.3, 3.4
 *
 * Provides:
 *   - `RawHtml`  — a wrapper that marks content as trusted/pre-escaped
 *   - `escapeHtml` — escapes untrusted values before HTML insertion
 *   - `html`     — tagged template literal that produces a `RawHtml` instance
 */
/** Wraps a string that should be inserted into HTML output verbatim (no escaping). */
export declare class RawHtml {
    readonly value: string;
    constructor(value: string);
}
/**
 * Escape an untrusted value for safe HTML insertion.
 *
 * - `null` / `undefined`  → `""`          (Requirement 3.4)
 * - `RawHtml` instance    → `.value` verbatim (Requirement 3.2)
 * - Array                 → recursively escape and join elements without commas
 * - number / boolean      → coerce to string, then escape (Requirement 3.3)
 * - string                → escape `& < > " '` (Requirement 3.1)
 */
export declare function escapeHtml(value: unknown): string;
/**
 * Tagged template literal that assembles a trusted HTML string.
 * Each interpolated value is passed through `escapeHtml` so that
 * dynamic parts are escaped while the static template strings are
 * treated as trusted markup.
 *
 * Returns a `RawHtml` instance so the result is never double-escaped
 * when used inside another `html` tag or passed to `escapeHtml`.
 *
 * Requirement 3.2
 */
export declare function html(strings: TemplateStringsArray, ...values: unknown[]): RawHtml;
//# sourceMappingURL=escape.d.ts.map