/**
 * Compiler — Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 6.3, 7.1, 7.4
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
import type { TemplateAST, CompileResult, CompileError, RenderFunction, FileReader, ComponentImport } from './types.js';
export interface CompileOptions {
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
}
type ResolveResult = {
    ok: true;
    components: Record<string, RenderFunction>;
} | {
    ok: false;
    error: CompileError;
};
/**
 * Recursively resolve and compile all component imports in an AST.
 *
 * Requirements: 2.6, 2.8, 7.1, 7.4
 *
 * @param imports     The `imports` array from the AST being compiled.
 * @param fileReader  Injectable file-reader for loading component source.
 * @param basePath    The path of the file that owns these imports (for relative resolution).
 * @param inProgress  Set of paths currently being compiled (cycle detection).
 */
export declare function resolveComponents(imports: ComponentImport[], fileReader: FileReader, basePath: string, inProgress?: Set<string>): Promise<ResolveResult>;
/**
 * Higher-level compile entry point: resolves component imports then compiles the AST.
 *
 * Requirements: 2.6, 2.8, 7.1, 7.4, 6.3
 *
 * @param ast        The parsed TemplateAST.
 * @param options    Compile options including an optional fileReader and basePath.
 */
export declare function compile(ast: TemplateAST, options?: CompileOptions & {
    fileReader?: FileReader;
    basePath?: string;
}): Promise<CompileResult>;
/**
 * Compile a TemplateAST into a RenderFunction.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7
 */
export declare function compileAST(ast: TemplateAST, options?: CompileOptions): CompileResult;
export {};
//# sourceMappingURL=compiler.d.ts.map