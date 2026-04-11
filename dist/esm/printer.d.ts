/**
 * Pretty Printer
 *
 * Serializes a `TemplateAST` back into a syntactically correct template string.
 * The output is designed to round-trip through the parser (parse → print → parse
 * produces an equivalent AST).
 */
import type { TemplateAST } from './types.js';
/**
 * Serialize a `TemplateAST` back into a template source string.
 *
 * The output is syntactically correct and round-trips through the parser:
 * `parse(print(ast))` produces an AST structurally equivalent to `ast`.
 */
export declare function print(ast: TemplateAST): string;
//# sourceMappingURL=printer.d.ts.map