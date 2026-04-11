/**
 * Parser — Requirements 1.1–1.7
 *
 * Parses Astro-like template source into a TemplateAST.
 *
 * Pipeline:
 *   1. Extract frontmatter between `---` fences
 *   2. Collect `import` statements from frontmatter
 *   3. Recursive-descent parse of the template body
 */
import type { ParseResult } from './types.js';
/**
 * Parse an Astro-like template source string into a `TemplateAST`.
 *
 * Returns `{ ok: true, ast }` on success or `{ ok: false, error }` on failure.
 * All errors include a `line` and `column` pointing to the fault location.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */
export declare function parse(source: string): ParseResult;
//# sourceMappingURL=parser.d.ts.map