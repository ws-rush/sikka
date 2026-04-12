import type { RenderFunction, EngineOptions } from './types.js';
export declare class Engine {
    private options;
    private cache;
    private globalComponents;
    constructor(options?: EngineOptions);
    renderString(template: string, props?: Record<string, unknown>): string;
    render(name: string, props?: Record<string, unknown>): string;
    loadComponent(name: string, template: string): void;
    registerComponent(name: string, fn: RenderFunction): void;
    invalidate(key?: string): void;
    private compileString;
    private compileFile;
}
//# sourceMappingURL=index.d.ts.map