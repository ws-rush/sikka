import type { RenderFunction, EngineOptions, EngineInstance, RenderResult, Asset } from './types.js';
export declare class Engine implements EngineInstance {
    private options;
    private cache;
    private globalComponents;
    constructor(options?: EngineOptions);
    renderString(template: string, props?: Record<string, unknown>): Promise<string>;
    renderStringFull(template: string, props?: Record<string, unknown>): Promise<RenderResult>;
    renderStringAsync(template: string, props?: Record<string, unknown>): Promise<string>;
    renderStringStream(template: string, props?: Record<string, unknown>): AsyncIterable<string | Asset>;
    render(name: string, props?: Record<string, unknown>): Promise<string>;
    renderFull(name: string, props?: Record<string, unknown>): Promise<RenderResult>;
    renderAsync(name: string, props?: Record<string, unknown>): Promise<string>;
    renderStream(name: string, props?: Record<string, unknown>): AsyncIterable<string | Asset>;
    private formatAsset;
    loadComponent(name: string, template: string): void;
    registerComponent(name: string, fn: RenderFunction): void;
    invalidate(key?: string): void;
    private compileString;
    private compileFile;
}
//# sourceMappingURL=index.d.ts.map