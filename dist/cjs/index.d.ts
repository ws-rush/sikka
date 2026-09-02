import type { PrecompiledModeOptions, SourceModeOptions } from './types.js';
export { SikkaError } from './error.js';
export type { SikkaDiagnostic, SikkaDiagnosticCategory } from './types.js';
export type { Cache, PrecompiledModeOptions, PrecompiledModule, PrecompiledResolver, SourceModeOptions, SourceResolver, SourceTemplate, } from './types.js';
type RuntimeOptions = SourceModeOptions | PrecompiledModeOptions;
export declare class Sikka {
    private options;
    private cache;
    private streamCache;
    private modules;
    private renders;
    private lastEntry;
    private lastRender;
    constructor(options: RuntimeOptions);
    /** Renders an entry Template with Props. */
    render(entry: string, props?: Record<string, unknown>): string;
    private renderSource;
    /** Streams an entry Template with Props. */
    stream(entry: string, props?: Record<string, unknown>): AsyncGenerator<string>;
    /** Invalidates one canonical Template identity, or both compilation caches. */
    invalidate(id?: string): void;
    private compileSource;
    private resolveSourceComponents;
    private compileSourceTemplate;
    private throwUnsupportedFrontmatterImport;
    private throwSourceCycle;
    private renderPrecompiled;
    private streamPrecompiled;
    private resolvePrecompiled;
    private loadPrecompiled;
    private missingPrecompiledModule;
    private invalidPrecompiledModule;
    private resolveSource;
    private loadSource;
    private invalidSourceTemplate;
    private parseTemplate;
}
