/**
 * Compiler
 */
import type { TemplateAST, CompileResult, CompileError, RenderFunction, StreamingCompileResult, ComponentImport } from './types.js';
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
    /** Whether to aggregate <script> and <style> tags. */
    aggregateAssets?: boolean;
    /** Generated bodies call statically linked Component exports directly. */
    precompiled?: boolean;
    /** Source Streaming renders use Streaming Component functions. */
    streamComponents?: boolean;
    /** Canonical Template identity included in debug Render failures. */
    templateId?: string;
}
export declare const compile: typeof compileSync;
/** Returns a diagnostic when regular rendering cannot execute Frontmatter await. */
export declare function unsupportedFrontmatterAwait(ast: TemplateAST): CompileError | undefined;
/** Returns a diagnostic for a Frontmatter import that is not a Component. */
export declare function unsupportedFrontmatterImport(imports: ComponentImport[], templateId?: string): CompileError | undefined;
/** Compiles an AST after its Component graph has been resolved by the host. */
declare function compileSync(ast: TemplateAST, options?: CompileOptions): CompileResult;
/** Compiles an AST for Streaming after its Component graph has been resolved by the host. */
declare function compileStreamingInternal(ast: TemplateAST, options?: CompileOptions): StreamingCompileResult;
export declare const compileStreaming: typeof compileStreamingInternal;
/** Builds unevaluated regular and Streaming render bodies for `sikka/precompile`. */
export declare function compileSources(ast: TemplateAST, templateId?: string): {
    ok: true;
    renderString: string;
    streamString: string;
} | {
    ok: false;
    error: CompileError;
};
export {};
//# sourceMappingURL=compiler.d.ts.map