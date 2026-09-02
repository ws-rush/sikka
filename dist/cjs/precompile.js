"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRECOMPILE_ABI_VERSION = void 0;
exports.emitModule = emitModule;
exports.compile = compile;
const compiler_js_1 = require("./compiler.js");
const parser_js_1 = require("./parser.js");
const error_js_1 = require("./error.js");
const template_resolution_js_1 = require("./template-resolution.js");
/** The portable precompile-artifact ABI version. */
exports.PRECOMPILE_ABI_VERSION = 3;
/** Emits one precompile artifact as a complete static ESM module. */
function emitModule(artifact, options = {}) {
    if (artifact.abiVersion !== exports.PRECOMPILE_ABI_VERSION)
        throw new Error(`Unsupported precompile artifact ABI ${String(artifact.abiVersion)}; expected ${exports.PRECOMPILE_ABI_VERSION}`);
    const runtimeSpecifier = options.runtimeSpecifier ?? 'sikka/runtime';
    if (!runtimeSpecifier)
        throw new Error('emitModule requires a non-empty runtimeSpecifier');
    const components = artifact.components.map((component, index) => {
        const specifier = options.componentSpecifier?.(component);
        if (!specifier)
            throw new Error(`emitModule requires a componentSpecifier for ${JSON.stringify(component.id)} imported by ${JSON.stringify(artifact.id)}`);
        return {
            ...component,
            specifier,
            render: `__component_${index}_render`,
            stream: `__component_${index}_stream`,
        };
    });
    const imports = components
        .map(({ specifier, render, stream }) => `import { render as ${render}, stream as ${stream} } from ${JSON.stringify(specifier)};`)
        .join('\n');
    const regularComponents = components.map(({ localName, render }) => `${JSON.stringify(localName)}: ${render}`);
    const streamingComponents = components.map(({ localName, stream }) => `${JSON.stringify(localName)}: ${stream}`);
    const helpers = 'const { escape: __escape, expression: __expression, RawHtml: __RawHtml, classList: __classList, styleObject: __styleObject, filter: __filter, autoFilter: __autoFilter, aggregateAssets: __aggregateAssets } = runtime(this);';
    return `import { runtime } from ${JSON.stringify(runtimeSpecifier)};
${imports}
export function render(props, slots = {}) {
  ${helpers}
  const __components = { ${regularComponents.join(', ')} };
${artifact.renderString}
}
export async function* stream(props, slots = {}) {
  ${helpers}
  const __components = { ${streamingComponents.join(', ')} };
${artifact.streamString}
}`;
}
/**
 * Compiles one or more entries and their Frontmatter-imported Component graph
 * into portable artifacts without constructing Sikka or evaluating generated source.
 */
function compile(entries, options) {
    const requests = typeof entries === 'string' ? [entries] : entries;
    if (requests.length === 0)
        throw new error_js_1.SikkaError('GraphError: expected at least one entry request', {
            category: 'Resolve',
        });
    const artifacts = new Map();
    const visiting = [];
    for (const request of requests)
        visit(request, undefined, options.resolver, artifacts, visiting);
    return [...artifacts.values()];
}
function visit(request, importer, resolver, artifacts, visiting) {
    const template = (0, template_resolution_js_1.resolveSourceTemplate)(request, resolver, importer);
    const known = artifacts.get(template.id);
    if (known)
        return known;
    if (visiting.includes(template.id))
        throw cycleError(request, importer, visiting, template.id);
    visiting.push(template.id);
    try {
        const parsed = (0, parser_js_1.parse)(template.source);
        if (!parsed.ok)
            throw new error_js_1.SikkaError(`ParseError in ${template.id}: ${parsed.error.message}`, {
                ...parsed.error,
                template: template.id,
            });
        const compiled = (0, compiler_js_1.compileSources)(parsed.ast, template.id);
        if (!compiled.ok)
            throw new error_js_1.SikkaError(`CompileError in ${template.id}: ${compiled.error.message}`, {
                ...compiled.error,
                template: template.id,
            });
        const components = parsed.ast.imports.map(({ localName, specifier }) => {
            const component = visit(specifier, template.id, resolver, artifacts, visiting);
            return { localName, specifier, id: component.id };
        });
        const artifact = {
            abiVersion: exports.PRECOMPILE_ABI_VERSION,
            id: template.id,
            renderString: compiled.renderString,
            streamString: compiled.streamString,
            components,
        };
        artifacts.set(template.id, artifact);
        return artifact;
    }
    finally {
        visiting.pop();
    }
}
function cycleError(request, importer, visiting, identity) {
    const context = importer ? ` imported by canonical identity ${JSON.stringify(importer)}` : '';
    const start = visiting.indexOf(identity);
    const cycle = [...visiting.slice(start), identity];
    return new error_js_1.SikkaError(`ResolveError for ${JSON.stringify(request)}${context}: circular component dependency ${cycle.join(' → ')}`, { category: 'Resolve', request, importer, template: identity });
}
//# sourceMappingURL=precompile.js.map