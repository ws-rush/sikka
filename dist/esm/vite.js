import { compileSources } from './compiler.js';
import { SikkaError } from './error.js';
import { parse } from './parser.js';
import { emitModule, PRECOMPILE_ABI_VERSION } from './precompile.js';
/** Compiles a single `.sikka` template source into a static ESM module string for Vite. */
export function compileViteModule(source, id, options = {}) {
    const parsed = parse(source);
    if (!parsed.ok) {
        throw new SikkaError(`ParseError in ${id}: ${parsed.error.message}`, {
            ...parsed.error,
            template: id,
        });
    }
    const compiled = compileSources(parsed.ast, id);
    if (!compiled.ok) {
        throw new SikkaError(`CompileError in ${id}: ${compiled.error.message}`, {
            ...compiled.error,
            template: id,
        });
    }
    const artifact = {
        abiVersion: PRECOMPILE_ABI_VERSION,
        id,
        renderString: compiled.renderString,
        streamString: compiled.streamString,
        components: parsed.ast.imports.map(({ localName, specifier }) => ({
            localName,
            specifier,
            id: specifier,
        })),
    };
    return emitModule(artifact, {
        runtimeSpecifier: options.runtimeSpecifier,
        componentSpecifier: (component) => component.specifier,
    });
}
/** Vite plugin that precompiles `.sikka` templates into static ESM modules. */
export function sikka(options = {}) {
    return {
        name: 'sikka',
        transform(code, id) {
            const cleanId = id.split('?', 1)[0] ?? id;
            if (!cleanId.endsWith('.sikka'))
                return null;
            return {
                code: compileViteModule(code, cleanId, options),
                map: null,
            };
        },
    };
}
export default sikka;
//# sourceMappingURL=vite.js.map