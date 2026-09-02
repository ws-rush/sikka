"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sikka = exports.SikkaError = void 0;
const parser_js_1 = require("./parser.js");
const compiler_js_1 = require("./compiler.js");
const cache_js_1 = require("./cache.js");
const error_js_1 = require("./error.js");
var error_js_2 = require("./error.js");
Object.defineProperty(exports, "SikkaError", { enumerable: true, get: function () { return error_js_2.SikkaError; } });
function createTemplateCaches(options) {
    const cache = templateCacheFor(options);
    return { cache, streamCache: cache ? (0, cache_js_1.createCache)(options.cacheSize) : null };
}
function templateCacheFor(options) {
    if (options.cache === true || (options.cache === undefined && Boolean(options.cacheSize)))
        return (0, cache_js_1.createCache)(options.cacheSize);
    return typeof options.cache === 'object' ? options.cache : null;
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
function isTemplateIdentity(value) {
    return typeof value === 'string' && value.length > 0;
}
function isSourceTemplate(value) {
    const template = sourceTemplateRecord(value);
    return !!template && isTemplateIdentity(template.id) && typeof template.source === 'string';
}
function isPrecompiledModule(value) {
    const module = sourceTemplateRecord(value);
    return !!module && typeof module.render === 'function' && typeof module.stream === 'function';
}
function isAsyncIterable(value) {
    return !!value && typeof value[Symbol.asyncIterator] === 'function';
}
function sourceIdentity(value) {
    const template = sourceTemplateRecord(value);
    return template && typeof template.id === 'string' ? template.id : undefined;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
class Sikka {
    options;
    cache;
    streamCache;
    constructor(options) {
        this.options = options;
        if (options?.mode !== 'source' && options?.mode !== 'precompiled')
            throw new Error("Sikka requires mode: 'source' or 'precompiled'");
        if (typeof options.resolver !== 'function')
            throw new Error(`${options.mode === 'source' ? 'Source' : 'Precompiled'} mode requires a synchronous resolver`);
        const caches = createTemplateCaches(options);
        this.cache = caches.cache;
        this.streamCache = caches.streamCache;
    }
    /** Renders an entry Template with Props. */
    render(entry, props = {}) {
        if (this.options.mode === 'precompiled')
            return this.renderPrecompiled(entry, props);
        return this.compileSource(this.resolveSource(entry), compiler_js_1.compile, this.cache).renderSync(props, {});
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
            basePath: template.id,
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
        const html = this.resolvePrecompiled(entry).render.call(this, props, {});
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
        let module;
        try {
            module = this.options.resolver(entry);
        }
        catch (error) {
            throw new error_js_1.SikkaError(`ResolveError for precompiled entry ${JSON.stringify(entry)}: ${errorMessage(error)}`, { category: 'Resolve', request: entry, cause: error });
        }
        if (module === undefined || module === null)
            throw new error_js_1.SikkaError(`ResolveError for precompiled entry ${JSON.stringify(entry)}: resolver returned no loaded module`, { category: 'Resolve', request: entry });
        if (!isPrecompiledModule(module))
            throw new error_js_1.SikkaError(`PrecompiledError for entry ${JSON.stringify(entry)}: invalid generated module ABI; ` +
                'expected named render() and stream() exports', { category: 'Render', request: entry });
        return module;
    }
    resolveSource(request, importer) {
        const context = importer ? ` imported by canonical identity ${JSON.stringify(importer)}` : '';
        let template;
        try {
            template = this.options.resolver(request, importer);
        }
        catch (error) {
            throw new error_js_1.SikkaError(`ResolveError for ${JSON.stringify(request)}${context}: ${errorMessage(error)}`, { category: 'Resolve', request, importer, cause: error });
        }
        if (!isSourceTemplate(template)) {
            const identity = sourceIdentity(template);
            const suffix = identity ? ` (canonical identity ${JSON.stringify(identity)})` : '';
            throw new error_js_1.SikkaError(`ResolveError: invalid result for ${JSON.stringify(request)}${context}${suffix}`, {
                category: 'Resolve',
                request,
                importer,
                template: identity,
            });
        }
        return template;
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