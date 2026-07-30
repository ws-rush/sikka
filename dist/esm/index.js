import { parse } from './parser.js';
import { compile as internalCompile, compileStreaming as internalCompileStreaming, } from './compiler.js';
import { createCache } from './cache.js';
function createTemplateCaches(options) {
    const cache = templateCacheFor(options);
    return { cache, streamCache: cache ? createCache(options.cacheSize) : null };
}
function templateCacheFor(options) {
    if (cachingIsEnabled(options))
        return createCache(options.cacheSize);
    return suppliedCache(options);
}
function cachingIsEnabled(options) {
    return options.cache === true || cacheSizeEnablesCaching(options);
}
function cacheSizeEnablesCaching(options) {
    return options.cache === undefined && Boolean(options.cacheSize);
}
function suppliedCache(options) {
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
export class Sikka {
    options;
    cache;
    streamCache;
    globalComponents = {};
    constructor(options = {}) {
        this.options = options;
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
    renderString(template, props = {}) {
        const fn = this.compileString(template);
        return fn.renderSync(props, {});
    }
    /**
     * Renders a template file from the configured views directory.
     *
     * @param name - The path or name of the template file.
     * @param props - Data object to pass as `Astro.props`.
     */
    render(name, props = {}) {
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
    streamString(template, props = {}) {
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
    stream(name, props = {}) {
        const fn = this.compileStreamingFile(name);
        return fn(props, {});
    }
    /**
     * Pre-loads and compiles a component for use in other templates.
     */
    loadComponent(name, template) {
        this.globalComponents[name] = this.compileString(template);
    }
    /**
     * Registers a pre-compiled render function as a global component.
     */
    registerComponent(name, fn) {
        this.globalComponents[name] = fn;
    }
    /**
     * Invalidates the template cache.
     * @param key - Optional specific key to remove. If omitted, the entire cache is cleared.
     */
    invalidate(key) {
        invalidateCache(this.cache, key);
        invalidateCache(this.streamCache, key);
    }
    /**
     * Compiles a template string into a render function.
     *
     * @param str - The template content.
     * @param config - Optional configuration overrides for this compilation.
     */
    compile(str, config) {
        return this.compileString(str, '', config);
    }
    /**
     * Compiles a template string to its JavaScript function body string.
     *
     * @param str - The template content.
     * @param config - Optional configuration overrides for this compilation.
     */
    compileToString(str, config) {
        const result = internalCompile(this.parseTemplate(str), {
            ...(config || this.options),
            components: this.globalComponents,
        });
        if (!result.ok) {
            throw new Error(`CompileError: ${result.error.message}`);
        }
        return result.source;
    }
    compileString(template, basePath = '', config) {
        const options = config || this.options;
        return this.compileTemplate(() => template, template, basePath, options, internalCompile, config ? null : this.cache);
    }
    compileFile(name) {
        const fullPath = this.resolveTemplatePath(name);
        return this.compileTemplate(() => this.readTemplateFile(fullPath, 'render'), fullPath, fullPath, this.options, internalCompile, this.cache, fullPath);
    }
    compileStreamingString(template, basePath = '') {
        return this.compileTemplate(() => template, template, basePath, this.options, internalCompileStreaming, this.streamCache);
    }
    compileStreamingFile(name) {
        const fullPath = this.resolveTemplatePath(name);
        return this.compileTemplate(() => this.readTemplateFile(fullPath, 'stream'), fullPath, fullPath, this.options, internalCompileStreaming, this.streamCache, fullPath);
    }
    compileTemplate(loadSource, cacheKey, basePath, options, compiler, cache, location) {
        const cached = cache?.get(cacheKey);
        if (cached)
            return cached;
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
        cache?.set(cacheKey, result.fn);
        return result.fn;
    }
    parseTemplate(source, location) {
        const result = parse(source);
        if (result.ok)
            return result.ast;
        const suffix = location ? ` in ${location}` : '';
        throw new Error(`ParseError${suffix}: ${result.error.message}`);
    }
    resolveTemplatePath(name) {
        return this.options.views && !name.startsWith('/') && !name.includes(':')
            ? `${this.options.views}/${name}`.replace(/\/+/g, '/')
            : name;
    }
    readTemplateFile(path, method) {
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
//# sourceMappingURL=index.js.map