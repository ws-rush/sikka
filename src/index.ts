import type {
  PrecompiledModeOptions,
  PrecompiledModule,
  RenderFunction,
  SikkaOptions,
  SourceModeOptions,
  SourceTemplate,
  StreamingRenderFunction,
  TemplateAST,
} from './types.js';
import { parse } from './parser.js';
import {
  compile as internalCompile,
  compileStreaming as internalCompileStreaming,
  unsupportedFrontmatterImport,
} from './compiler.js';
import { createCache } from './cache.js';

export type {
  PrecompiledModeOptions,
  PrecompiledModule,
  PrecompiledResolver,
  SourceModeOptions,
  SourceResolver,
  SourceTemplate,
} from './types.js';

type RuntimeOptions = SikkaOptions | SourceModeOptions | PrecompiledModeOptions;
type CompilerOptions = RuntimeOptions & {
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

function createTemplateCaches(options: RuntimeOptions): TemplateCaches {
  const cache = templateCacheFor(options);
  return { cache, streamCache: cache ? createCache(options.cacheSize) : null };
}

function templateCacheFor(options: RuntimeOptions): TemplateCache {
  if (cachingIsEnabled(options)) return createCache(options.cacheSize);
  return suppliedCache(options);
}

function cachingIsEnabled(options: RuntimeOptions): boolean {
  return options.cache === true || cacheSizeEnablesCaching(options);
}

function cacheSizeEnablesCaching(options: RuntimeOptions): boolean {
  return options.cache === undefined && Boolean(options.cacheSize);
}

function suppliedCache(options: RuntimeOptions): TemplateCache {
  return typeof options.cache === 'object' ? options.cache : null;
}

function invalidateCache(cache: TemplateCache, key: string | undefined): void {
  if (!cache) return;
  if (key !== undefined) cache.delete(key);
  else cache.clear();
}

function sourceTemplateRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as Record<string, unknown>;
}

function isTemplateIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isSourceTemplate(value: unknown): value is SourceTemplate {
  const template = sourceTemplateRecord(value);
  return !!template && isTemplateIdentity(template.id) && typeof template.source === 'string';
}

function isPrecompiledModule(value: unknown): value is PrecompiledModule {
  const module = sourceTemplateRecord(value);
  return !!module && typeof module.render === 'function' && typeof module.stream === 'function';
}

function isAsyncIterable(value: unknown): value is AsyncGenerator<string> {
  return !!value && typeof (value as AsyncIterable<string>)[Symbol.asyncIterator] === 'function';
}

