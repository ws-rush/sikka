import type { EngineOptions, EngineInstance } from './types.js';
export declare class Engine implements EngineInstance {
    private options;
    private cache;
    private globalComponents;
    constructor(options?: EngineOptions);
    renderString(template: string, props?: Record<string, unknown>): Promise<string>;
    renderStringAsync(template: string, props?: Record<string, unknown>): Promise<string>;
    render(name: string, props?: Record<string, unknown>): Promise<string>;
    renderAsync(name: string, props?: Record<string, unknown>): Promise<string>;
    loadComponent(name: string, template: string): void;
    invalidate(key?: string): void;
    private compileString;
    private compileFile;
    private _compileAST;
    private _resolveComponents;
}
//# sourceMappingURL=index.d.ts.map