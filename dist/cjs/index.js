import { parse } from './parser.js';
import { compile } from './compiler.js';
import { createCache } from './cache.js';
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
    renderString(template, props = {}) {
        const fn = this.compileString(template);
        return fn.renderSync(props, {});
    }
    render(name, props = {}) {
        const fn = this.compileFile(name);
        return fn.renderSync(props, {});
    }
    loadComponent(name, template) {
        this.globalComponents[name] = this.compileString(template);
    }
    registerComponent(name, fn) {
        this.globalComponents[name] = fn;
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
    compileString(template, basePath = '') {
        if (this.cache) {
            const cached = this.cache.get(template);
            if (cached)
                return cached;
        }
        const parseResult = parse(template);
        if (!parseResult.ok) {
            throw new Error(`ParseError: ${parseResult.error.message}`);
        }
        const result = compile(parseResult.ast, {
            ...this.options,
            components: this.globalComponents,
            basePath,
            fileReader: this.options.readFile,
        });
        if (!result.ok) {
            throw new Error(`CompileError: ${result.error.message}`);
        }
        if (this.cache) {
            this.cache.set(template, result.fn);
        }
        return result.fn;
    }
    compileFile(name) {
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
        const content = this.options.readFile(fullPath);
        if (content === undefined || content === null) {
            throw new Error(`Could not read file: ${fullPath}`);
        }
        const parseResult = parse(content);
        if (!parseResult.ok) {
            throw new Error(`ParseError in ${fullPath}: ${parseResult.error.message}`);
        }
        const result = compile(parseResult.ast, {
            ...this.options,
            components: this.globalComponents,
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