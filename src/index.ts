import type {
  RenderFunction,
  SikkaOptions,
  StreamingRenderFunction,
  TemplateAST,
} from './types.js';
import { parse } from './parser.js';
import {
  compile as internalCompile,
  compileStreaming as internalCompileStreaming,
} from './compiler.js';
import { createCache } from './cache.js';

type CompilerOptions = SikkaOptions & {
  components: Record<string, RenderFunction>;
  basePath?: string;
  fileReader?: (path: string) => string;
};
type CompileTemplateResult<T> =
  | { ok: true; fn: T; source: string }
  | { ok: false; error: { message: string } };
type TemplateCompiler<T> = (
  ast: TemplateAST,
  options?: CompilerOptions
) => CompileTemplateResult<T>;

type TemplateCache = ReturnType<typeof createCache> | null;
type TemplateCaches = { cache: TemplateCache; streamCache: TemplateCache };

function createTemplateCaches(options: SikkaOptions): TemplateCaches {
  const cache = templateCacheFor(options);
  return { cache, streamCache: cache ? createCache(options.cacheSize) : null };
}

function templateCacheFor(options: SikkaOptions): TemplateCache {
  if (cachingIsEnabled(options)) return createCache(options.cacheSize);
  return suppliedCache(options);
}

function cachingIsEnabled(options: SikkaOptions): boolean {
  return options.cache === true || cacheSizeEnablesCaching(options);
}

function cacheSizeEnablesCaching(options: SikkaOptions): boolean {
  return options.cache === undefined && Boolean(options.cacheSize);
}

function suppliedCache(options: SikkaOptions): TemplateCache {
  return typeof options.cache === 'object' ? options.cache : null;
}

function invalidateCache(cache: TemplateCache, key: string | undefined): void {
  if (!cache) return;
  if (key !== undefined) cache.delete(key);
  else cache.clear();
}

export class Sikka {
  private cache: ReturnType<typeof createCache> | null;
  private streamCache: ReturnType<typeof createCache> | null;
  private globalComponents: Record<string, RenderFunction> = {};

  constructor(private options: SikkaOptions = {}) {
    const caches = createTemplateCaches(options);
    this.cache = caches.cache;
    this.streamCache = caches.streamCache;
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
    invalidateCache(this.cache, key);
    invalidateCache(this.streamCache, key);
  }

  /**
   * Compiles a template string into a render function.
   *
   * @param str - The template content.
   * @param config - Optional configuration overrides for this compilation.
   */
  compile(str: string, config?: SikkaOptions): RenderFunction {
    return this.compileString(str, '', config);
  }

  /**
   * Compiles a template string to its JavaScript function body string.
   *
   * @param str - The template content.
   * @param config - Optional configuration overrides for this compilation.
   */
  compileToString(str: string, config?: SikkaOptions): string {
    const result = internalCompile(this.parseTemplate(str), {
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
    config?: SikkaOptions
  ): RenderFunction {
    const options = config || this.options;
    return this.compileTemplate(
      () => template,
      template,
      basePath,
      options,
      internalCompile,
      config ? null : this.cache
    );
  }

  private compileFile(name: string): RenderFunction {
    const fullPath = this.resolveTemplatePath(name);
    return this.compileTemplate(
      () => this.readTemplateFile(fullPath, 'render'),
      fullPath,
      fullPath,
      this.options,
      internalCompile,
      this.cache,
      fullPath
    );
  }

  private compileStreamingString(template: string, basePath: string = ''): StreamingRenderFunction {
    return this.compileTemplate(
      () => template,
      template,
      basePath,
      this.options,
      internalCompileStreaming,
      this.streamCache
    );
  }

  private compileStreamingFile(name: string): StreamingRenderFunction {
    const fullPath = this.resolveTemplatePath(name);
    return this.compileTemplate(
      () => this.readTemplateFile(fullPath, 'stream'),
      fullPath,
      fullPath,
      this.options,
      internalCompileStreaming,
      this.streamCache,
      fullPath
    );
  }

  private compileTemplate<T extends RenderFunction | StreamingRenderFunction>(
    loadSource: () => string,
    cacheKey: string,
    basePath: string,
    options: SikkaOptions,
    compiler: TemplateCompiler<T>,
    cache: ReturnType<typeof createCache> | null,
    location?: string
  ): T {
    const cached = cache?.get(cacheKey) as T | undefined;
    if (cached) return cached;

    const result = compiler(this.parseTemplate(loadSource(), location), {
      ...options,
      components: this.globalComponents,
      basePath,
      fileReader: options.readFile,
    });
    if (!result.ok) {
      const suffix = location ? ` in ${location}` : '';
      throw new Error(`CompileError${suffix}: ${result.error.message}`);
    }

    cache?.set(cacheKey, result.fn as RenderFunction);
    return result.fn;
  }

  private parseTemplate(source: string, location?: string): TemplateAST {
    const result = parse(source);
    if (result.ok) return result.ast;

    const suffix = location ? ` in ${location}` : '';
    throw new Error(`ParseError${suffix}: ${result.error.message}`);
  }

  private resolveTemplatePath(name: string): string {
    return this.options.views && !name.startsWith('/') && !name.includes(':')
      ? `${this.options.views}/${name}`.replace(/\/+/g, '/')
      : name;
  }

  private readTemplateFile(path: string, method: 'render' | 'stream'): string {
    if (!this.options.readFile) {
      throw new Error(`Sikka.${method}() requires options.readFile to be configured`);
    }

    const content = this.options.readFile(path);
    if (content === undefined || content === null) {
      throw new Error(`Could not read file: ${path}`);
    }
    return content;
  }
}
