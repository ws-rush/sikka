import type {
  RenderFunction,
  EngineOptions,
  EngineInstance,
  TemplateAST,
  ComponentImport,
} from './types.js';
import { parse } from './parser.js';
import { compileAST } from './compiler.js';
import { createCache, hashTemplate } from './cache.js';

export type {
  RenderFunction,
  RenderOptions,
  EngineOptions,
  EngineInstance,
  TemplateAST,
  FrontmatterNode,
  ComponentImport,
  TemplateNode,
  ElementNode,
  AttrNode,
  ExpressionNode,
  TextNode,
  SlotNode,
  ScriptNode,
  StyleNode,
  RawNode,
  ParseResult,
  ParseError,
  CompileResult,
  CompileError,
} from './types.js';

export { compile, compileAST, resolveComponents, type CompileOptions } from './compiler.js';

export { TemplateEngineError, LoadError, RenderError } from './types.js';
export { escapeHtml, html, RawHtml } from './escape.js';

export class Engine implements EngineInstance {
  private cache: ReturnType<typeof createCache> | null;
  private globalComponents: Record<string, RenderFunction | Promise<RenderFunction>> = {};

  constructor(private options: EngineOptions = {}) {
    this.cache = options.cache ? createCache(options.cacheSize) : null;
  }

  async renderString(template: string, props: Record<string, unknown> = {}): Promise<string> {
    const fn = await this.compileString(template);
    return await (fn(props, {}) as unknown as Promise<string>);
  }

  async renderStringAsync(template: string, props: Record<string, unknown> = {}): Promise<string> {
    return this.renderString(template, props);
  }

  async render(name: string, props: Record<string, unknown> = {}): Promise<string> {
    const fn = await this.compileFile(name);
    return await (fn(props, {}) as unknown as Promise<string>);
  }

  async renderAsync(name: string, props: Record<string, unknown> = {}): Promise<string> {
    return this.render(name, props);
  }

  loadComponent(name: string, template: string): void {
    // Compile it and store it. Since it's async, it will be added to globalComponents once done.
    // If it's used before it's finished, the resolution will wait for it if we use a promise registry.
    this.globalComponents[name] = this.compileString(template);
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

  private async compileString(template: string, basePath: string = ''): Promise<RenderFunction> {
    const cacheKey = this.cache ? await hashTemplate(template) : null;
    if (this.cache && cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    const parseResult = parse(template);
    if (!parseResult.ok) {
      throw new Error(`ParseError: ${parseResult.error.message}`);
    }

    const fn = await this._compileAST(parseResult.ast, basePath);

    if (this.cache && cacheKey) {
      this.cache.set(cacheKey, fn);
    }

    return fn;
  }

  private async compileFile(name: string): Promise<RenderFunction> {
    if (this.cache) {
      const cached = this.cache.get(name);
      if (cached) return cached;
    }

    const content = await this.options.readFile!(name);
    const parseResult = parse(content);
    if (!parseResult.ok) {
      throw new Error(`ParseError in ${name}: ${parseResult.error.message}`);
    }

    const fn = await this._compileAST(parseResult.ast, name);

    if (this.cache) {
      this.cache.set(name, fn);
    }

    return fn;
  }

  private async _compileAST(ast: TemplateAST, basePath: string): Promise<RenderFunction> {
    const components: Record<string, RenderFunction> = {};
    for (const [name, fn] of Object.entries(this.globalComponents)) {
      components[name] = await fn;
    }

    if (ast.imports.length > 0) {
      const resolved = await this._resolveComponents(ast.imports, basePath);
      Object.assign(components, resolved);
    }

    const result = compileAST(ast, {
      components,
      varName: this.options.varName,
      autoEscape: this.options.autoEscape,
      autoFilter: this.options.autoFilter,
      filterFunction: this.options.filterFunction,
      debug: this.options.debug,
    });

    if (!result.ok) {
      throw new Error(`CompileError: ${result.error.message}`);
    }

    return result.fn;
  }

  private async _resolveComponents(
    imports: ComponentImport[],
    basePath: string,
    inProgress: Set<string> = new Set()
  ): Promise<Record<string, RenderFunction>> {
    const components: Record<string, RenderFunction> = {};

    for (const imp of imports) {
      if (this.globalComponents[imp.localName]) {
        components[imp.localName] = await this.globalComponents[imp.localName];
        continue;
      }

      const resolvedPath = await this.options.resolvePath!(basePath, imp.specifier);

      if (inProgress.has(resolvedPath as string)) {
        throw new Error(`Circular dependency: ${[...inProgress, resolvedPath].join(' -> ')}`);
      }

      const source = await this.options.readFile!(resolvedPath as string);
      const parseResult = parse(source);
      if (!parseResult.ok) {
        throw new Error(`ParseError in ${imp.specifier}: ${parseResult.error.message}`);
      }

      const childInProgress = new Set([...inProgress, resolvedPath as string]);
      const childComponents = await this._resolveComponents(
        parseResult.ast.imports,
        resolvedPath as string,
        childInProgress
      );

      const resolvedChildComponents: Record<string, RenderFunction> = {};
      for (const [name, fn] of Object.entries(this.globalComponents)) {
        resolvedChildComponents[name] = await fn;
      }

      const compileResult = compileAST(parseResult.ast, {
        components: { ...resolvedChildComponents, ...childComponents },
        varName: this.options.varName,
        autoEscape: this.options.autoEscape,
        autoFilter: this.options.autoFilter,
        filterFunction: this.options.filterFunction,
        debug: this.options.debug,
      });

      if (!compileResult.ok) {
        throw new Error(`CompileError in ${imp.specifier}: ${compileResult.error.message}`);
      }

      components[imp.localName] = compileResult.fn;
    }

    return components;
  }
}
