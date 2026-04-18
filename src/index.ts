import type { RenderFunction, EngineOptions, StreamingRenderFunction } from './types.js';
import { parse } from './parser.js';
import {
  compile as internalCompile,
  compileStreaming as internalCompileStreaming,
} from './compiler.js';
import { createCache } from './cache.js';

export class Engine {
  private cache: ReturnType<typeof createCache> | null;
  private streamCache: ReturnType<typeof createCache> | null;
  private globalComponents: Record<string, RenderFunction> = {};

  constructor(private options: EngineOptions = {}) {
    if (options.cache === true || (options.cache === undefined && options.cacheSize)) {
      this.cache = createCache(options.cacheSize);
      this.streamCache = createCache(options.cacheSize);
    } else if (typeof options.cache === 'object') {
      this.cache = options.cache;
      this.streamCache = createCache(options.cacheSize);
    } else {
      this.cache = null;
      this.streamCache = null;
    }
  }

  /**
   * Renders a template string with the provided props.
   *
   * @param template - The template content to render.
   * @param props - Data object to pass as `Astro.props`.
   */
  renderString(template: string, props: Record<string, unknown> = {}): string {
    const fn = this.compileString(template);
    return fn.renderSync(props, {});
  }

  /**
   * Renders a template file from the configured views directory.
   *
   * @param name - The path or name of the template file.
   * @param props - Data object to pass as `Astro.props`.
   */
  render(name: string, props: Record<string, unknown> = {}): string {
    const fn = this.compileFile(name);
    return fn.renderSync(props, {});
  }

  /**
   * Streams a template string, yielding HTML chunks as they are produced.
   * Static content is yielded immediately; component calls are awaited and
   * yielded as single opaque chunks.
   *
   * @param template - The template content to stream.
   * @param props - Data object to pass as `Astro.props`.
   */
  streamString(template: string, props: Record<string, unknown> = {}): AsyncGenerator<string> {
    const fn = this.compileStreamingString(template);
    return fn(props, {});
  }

  /**
   * Streams a template file from the configured views directory, yielding
   * HTML chunks as they are produced.
   *
   * @param name - The path or name of the template file.
   * @param props - Data object to pass as `Astro.props`.
   */
  stream(name: string, props: Record<string, unknown> = {}): AsyncGenerator<string> {
    const fn = this.compileStreamingFile(name);
    return fn(props, {});
  }

  /**
   * Pre-loads and compiles a component for use in other templates.
   */
  loadComponent(name: string, template: string): void {
    this.globalComponents[name] = this.compileString(template);
  }

  /**
   * Registers a pre-compiled render function as a global component.
   */
  registerComponent(name: string, fn: RenderFunction): void {
    this.globalComponents[name] = fn;
  }

  /**
   * Invalidates the template cache.
   * @param key - Optional specific key to remove. If omitted, the entire cache is cleared.
   */
  invalidate(key?: string): void {
    if (this.cache) {
      if (key !== undefined) {
        this.cache.delete(key);
      } else {
        this.cache.clear();
      }
    }
    if (this.streamCache) {
      if (key !== undefined) {
        this.streamCache.delete(key);
      } else {
        this.streamCache.clear();
      }
    }
  }

  /**
   * Compiles a template string into a render function.
   *
   * @param str - The template content.
   * @param config - Optional configuration overrides for this compilation.
   */
  compile(str: string, config?: EngineOptions): RenderFunction {
    return this.compileString(str, '', config);
  }

  /**
   * Compiles a template string to its JavaScript function body string.
   *
   * @param str - The template content.
   * @param config - Optional configuration overrides for this compilation.
   */
  compileToString(str: string, config?: EngineOptions): string {
    const parseResult = parse(str);
    if (!parseResult.ok) {
      throw new Error(`ParseError: ${parseResult.error.message}`);
    }
    const result = internalCompile(parseResult.ast, {
      ...(config || this.options),
      components: this.globalComponents,
    });
    if (!result.ok) {
      throw new Error(`CompileError: ${result.error.message}`);
    }
    return result.source;
  }

