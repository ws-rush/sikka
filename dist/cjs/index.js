import { parse } from './parser.js';
import { compile } from './compiler.js';
import { createCache, hashTemplate } from './cache.js';
export class Engine {
    options;
    cache;
    globalComponents = {};
    constructor(options = {}) {
        this.options = options;
        if (options.cache === true || (options.cache === undefined && options.cacheSize)) {
            this.cache = createCache(options.cacheSize);
        }
        else if (typeof options.cache === 'object') {
            this.cache = options.cache;
        }
        else {
            this.cache = null;
        }
    }
    async renderString(template, props = {}) {
        const fn = await this.compileString(template);
        return await fn.render(props, {});
    }
    async renderStringFull(template, props = {}) {
        const fn = await this.compileString(template);
        const scripts = [];
        const styles = [];
        let html = '';
        for await (const chunk of fn.stream(props, {})) {
            if (typeof chunk === 'string') {
                html += chunk;
            }
            else if (chunk.type === 'script') {
                scripts.push(this.formatAsset(chunk));
            }
            else if (chunk.type === 'style') {
                styles.push(this.formatAsset(chunk));
            }
        }
        return { html, scripts, styles };
    }
    async renderStringAsync(template, props = {}) {
        return this.renderString(template, props);
    }
    async *renderStringStream(template, props = {}) {
        const fn = await this.compileString(template);
        yield* fn.stream(props, {});
    }
    async render(name, props = {}) {
        const fn = await this.compileFile(name);
        return await fn.render(props, {});
    }
    async renderFull(name, props = {}) {
        const fn = await this.compileFile(name);
        const scripts = [];
        const styles = [];
        let html = '';
        for await (const chunk of fn.stream(props, {})) {
            if (typeof chunk === 'string') {
                html += chunk;
            }
            else if (chunk.type === 'script') {
                scripts.push(this.formatAsset(chunk));
            }
            else if (chunk.type === 'style') {
                styles.push(this.formatAsset(chunk));
            }
        }
        return { html, scripts, styles };
    }
    async renderAsync(name, props = {}) {
        return this.render(name, props);
    }
    async *renderStream(name, props = {}) {
        const fn = await this.compileFile(name);
        yield* fn.stream(props, {});
    }
    formatAsset(asset) {
        const tag = asset.type;
        let attrs = '';
        for (const attr of asset.attrs) {
            if ('type' in attr) {
                // Spread not supported here yet or handled during compile?
                // Actually asset aggregation usually happens after attributes are evaluated.
            }
            else {
                if (attr.value === true)
                    attrs += ` ${attr.name}`;
                else
                    attrs += ` ${attr.name}="${attr.value}"`;
            }
        }
        return `<${tag}${attrs}>${asset.content}</${tag}>`;
    }
    loadComponent(name, template) {
        this.globalComponents[name] = this.compileString(template);
    }
    registerComponent(name, fn) {
        if (typeof fn === 'function') {
            const wrapped = fn;
            if (!wrapped.render) {
                wrapped.render = async (props, slots) => {
                    let out = '';
                    for await (const chunk of wrapped.stream(props, slots)) {
                        if (typeof chunk === 'string')
                            out += chunk;
                    }
                    return out;
                };
            }
            if (!wrapped.stream) {
                wrapped.stream = async function* (props, slots) {
                    yield await wrapped.render(props, slots);
                };
            }
            this.globalComponents[name] = wrapped;
        }
        else {
            this.globalComponents[name] = fn;
        }
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
        const resolvedComponents = {};
        for (const [name, fnOrPromise] of Object.entries(this.globalComponents)) {
            resolvedComponents[name] = await fnOrPromise;
        }
        const result = await compile(parseResult.ast, {
            ...this.options,
            components: resolvedComponents,
            basePath,
            fileReader: this.options.readFile,
        });
        if (!result.ok) {
            throw new Error(`CompileError: ${result.error.message}`);
        }
        if (this.cache && cacheKey) {
            this.cache.set(cacheKey, result.fn);
        }
        return result.fn;
    }
    async compileFile(name) {
        const fullPath = this.options.views && !name.startsWith('/') && !name.includes(':')
            ? `${this.options.views}/${name}`.replace(/\/+/g, '/')
            : name;
        if (this.cache) {
            const cached = this.cache.get(fullPath);
            if (cached)
                return cached;
        }
        if (!this.options.readFile) {
            throw new Error('Engine.render() requires options.readFile to be configured');
        }
        const content = await this.options.readFile(fullPath);
        if (content === undefined || content === null) {
            throw new Error(`Could not read file: ${fullPath}`);
        }
        const parseResult = parse(content);
        if (!parseResult.ok) {
            throw new Error(`ParseError in ${fullPath}: ${parseResult.error.message}`);
        }
        const resolvedComponents = {};
        for (const [name, fnOrPromise] of Object.entries(this.globalComponents)) {
            resolvedComponents[name] = await fnOrPromise;
        }
        const result = await compile(parseResult.ast, {
            ...this.options,
            components: resolvedComponents,
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
}
//# sourceMappingURL=index.js.map