import type {
  CompileError,
  PrecompiledModeOptions,
  PrecompiledModule,
  RenderFunction,
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
import { SikkaError } from './error.js';
import { bindRuntime, runtime } from './runtime.js';
import { resolveSourceTemplate } from './template-resolution.js';

export { SikkaError } from './error.js';
export type { SikkaDiagnostic, SikkaDiagnosticCategory } from './types.js';
export type {
  Cache,
  PrecompiledModeOptions,
  PrecompiledModule,
  PrecompiledResolver,
  SourceModeOptions,
  SourceResolver,
  SourceTemplate,
} from './types.js';

type RuntimeOptions = SourceModeOptions | PrecompiledModeOptions;
type CompilerOptions = RuntimeOptions & {
  components: Record<string, RenderFunction>;
  streamComponents?: boolean;
  templateId?: string;
};
type CompileTemplateResult<T> =
  | { ok: true; fn: T; source: string }
  | { ok: false; error: CompileError };
type TemplateCompiler<T> = (
  ast: TemplateAST,
  options?: CompilerOptions
) => CompileTemplateResult<T>;
type TemplateCache = ReturnType<typeof createCache> | null;
type TemplateCaches = { cache: TemplateCache; streamCache: TemplateCache };
type PrecompiledRender = (props: Record<string, unknown>, slots: Record<string, string>) => string;

const EMPTY_SLOTS: Record<string, string> = {};

function createTemplateCaches(options: RuntimeOptions): TemplateCaches {
  const cache = templateCacheFor(options);
  return { cache, streamCache: cache ? createCache(options.cacheSize) : null };
}

function templateCacheFor(options: RuntimeOptions): TemplateCache {
  if (cacheIsEnabled(options)) return createCache(options.cacheSize);
  return typeof options.cache === 'object' ? options.cache : null;
}

function cacheIsEnabled(options: RuntimeOptions): boolean {
  return options.cache === true || (options.cache === undefined && Boolean(options.cacheSize));
}

function invalidateCache(cache: TemplateCache, key: string | undefined): void {
  if (!cache) return;
  if (key !== undefined) cache.delete(key);
  else cache.clear();
}

function sourceTemplateRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function isPrecompiledModule(value: unknown): value is PrecompiledModule {
  const module = sourceTemplateRecord(value);
  return !!module && typeof module.render === 'function' && typeof module.stream === 'function';
}

function isAsyncIterable(value: unknown): value is AsyncGenerator<string> {
  return !!value && typeof (value as AsyncIterable<string>)[Symbol.asyncIterator] === 'function';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateRuntimeOptions(options: RuntimeOptions | undefined): void {
  if (!options || !isRuntimeMode(options.mode))
    throw new Error("Sikka requires mode: 'source' or 'precompiled'");
  if (typeof options.resolver !== 'function')
    throw new Error(`${runtimeModeLabel(options)} mode requires a synchronous resolver`);
}

function runtimeModeLabel(options: RuntimeOptions): 'Source' | 'Precompiled' {
  return options.mode === 'source' ? 'Source' : 'Precompiled';
}

function isRuntimeMode(mode: unknown): mode is RuntimeOptions['mode'] {
  return mode === 'source' || mode === 'precompiled';
}

export class Sikka {
  private cache: TemplateCache;
  private streamCache: TemplateCache;
  private modules = new Map<string, PrecompiledModule>();
  private renders = new Map<string, PrecompiledRender>();
  private lastEntry: string | undefined;
  private lastRender: PrecompiledRender | undefined;

  constructor(private options: RuntimeOptions) {
    validateRuntimeOptions(options);
    bindRuntime(this, runtime(options));
    this.render = options.mode === 'precompiled' ? this.renderPrecompiled : this.renderSource;
    const caches = createTemplateCaches(options);
    this.cache = caches.cache;
    this.streamCache = caches.streamCache;
  }

  /** Renders an entry Template with Props. */
  render(entry: string, props: Record<string, unknown> = {}): string {
    return this.renderSource(entry, props);
  }

  private renderSource(entry: string, props: Record<string, unknown>): string {
    return this.compileSource(this.resolveSource(entry), internalCompile, this.cache).renderSync(
      props,
      EMPTY_SLOTS
    );
  }

  /** Streams an entry Template with Props. */
  stream(entry: string, props: Record<string, unknown> = {}): AsyncGenerator<string> {
    if (this.options.mode === 'precompiled') return this.streamPrecompiled(entry, props);
    return this.compileSource(
      this.resolveSource(entry),
      internalCompileStreaming,
      this.streamCache
    )(props, {});
  }

  /** Invalidates one canonical Template identity, or both compilation caches. */
  invalidate(id?: string): void {
    invalidateCache(this.cache, id);
    invalidateCache(this.streamCache, id);
    if (id !== undefined) {
      this.modules.delete(id);
      this.renders.delete(id);
      if (this.lastEntry === id) this.lastEntry = this.lastRender = undefined;
    } else {
      this.modules.clear();
      this.renders.clear();
      this.lastEntry = this.lastRender = undefined;
    }
  }

  private compileSource<T extends RenderFunction | StreamingRenderFunction>(
    template: SourceTemplate,
    compiler: TemplateCompiler<T>,
    cache: TemplateCache
  ): T {
    return this.compileSourceTemplate(template, new Set([template.id]), new Map(), compiler, cache);
  }

  private resolveSourceComponents<T extends RenderFunction | StreamingRenderFunction>(
    imports: TemplateAST['imports'],
    importer: string,
    ancestors: Set<string>,
    compiled: Map<string, T>,
    compiler: TemplateCompiler<T>,
    cache: TemplateCache
  ): Record<string, RenderFunction> {
    const components: Record<string, RenderFunction> = {};
    for (const { localName, specifier } of imports) {
      const template = this.resolveSource(specifier, importer);
      if (ancestors.has(template.id))
        this.throwSourceCycle(specifier, importer, ancestors, template.id);
      components[localName] = this.compileSourceTemplate(
        template,
        new Set([...ancestors, template.id]),
        compiled,
        compiler,
        cache
      ) as RenderFunction;
    }
    return components;
  }

  private compileSourceTemplate<T extends RenderFunction | StreamingRenderFunction>(
    template: SourceTemplate,
    ancestors: Set<string>,
    compiled: Map<string, T>,
    compiler: TemplateCompiler<T>,
    cache: TemplateCache
  ): T {
    const known = compiled.get(template.id) ?? (cache?.get(template.id) as T | undefined);
    if (known) return known;

    const ast = this.parseTemplate(template.source, template.id);
    this.throwUnsupportedFrontmatterImport(ast.imports, template.id);
    const result = compiler(ast, {
      ...this.options,
      components: this.resolveSourceComponents(
        ast.imports,
        template.id,
        ancestors,
        compiled,
        compiler,
        cache
      ),
      streamComponents: compiler === internalCompileStreaming,
      templateId: template.id,
    });
    if (!result.ok)
      throw new SikkaError(`CompileError in ${template.id}: ${result.error.message}`, {
        ...result.error,
        template: template.id,
      });

    cache?.set(template.id, result.fn as RenderFunction);
    compiled.set(template.id, result.fn);
    return result.fn;
  }

  private throwUnsupportedFrontmatterImport(
    imports: TemplateAST['imports'],
    templateId: string
  ): void {
    const error = unsupportedFrontmatterImport(imports, templateId);
    if (error)
      throw new SikkaError(`CompileError in ${templateId}: ${error.message}`, {
        ...error,
        template: templateId,
      });
  }

  private throwSourceCycle(
    request: string,
    importer: string,
    ancestors: Set<string>,
    identity: string
  ): never {
    throw new SikkaError(
      `ResolveError for ${JSON.stringify(request)} imported by canonical identity ${JSON.stringify(importer)}: ` +
        `circular component dependency ${[...ancestors, identity].join(' → ')}`,
      { category: 'Resolve', request, importer, template: identity }
    );
  }

  private renderPrecompiled(entry: string, props: Record<string, unknown>): string {
    let render = entry === this.lastEntry ? this.lastRender : undefined;
    if (!render) {
      render = this.renders.get(entry);
      if (!render) {
        render = this.resolvePrecompiled(entry).render.bind(this);
        this.renders.set(entry, render);
      }
      this.lastEntry = entry;
      this.lastRender = render;
    }
    const html = render(props, EMPTY_SLOTS);
    if (typeof html !== 'string')
      throw new Error(
        `PrecompiledError for entry ${JSON.stringify(entry)}: generated render() must return HTML synchronously`
      );
    return html;
  }

  private streamPrecompiled(entry: string, props: Record<string, unknown>): AsyncGenerator<string> {
    const stream = this.resolvePrecompiled(entry).stream.call(this, props, {});
    if (!isAsyncIterable(stream))
      throw new Error(
        `PrecompiledError for entry ${JSON.stringify(entry)}: generated stream() must return an async iterable`
      );
    return stream;
  }

  private resolvePrecompiled(entry: string): PrecompiledModule {
    const cached = this.modules.get(entry);
    if (cached) return cached;
    const module = this.loadPrecompiled(entry);
    if (module == null) throw this.missingPrecompiledModule(entry);
    if (!isPrecompiledModule(module)) throw this.invalidPrecompiledModule(entry);
    this.modules.set(entry, module);
    return module;
  }

  private loadPrecompiled(entry: string): unknown {
    try {
      return (this.options as PrecompiledModeOptions).resolver(entry);
    } catch (error) {
      throw new SikkaError(
        `ResolveError for precompiled entry ${JSON.stringify(entry)}: ${errorMessage(error)}`,
        { category: 'Resolve', request: entry, cause: error }
      );
    }
  }

  private missingPrecompiledModule(entry: string): SikkaError {
    return new SikkaError(
      `ResolveError for precompiled entry ${JSON.stringify(entry)}: resolver returned no loaded module`,
      { category: 'Resolve', request: entry }
    );
  }

  private invalidPrecompiledModule(entry: string): SikkaError {
    return new SikkaError(
      `PrecompiledError for entry ${JSON.stringify(entry)}: invalid generated module ABI; ` +
        'expected named render() and stream() exports',
      { category: 'Render', request: entry }
    );
  }

  private resolveSource(request: string, importer?: string): SourceTemplate {
    return resolveSourceTemplate(request, (this.options as SourceModeOptions).resolver, importer);
  }

  private parseTemplate(source: string, template?: string): TemplateAST {
    const result = parse(source);
    if (result.ok) return result.ast;
    throw new SikkaError(
      `ParseError${template ? ` in ${template}` : ''}: ${result.error.message}`,
      {
        ...result.error,
        template,
      }
    );
  }
}