  private compileString(
    template: string,
    basePath: string = '',
    config?: EngineOptions
  ): RenderFunction {
    const options = config || this.options;
    if (this.cache && !config) {
      const cached = this.cache.get(template);
      if (cached) return cached;
    }

    const parseResult = parse(template);
    if (!parseResult.ok) {
      throw new Error(`ParseError: ${parseResult.error.message}`);
    }

    const result = internalCompile(parseResult.ast, {
      ...options,
      components: this.globalComponents,
      basePath,
      fileReader: options.readFile,
    });

    if (!result.ok) {
      throw new Error(`CompileError: ${result.error.message}`);
    }

    if (this.cache && !config) {
      this.cache.set(template, result.fn);
    }

    return result.fn;
  }

  private compileFile(name: string): RenderFunction {
    const fullPath =
      this.options.views && !name.startsWith('/') && !name.includes(':')
        ? `${this.options.views}/${name}`.replace(/\/+/g, '/')
        : name;

    if (this.cache) {
      const cached = this.cache.get(fullPath);
      if (cached) return cached;
    }

    if (!this.options.readFile) {
      throw new Error('Engine.render() requires options.readFile to be configured');
    }

    const content = this.options.readFile(fullPath);
    if (content === undefined || content === null) {
      throw new Error(`Could not read file: ${fullPath}`);
    }
    const parseResult = parse(content);
    if (!parseResult.ok) {
      throw new Error(`ParseError in ${fullPath}: ${parseResult.error.message}`);
    }

    const result = internalCompile(parseResult.ast, {
      ...this.options,
      components: this.globalComponents,
      basePath: fullPath,
      fileReader: this.options.readFile,
    });

    if (!result.ok) {
      throw new Error(`CompileError in ${fullPath}: ${result.error.message}`);
    }

    if (this.cache) {
      this.cache.set(fullPath, result.fn);
    }

    return result.fn;
  }

  private compileStreamingString(template: string, basePath: string = ''): StreamingRenderFunction {
    if (this.streamCache) {
      const cached = this.streamCache.get(template);
      if (cached) return cached as unknown as StreamingRenderFunction;
    }

    const parseResult = parse(template);
    if (!parseResult.ok) {
      throw new Error(`ParseError: ${parseResult.error.message}`);
    }

    const result = internalCompileStreaming(parseResult.ast, {
      ...this.options,
      components: this.globalComponents,
      basePath,
      fileReader: this.options.readFile,
    });

    if (!result.ok) {
      throw new Error(`CompileError: ${result.error.message}`);
    }

    if (this.streamCache) {
      this.streamCache.set(template, result.fn as unknown as RenderFunction);
    }

    return result.fn;
  }

  private compileStreamingFile(name: string): StreamingRenderFunction {
    const fullPath =
      this.options.views && !name.startsWith('/') && !name.includes(':')
        ? `${this.options.views}/${name}`.replace(/\/+/g, '/')
        : name;

    if (this.streamCache) {
      const cached = this.streamCache.get(fullPath);
      if (cached) return cached as unknown as StreamingRenderFunction;
    }

    if (!this.options.readFile) {
      throw new Error('Engine.stream() requires options.readFile to be configured');
    }

    const content = this.options.readFile(fullPath);
    if (content === undefined || content === null) {
      throw new Error(`Could not read file: ${fullPath}`);
    }
    const parseResult = parse(content);
    if (!parseResult.ok) {
      throw new Error(`ParseError in ${fullPath}: ${parseResult.error.message}`);
    }

    const result = internalCompileStreaming(parseResult.ast, {
      ...this.options,
      components: this.globalComponents,
      basePath: fullPath,
      fileReader: this.options.readFile,
    });

    if (!result.ok) {
      throw new Error(`CompileError in ${fullPath}: ${result.error.message}`);
    }

    if (this.streamCache) {
      this.streamCache.set(fullPath, result.fn as unknown as RenderFunction);
    }

    return result.fn;
  }
}
