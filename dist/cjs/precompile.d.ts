import type { SourceResolver } from './types.js';
/** The portable precompile-artifact ABI version. */
export declare const PRECOMPILE_ABI_VERSION = 2;
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
 * A build host wraps them in static ESM, chooses output paths, and links the
 * recorded Component edges. This compiler never reads or writes host storage.
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
/**
 * Compiles one or more entries and their Frontmatter-imported Component graph
 * into portable artifacts without constructing Sikka or evaluating generated source.
 */
export declare function compile(entries: string | readonly string[], options: PrecompileOptions): PrecompileArtifact[];
