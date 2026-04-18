/**
 * Compiler
 */
import type { TemplateAST, CompileResult, RenderFunction, StreamingCompileResult } from './types.js';
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
export declare const compile: typeof compileSync;
/**
 * Higher-level compile entry point (Synchronous): resolves component imports then compiles the AST.
 */
declare function compileSync(ast: TemplateAST, options?: CompileOptions & {
    fileReader?: (path: string) => string;
    basePath?: string;
}): CompileResult;
/**
 * Higher-level streaming compile entry point: resolves component imports then
 * compiles the AST for streaming.
 */
declare function compileStreamingInternal(ast: TemplateAST, options?: CompileOptions & {
    fileReader?: (path: string) => string;
    basePath?: string;
}): StreamingCompileResult;
export declare const compileStreaming: typeof compileStreamingInternal;
export {};
//# sourceMappingURL=compiler.d.ts.map