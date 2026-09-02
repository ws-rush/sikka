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
  basePath?: string;
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

function createTemplateCaches(options: RuntimeOptions): TemplateCaches {
  const cache = templateCacheFor(options);
  return { cache, streamCache: cache ? createCache(options.cacheSize) : null };
}

function templateCacheFor(options: RuntimeOptions): TemplateCache {
  if (options.cache === true || (options.cache === undefined && Boolean(options.cacheSize)))
    return createCache(options.cacheSize);
  return typeof options.cache === 'object' ? options.cache : null;
}

function invalidateCache(cache: TemplateCache, key: string | undefined): void {
  if (!cache) return;
  if (key !== undefined) cache.delete(key);
  else cache.clear();
}

function sourceTemplateRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
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

export class Sikka {
  private cache: TemplateCache;
  private streamCache: TemplateCache;

  constructor(private options: RuntimeOptions) {
    if (options?.mode !== 'source' && options?.mode !== 'precompiled')
      throw new Error("Sikka requires mode: 'source' or 'precompiled'");
    if (typeof options.resolver !== 'function')
      throw new Error(
        `${options.mode === 'source' ? 'Source' : 'Precompiled'} mode requires a synchronous resolver`
      );
    const caches = createTemplateCaches(options);
    this.cache = caches.cache;
    this.streamCache = caches.streamCache;
  }

  /** Renders an entry Template with Props. */
  render(entry: string, props: Record<string, unknown> = {}): string {
    if (this.options.mode === 'precompiled') return this.renderPrecompiled(entry, props);
    return this.compileSource(this.resolveSource(entry), internalCompile, this.cache).renderSync(
      props,
      {}
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
      basePath: template.id,
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
    const html = this.resolvePrecompiled(entry).render.call(this, props, {});
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
    let module: unknown;
    try {
      module = (this.options as PrecompiledModeOptions).resolver(entry);
    } catch (error) {
      throw new SikkaError(
        `ResolveError for precompiled entry ${JSON.stringify(entry)}: ${errorMessage(error)}`,
        { category: 'Resolve', request: entry, cause: error }
      );
    }
    if (module === undefined || module === null)
      throw new SikkaError(
        `ResolveError for precompiled entry ${JSON.stringify(entry)}: resolver returned no loaded module`,
        { category: 'Resolve', request: entry }
      );
    if (!isPrecompiledModule(module))
      throw new SikkaError(
        `PrecompiledError for entry ${JSON.stringify(entry)}: invalid generated module ABI; ` +
          'expected named render() and stream() exports',
        { category: 'Render', request: entry }
      );
    return module;
  }

  private resolveSource(request: string, importer?: string): SourceTemplate {
    const context = importer ? ` imported by canonical identity ${JSON.stringify(importer)}` : '';
    let template: unknown;
    try {
      template = (this.options as SourceModeOptions).resolver(request, importer);
    } catch (error) {
      throw new SikkaError(
        `ResolveError for ${JSON.stringify(request)}${context}: ${errorMessage(error)}`,
        { category: 'Resolve', request, importer, cause: error }
      );
    }
    if (!isSourceTemplate(template)) {
      const identity = sourceIdentity(template);
      const suffix = identity ? ` (canonical identity ${JSON.stringify(identity)})` : '';
      throw new SikkaError(
        `ResolveError: invalid result for ${JSON.stringify(request)}${context}${suffix}`,
        {
          category: 'Resolve',
          request,
          importer,
          template: identity,
        }
      );
    }
    return template;
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
