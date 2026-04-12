import type {
  RenderFunction,
  EngineOptions,
} from './types.js';
import { parse } from './parser.js';
import { compileSync } from './compiler.js';
import { createCache } from './cache.js';

export class Engine {
  private cache: ReturnType<typeof createCache> | null;
  private globalComponents: Record<string, RenderFunction> = {};

  constructor(private options: EngineOptions = {}) {
    if (options.cache === true || (options.cache === undefined && options.cacheSize)) {
      this.cache = createCache(options.cacheSize);
    } else if (typeof options.cache === 'object') {
      this.cache = options.cache;
    } else {
      this.cache = null;
    }
  }

  renderString(template: string, props: Record<string, unknown> = {}): string {
    const fn = this.compileStringSync(template);
    return fn.renderSync(props, {});
  }

  render(name: string, props: Record<string, unknown> = {}): string {
    const fn = this.compileFileSync(name);
    return fn.renderSync(props, {});
  }

  loadComponent(name: string, template: string): void {
    this.globalComponents[name] = this.compileStringSync(template);
  }

  registerComponent(name: string, fn: RenderFunction): void {
    this.globalComponents[name] = fn;
  }

  invalidate(key?: string): void {
    if (this.cache) {
      if (key !== undefined) {
        this.cache.delete(key);
      } else {
        this.cache.clear();
      }
    }
  }

  private compileStringSync(template: string, basePath: string = ''): RenderFunction {
    const cacheKey = this.cache ? (template.length < 100 ? template : null) : null;
    if (this.cache && cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    const parseResult = parse(template);
    if (!parseResult.ok) {
      throw new Error(`ParseError: ${parseResult.error.message}`);
    }

    const result = compileSync(parseResult.ast, {
      ...this.options,
      components: this.globalComponents,
      basePath,
      fileReader: this.options.readFileSync,
    });

    if (!result.ok) {
      throw new Error(`CompileError: ${result.error.message}`);
    }

    if (this.cache && cacheKey) {
      this.cache.set(cacheKey, result.fn);
    }

    return result.fn;
  }

  private compileFileSync(name: string): RenderFunction {
    const fullPath =
      this.options.views && !name.startsWith('/') && !name.includes(':')
        ? `${this.options.views}/${name}`.replace(/\/+/g, '/')
        : name;

    if (this.cache) {
      const cached = this.cache.get(fullPath);
      if (cached) return cached;
    }

    if (!this.options.readFileSync) {
      throw new Error('Engine.renderSync() requires options.readFileSync to be configured');
    }

    const content = this.options.readFileSync(fullPath);
    if (content === undefined || content === null) {
      throw new Error(`Could not read file: ${fullPath}`);
    }
    const parseResult = parse(content);
    if (!parseResult.ok) {
      throw new Error(`ParseError in ${fullPath}: ${parseResult.error.message}`);
    }

    const result = compileSync(parseResult.ast, {
      ...this.options,
      components: this.globalComponents,
      basePath: fullPath,
      fileReader: this.options.readFileSync,
    });

    if (!result.ok) {
      throw new Error(`CompileError in ${fullPath}: ${result.error.message}`);
    }

    if (this.cache) {
      this.cache.set(fullPath, result.fn);
    }

    return result.fn;
  }
}
