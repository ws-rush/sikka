/**
 * Compiler
 *
 * Transforms a TemplateAST into a RenderFunction JS closure.
 *
 * Strategy:
 *   1. Walk the AST and emit a JS function body string
 *   2. Inject frontmatter source so props are in scope
 *   3. Emit __escape(expr) for ExpressionNode values
 *   4. Emit verbatim content for ScriptNode and StyleNode
 *   5. Substitute SlotNode with slot content from the `slots` argument
 *   6. Use new AsyncFunction(...) to support await in frontmatter
 *   7. Recursively resolve component imports via FileReader
 *   8. Detect circular dependencies via an in-progress path set
 */
import type { TemplateAST, CompileResult, RenderFunction, FileReader } from './types.js';
interface CompileOptions {
    /** Resolved component render functions keyed by local name. */
    components?: Record<string, RenderFunction>;
    /** Custom name for the props variable (default: "Astro"). */
    varName?: string;
    /** Whether to automatically escape HTML. Default: true. */
    autoEscape?: boolean;
    /** Whether to automatically filter values. */
    autoFilter?: boolean;
    /** Custom filter function. */
    filterFunction?: (val: unknown) => unknown;
    /** Whether to enable debug mode. */
    debug?: boolean;
    /** Custom path resolution function. */
    resolvePath?: (base: string, specifier: string) => string | Promise<string>;
    /** Whether to aggregate <script> and <style> tags. */
    aggregateAssets?: boolean;
}
/**
 * Higher-level compile entry point: resolves component imports then compiles the AST.
 */
export declare function compile(ast: TemplateAST, options?: CompileOptions & {
    fileReader?: FileReader;
    basePath?: string;
}): Promise<CompileResult>;
/**
 * Compile a TemplateAST into a RenderFunction.
 */
export declare function compileAST(ast: TemplateAST, options?: CompileOptions): CompileResult;
/**
 * Compile a TemplateAST into a standalone ESM module string.
 */
export declare function compileToModule(ast: TemplateAST, options?: CompileOptions): string;
export {};
//# sourceMappingURL=compiler.d.ts.map