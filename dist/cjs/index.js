import { parse } from './parser.js';
import { compileAST } from './compiler.js';
import { createCache, hashTemplate } from './cache.js';
export { compile, compileAST, resolveComponents } from './compiler.js';
export { TemplateEngineError, LoadError, RenderError } from './types.js';
export { escapeHtml, html, RawHtml } from './escape.js';
export class Engine {
    options;
    cache;
    globalComponents = {};
    constructor(options = {}) {
        this.options = options;
        this.cache = options.cache ? createCache(options.cacheSize) : null;
    }
    async renderString(template, props = {}) {
        const fn = await this.compileString(template);
        return await fn(props, {});
    }
    async renderStringAsync(template, props = {}) {
        return this.renderString(template, props);
    }
    async render(name, props = {}) {
        const fn = await this.compileFile(name);
        return await fn(props, {});
    }
    async renderAsync(name, props = {}) {
        return this.render(name, props);
    }
    loadComponent(name, template) {
        // Compile it and store it. Since it's async, it will be added to globalComponents once done.
        // If it's used before it's finished, the resolution will wait for it if we use a promise registry.
        this.globalComponents[name] = this.compileString(template);
    }
    invalidate(key) {
        if (this.cache) {
            if (key !== undefined) {
                this.cache.delete(key);
            }
            else {
                this.cache.clear();
            }
        }
    }
    async compileString(template, basePath = '') {
        const cacheKey = this.cache ? await hashTemplate(template) : null;
        if (this.cache && cacheKey) {
            const cached = this.cache.get(cacheKey);
            if (cached)
                return cached;
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
    async compileFile(name) {
        if (this.cache) {
            const cached = this.cache.get(name);
            if (cached)
                return cached;
        }
        const content = await this.options.readFile(name);
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
    async _compileAST(ast, basePath) {
        const components = {};
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
    async _resolveComponents(imports, basePath, inProgress = new Set()) {
        const components = {};
        for (const imp of imports) {
            if (this.globalComponents[imp.localName]) {
                components[imp.localName] = await this.globalComponents[imp.localName];
                continue;
            }
            const resolvedPath = await this.options.resolvePath(basePath, imp.specifier);
            if (inProgress.has(resolvedPath)) {
                throw new Error(`Circular dependency: ${[...inProgress, resolvedPath].join(' -> ')}`);
            }
            const source = await this.options.readFile(resolvedPath);
            const parseResult = parse(source);
            if (!parseResult.ok) {
                throw new Error(`ParseError in ${imp.specifier}: ${parseResult.error.message}`);
            }
            const childInProgress = new Set([...inProgress, resolvedPath]);
            const childComponents = await this._resolveComponents(parseResult.ast.imports, resolvedPath, childInProgress);
            const resolvedChildComponents = {};
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
//# sourceMappingURL=index.js.map