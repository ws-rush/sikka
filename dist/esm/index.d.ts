import type { RenderFunction, EngineOptions } from './types.js';
export declare class Engine {
    private options;
    private cache;
    private globalComponents;
    constructor(options?: EngineOptions);
    /**
     * Renders a template string with the provided props.
     *
     * @param template - The template content to render.
     * @param props - Data object to pass as `Astro.props`.
     */
    renderString(template: string, props?: Record<string, unknown>): string;
    /**
     * Renders a template file from the configured views directory.
     *
     * @param name - The path or name of the template file.
     * @param props - Data object to pass as `Astro.props`.
     */
    render(name: string, props?: Record<string, unknown>): string;
    /**
     * Pre-loads and compiles a component for use in other templates.
     */
    loadComponent(name: string, template: string): void;
    /**
     * Registers a pre-compiled render function as a global component.
     */
    registerComponent(name: string, fn: RenderFunction): void;
    /**
     * Invalidates the template cache.
     * @param key - Optional specific key to remove. If omitted, the entire cache is cleared.
     */
    invalidate(key?: string): void;
    /**
     * Compiles a template string into a render function.
     *
     * @param str - The template content.
     * @param config - Optional configuration overrides for this compilation.
     */
    compile(str: string, config?: EngineOptions): RenderFunction;
    /**
     * Compiles a template string to its JavaScript function body string.
     *
     * @param str - The template content.
     * @param config - Optional configuration overrides for this compilation.
     */
    compileToString(str: string, config?: EngineOptions): string;
    private compileString;
    private compileFile;
}
//# sourceMappingURL=index.d.ts.map