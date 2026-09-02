import type { SourceResolver } from './types.js';
/** The portable precompile-artifact ABI version. */
export declare const PRECOMPILE_ABI_VERSION = 3;
/** A direct Frontmatter Component edge in a precompile artifact. */
export interface PrecompileComponentEdge {
    /** The Component identifier used by the importing Template. */
    localName: string;
    /** The Component request from the importing Template's Frontmatter. */
    specifier: string;
    /** Canonical identity of the imported Component Template. */
    id: string;
}
/**
 * The versioned, host-owned output of compiling one Template.
 *
 * `renderString` and `streamString` are function bodies, not executable code.
 * Pass the artifact to `emitModule` to generate static ESM. The build host
 * chooses output paths and import specifiers; this module never accesses storage.
 */
export interface PrecompileArtifact {
    abiVersion: typeof PRECOMPILE_ABI_VERSION;
    /** Canonical Template identity returned by the source resolver. */
    id: string;
    /** Regular Render function body. */
    renderString: string;
    /** Distinct Streaming render async-generator function body. */
    streamString: string;
    /** Direct Component imports and their canonical targets. */
    components: PrecompileComponentEdge[];
}
/** Options for the standalone synchronous precompiler. */
export interface PrecompileOptions {
    /** Resolves entries and Component imports using Sikka's shared source contract. */
    resolver: SourceResolver;
}
/** Host-specific import specifiers for an emitted ESM module. */
export interface EmitModuleOptions {
    /** Import specifier for `sikka/runtime`; defaults to the package export. */
    runtimeSpecifier?: string;
    /** Maps each Component edge to its emitted ESM import specifier. */
    componentSpecifier?: (component: PrecompileComponentEdge) => string;
}
/** Emits one precompile artifact as a complete static ESM module. */
export declare function emitModule(artifact: PrecompileArtifact, options?: EmitModuleOptions): string;
/**
 * Compiles one or more entries and their Frontmatter-imported Component graph
 * into portable artifacts without constructing Sikka or evaluating generated source.
 */
export declare function compile(entries: string | readonly string[], options: PrecompileOptions): PrecompileArtifact[];
//# sourceMappingURL=precompile.d.ts.map