function sourceIdentity(value: unknown): string | undefined {
  const template = sourceTemplateRecord(value);
  return template && typeof template.id === 'string' ? template.id : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function legacyReadFile(options: RuntimeOptions): SikkaOptions['readFile'] | undefined {
  return options.mode === undefined ? options.readFile : undefined;
}

export class Sikka {
  private cache: ReturnType<typeof createCache> | null;
  private streamCache: ReturnType<typeof createCache> | null;
  private globalComponents: Record<string, RenderFunction> = {};

  constructor(private options: RuntimeOptions = {}) {
    if (options.mode === 'source' && typeof options.resolver !== 'function') {
      throw new Error('Source mode requires a synchronous resolver');
    }
    if (options.mode === 'precompiled' && typeof options.resolver !== 'function') {
      throw new Error('Precompiled mode requires a synchronous resolver');
    }
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
    const precompiled = this.precompiledOptions();
    if (precompiled) return this.renderPrecompiled(name, props, precompiled);

    const source = this.sourceOptions();
    const fn = source
      ? this.compileSource(this.resolveSource(name, source), internalCompile, this.cache)
      : this.compileFile(name);
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
    const precompiled = this.precompiledOptions();
    if (precompiled) return this.streamPrecompiled(name, props, precompiled);

    const source = this.sourceOptions();
    const fn = source
      ? this.compileSource(
          this.resolveSource(name, source),
          internalCompileStreaming,
          this.streamCache
        )
      : this.compileStreamingFile(name);
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

  private compileSource<T extends RenderFunction | StreamingRenderFunction>(
    template: SourceTemplate,
    compiler: TemplateCompiler<T>,
    cache: TemplateCache
  ): T {
    const cached = cache?.get(template.id) as T | undefined;
    if (cached) return cached;

    const ast = this.parseTemplate(template.source, template.id);
    this.throwUnsupportedFrontmatterImport(ast.imports, template.id);
    const components = this.resolveSourceComponents(
      ast.imports,
      template.id,
      new Set([template.id]),
      new Map()
    );
    const result = compiler(ast, { ...this.options, components, basePath: template.id });
    if (!result.ok) throw new Error(`CompileError in ${template.id}: ${result.error.message}`);

    cache?.set(template.id, result.fn as RenderFunction);
    return result.fn;
  }

  private resolveSourceComponents(
    imports: TemplateAST['imports'],
    importer: string,
    ancestors: Set<string>,
    compiled: Map<string, RenderFunction>
  ): Record<string, RenderFunction> {
    const components: Record<string, RenderFunction> = {};
    const source = this.sourceOptions() as SourceModeOptions;
    for (const { localName, specifier } of imports) {
      const template = this.resolveSource(specifier, source, importer);
      if (ancestors.has(template.id))
        this.throwSourceCycle(specifier, importer, ancestors, template.id);
      components[localName] = this.compileSourceComponent(template, ancestors, compiled);
    }
    return components;
  }

  private compileSourceComponent(
    template: SourceTemplate,
    ancestors: Set<string>,
    compiled: Map<string, RenderFunction>
  ): RenderFunction {
    const known = compiled.get(template.id) ?? this.cache?.get(template.id);
    if (known) return known;

    const ast = this.parseTemplate(template.source, template.id);
    this.throwUnsupportedFrontmatterImport(ast.imports, template.id);
    const components = this.resolveSourceComponents(
      ast.imports,
      template.id,
      new Set([...ancestors, template.id]),
      compiled
    );
    const result = internalCompile(ast, { ...this.options, components, basePath: template.id });
    if (!result.ok) throw new Error(`CompileError in ${template.id}: ${result.error.message}`);

    this.cache?.set(template.id, result.fn);
    compiled.set(template.id, result.fn);
    return result.fn;
  }

  private throwUnsupportedFrontmatterImport(
    imports: TemplateAST['imports'],
    templateId: string
  ): void {
    const error = unsupportedFrontmatterImport(imports, templateId);
    if (error) throw new Error(`CompileError in ${templateId}: ${error.message}`);
  }

  private throwSourceCycle(
    request: string,
    importer: string,
    ancestors: Set<string>,
    identity: string
  ): never {
    throw new Error(
      `ResolveError for ${JSON.stringify(request)} imported by canonical identity ${JSON.stringify(importer)}: ` +
        `circular component dependency ${[...ancestors, identity].join(' → ')}`
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
    options: RuntimeOptions,
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
      fileReader: legacyReadFile(options),
    });
    if (!result.ok) {
      const suffix = location ? ` in ${location}` : '';
      throw new Error(`CompileError${suffix}: ${result.error.message}`);
    }

    cache?.set(cacheKey, result.fn as RenderFunction);
    return result.fn;
  }

  private sourceOptions(): SourceModeOptions | undefined {
    return this.options.mode === 'source' ? this.options : undefined;
  }

  private precompiledOptions(): PrecompiledModeOptions | undefined {
    return this.options.mode === 'precompiled' ? this.options : undefined;
  }

  private renderPrecompiled(
    entry: string,
    props: Record<string, unknown>,
    options: PrecompiledModeOptions
  ): string {
    const html = this.resolvePrecompiled(entry, options).render.call(this, props, {});
    if (typeof html !== 'string') {
      throw new Error(
        `PrecompiledError for entry ${JSON.stringify(entry)}: generated render() must return HTML synchronously`
      );
    }
    return html;
  }

  private streamPrecompiled(
    entry: string,
    props: Record<string, unknown>,
    options: PrecompiledModeOptions
  ): AsyncGenerator<string> {
    const stream = this.resolvePrecompiled(entry, options).stream.call(this, props, {});
    if (!isAsyncIterable(stream)) {
      throw new Error(
        `PrecompiledError for entry ${JSON.stringify(entry)}: generated stream() must return an async iterable`
      );
    }
    return stream;
  }

  // fallow-ignore-next-line complexity
  private resolvePrecompiled(entry: string, options: PrecompiledModeOptions): PrecompiledModule {
    let module: unknown;
    try {
      module = options.resolver(entry);
    } catch (error) {
      throw new Error(
        `ResolveError for precompiled entry ${JSON.stringify(entry)}: ${errorMessage(error)}`,
        {
          cause: error,
        }
      );
    }
    if (module === undefined || module === null) {
      throw new Error(
        `ResolveError for precompiled entry ${JSON.stringify(entry)}: resolver returned no loaded module`
      );
    }
    if (!isPrecompiledModule(module)) {
      throw new Error(
        `PrecompiledError for entry ${JSON.stringify(entry)}: invalid generated module ABI; ` +
          'expected named render() and stream() exports'
      );
    }
    return module;
  }

  private legacyOptions(): SikkaOptions | undefined {
    return this.options.mode === undefined ? this.options : undefined;
  }

  private resolveSource(
    request: string,
    options: SourceModeOptions,
    importer?: string
  ): SourceTemplate {
    const context = importer ? ` imported by canonical identity ${JSON.stringify(importer)}` : '';
    let template: unknown;
    try {
      template = options.resolver(request, importer);
    } catch (error) {
      throw new Error(
        `ResolveError for ${JSON.stringify(request)}${context}: ${errorMessage(error)}`,
        {
          cause: error,
        }
      );
    }
    if (!isSourceTemplate(template)) {
      const identity = sourceIdentity(template);
      const suffix = identity ? ` (canonical identity ${JSON.stringify(identity)})` : '';
      throw new Error(
        `ResolveError: invalid result for ${JSON.stringify(request)}${context}${suffix}`
      );
    }
    return template;
  }

  private parseTemplate(source: string, location?: string): TemplateAST {
    const result = parse(source);
    if (result.ok) return result.ast;

    const suffix = location ? ` in ${location}` : '';
    throw new Error(`ParseError${suffix}: ${result.error.message}`);
  }

  private resolveTemplatePath(name: string): string {
    const views = this.legacyOptions()?.views;
    return views && !name.startsWith('/') && !name.includes(':')
      ? `${views}/${name}`.replace(/\/+/g, '/')
      : name;
  }

  private readTemplateFile(path: string, method: 'render' | 'stream'): string {
    const readFile = this.legacyOptions()?.readFile;
    if (!readFile) {
      throw new Error(`Sikka.${method}() requires options.readFile to be configured`);
    }

    const content = readFile(path);
    if (content === undefined || content === null) {
      throw new Error(`Could not read file: ${path}`);
    }
    return content;
  }
}
