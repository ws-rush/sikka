export interface SikkaViteOptions {
    /** Import specifier for `sikka/runtime`; defaults to `"sikka/runtime"`. */
    runtimeSpecifier?: string;
}
export interface SikkaVitePlugin {
    name: string;
    transform(code: string, id: string): {
        code: string;
        map: null;
    } | null;
}
/** Compiles a single `.sikka` template source into a static ESM module string for Vite. */
export declare function compileViteModule(source: string, id: string, options?: SikkaViteOptions): string;
/** Vite plugin that precompiles `.sikka` templates into static ESM modules. */
export declare function sikka(options?: SikkaViteOptions): SikkaVitePlugin;
export default sikka;
//# sourceMappingURL=vite.d.ts.map