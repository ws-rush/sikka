/**
 * Parser
 *
 * Parses Astro-like template source into a TemplateAST.
 *
 * Pipeline:
 *   1. Extract frontmatter between `---` fences
 *   2. Collect `import` statements from frontmatter
 *   3. Recursive-descent parse of the template body
 */
import type { ParseResult } from './types.js';
export declare const VOID_ELEMENTS: Set<string>;
/**
 * Parse an Astro-like template source string into a `TemplateAST`.
 *
 * Returns `{ ok: true, ast }` on success or `{ ok: false, error }` on failure.
 * All errors include a `line` and `column` pointing to the fault location.
 */
export declare function parse(source: string): ParseResult;
//# sourceMappingURL=parser.d.ts.map