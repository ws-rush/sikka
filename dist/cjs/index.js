"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sikka = exports.SikkaError = void 0;
const parser_js_1 = require("./parser.js");
const compiler_js_1 = require("./compiler.js");
const cache_js_1 = require("./cache.js");
const error_js_1 = require("./error.js");
const runtime_js_1 = require("./runtime.js");
const template_resolution_js_1 = require("./template-resolution.js");
var error_js_2 = require("./error.js");
Object.defineProperty(exports, "SikkaError", { enumerable: true, get: function () { return error_js_2.SikkaError; } });
const EMPTY_SLOTS = {};
function createTemplateCaches(options) {
    const cache = templateCacheFor(options);
    return { cache, streamCache: cache ? (0, cache_js_1.createCache)(options.cacheSize) : null };
}
function templateCacheFor(options) {
    if (cacheIsEnabled(options))
        return (0, cache_js_1.createCache)(options.cacheSize);
    return typeof options.cache === 'object' ? options.cache : null;
}
function cacheIsEnabled(options) {
    return options.cache === true || (options.cache === undefined && Boolean(options.cacheSize));
}
function invalidateCache(cache, key) {
    if (!cache)
        return;
    if (key !== undefined)
        cache.delete(key);
    else
        cache.clear();
}
function sourceTemplateRecord(value) {
    return value && typeof value === 'object' ? value : undefined;
}
function isPrecompiledModule(value) {
    const module = sourceTemplateRecord(value);
    return !!module && typeof module.render === 'function' && typeof module.stream === 'function';
}
function isAsyncIterable(value) {
    return !!value && typeof value[Symbol.asyncIterator] === 'function';
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function validateRuntimeOptions(options) {
    if (!options || !isRuntimeMode(options.mode))
        throw new Error("Sikka requires mode: 'source' or 'precompiled'");
    if (typeof options.resolver !== 'function')
        throw new Error(`${runtimeModeLabel(options)} mode requires a synchronous resolver`);
}
function runtimeModeLabel(options) {
    return options.mode === 'source' ? 'Source' : 'Precompiled';
}
function isRuntimeMode(mode) {
    return mode === 'source' || mode === 'precompiled';
}
class Sikka {
    options;
    cache;
    streamCache;
    modules = new Map();
    renders = new Map();
    lastEntry;
    lastRender;
    constructor(options) {
        this.options = options;
        validateRuntimeOptions(options);
        (0, runtime_js_1.bindRuntime)(this, (0, runtime_js_1.runtime)(options));
        this.render = options.mode === 'precompiled' ? this.renderPrecompiled : this.renderSource;
        const caches = createTemplateCaches(options);
        this.cache = caches.cache;
        this.streamCache = caches.streamCache;
    }
    /** Renders an entry Template with Props. */
    render(entry, props = {}) {
        return this.renderSource(entry, props);
    }
    renderSource(entry, props) {
        return this.compileSource(this.resolveSource(entry), compiler_js_1.compile, this.cache).renderSync(props, EMPTY_SLOTS);
    }
    /** Streams an entry Template with Props. */
    stream(entry, props = {}) {
        if (this.options.mode === 'precompiled')
            return this.streamPrecompiled(entry, props);
        return this.compileSource(this.resolveSource(entry), compiler_js_1.compileStreaming, this.streamCache)(props, {});
    }
    /** Invalidates one canonical Template identity, or both compilation caches. */
    invalidate(id) {
        invalidateCache(this.cache, id);
        invalidateCache(this.streamCache, id);
        if (id !== undefined) {
            this.modules.delete(id);
            this.renders.delete(id);
            if (this.lastEntry === id)
                this.lastEntry = this.lastRender = undefined;
        }
        else {
            this.modules.clear();
            this.renders.clear();
            this.lastEntry = this.lastRender = undefined;
        }
    }
    compileSource(template, compiler, cache) {
        return this.compileSourceTemplate(template, new Set([template.id]), new Map(), compiler, cache);
    }
    resolveSourceComponents(imports, importer, ancestors, compiled, compiler, cache) {
        const components = {};
        for (const { localName, specifier } of imports) {
            const template = this.resolveSource(specifier, importer);
            if (ancestors.has(template.id))
                this.throwSourceCycle(specifier, importer, ancestors, template.id);
            components[localName] = this.compileSourceTemplate(template, new Set([...ancestors, template.id]), compiled, compiler, cache);
        }
        return components;
    }
    compileSourceTemplate(template, ancestors, compiled, compiler, cache) {
        const known = compiled.get(template.id) ?? cache?.get(template.id);
        if (known)
            return known;
        const ast = this.parseTemplate(template.source, template.id);
        this.throwUnsupportedFrontmatterImport(ast.imports, template.id);
        const result = compiler(ast, {
            ...this.options,
            components: this.resolveSourceComponents(ast.imports, template.id, ancestors, compiled, compiler, cache),
            streamComponents: compiler === compiler_js_1.compileStreaming,
            templateId: template.id,
        });
        if (!result.ok)
            throw new error_js_1.SikkaError(`CompileError in ${template.id}: ${result.error.message}`, {
                ...result.error,
                template: template.id,
            });
        cache?.set(template.id, result.fn);
        compiled.set(template.id, result.fn);
        return result.fn;
    }
    throwUnsupportedFrontmatterImport(imports, templateId) {
        const error = (0, compiler_js_1.unsupportedFrontmatterImport)(imports, templateId);
        if (error)
            throw new error_js_1.SikkaError(`CompileError in ${templateId}: ${error.message}`, {
                ...error,
                template: templateId,
            });
    }
    throwSourceCycle(request, importer, ancestors, identity) {
        throw new error_js_1.SikkaError(`ResolveError for ${JSON.stringify(request)} imported by canonical identity ${JSON.stringify(importer)}: ` +
            `circular component dependency ${[...ancestors, identity].join(' → ')}`, { category: 'Resolve', request, importer, template: identity });
    }
    renderPrecompiled(entry, props) {
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
            throw new Error(`PrecompiledError for entry ${JSON.stringify(entry)}: generated render() must return HTML synchronously`);
        return html;
    }
    streamPrecompiled(entry, props) {
        const stream = this.resolvePrecompiled(entry).stream.call(this, props, {});
        if (!isAsyncIterable(stream))
            throw new Error(`PrecompiledError for entry ${JSON.stringify(entry)}: generated stream() must return an async iterable`);
        return stream;
    }
    resolvePrecompiled(entry) {
        const cached = this.modules.get(entry);
        if (cached)
            return cached;
        const module = this.loadPrecompiled(entry);
        if (module == null)
            throw this.missingPrecompiledModule(entry);
        if (!isPrecompiledModule(module))
            throw this.invalidPrecompiledModule(entry);
        this.modules.set(entry, module);
        return module;
    }
    loadPrecompiled(entry) {
        try {
            return this.options.resolver(entry);
        }
        catch (error) {
            throw new error_js_1.SikkaError(`ResolveError for precompiled entry ${JSON.stringify(entry)}: ${errorMessage(error)}`, { category: 'Resolve', request: entry, cause: error });
        }
    }
    missingPrecompiledModule(entry) {
        return new error_js_1.SikkaError(`ResolveError for precompiled entry ${JSON.stringify(entry)}: resolver returned no loaded module`, { category: 'Resolve', request: entry });
    }
    invalidPrecompiledModule(entry) {
        return new error_js_1.SikkaError(`PrecompiledError for entry ${JSON.stringify(entry)}: invalid generated module ABI; ` +
            'expected named render() and stream() exports', { category: 'Render', request: entry });
    }
    resolveSource(request, importer) {
        return (0, template_resolution_js_1.resolveSourceTemplate)(request, this.options.resolver, importer);
    }
    parseTemplate(source, template) {
        const result = (0, parser_js_1.parse)(source);
        if (result.ok)
            return result.ast;
        throw new error_js_1.SikkaError(`ParseError${template ? ` in ${template}` : ''}: ${result.error.message}`, {
            ...result.error,
            template,
        });
    }
}
exports.Sikka = Sikka;
//# sourceMappingURL=index.js.map