import { compileSources } from './compiler.js';
import { parse } from './parser.js';
import type { SourceResolver, SourceTemplate } from './types.js';

/** The portable precompile-artifact ABI version. */
export const PRECOMPILE_ABI_VERSION = 1;

/** A direct Frontmatter Component edge in a precompile artifact. */
export interface PrecompileComponentEdge {
  /** The Component identifier used by the importing Template. */
  localName: string;
  /** The Component request from the importing Template's Frontmatter. */
  specifier: string;
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
  /** Direct Component imports. Graph traversal is intentionally host-owned for now. */
  components: PrecompileComponentEdge[];
}

/** Options for the standalone synchronous precompiler. */
export interface PrecompileOptions {
  /** Resolves the one entry Template using Sikka's shared source contract. */
  resolver: SourceResolver;
}

/**
 * Compiles one resolved Template into a portable artifact without constructing
 * Sikka or evaluating generated source.
 */
export function compile(entry: string, options: PrecompileOptions): PrecompileArtifact {
  const template = resolve(entry, options.resolver);
  const parsed = parse(template.source);
  if (!parsed.ok) throw new Error(`ParseError in ${template.id}: ${parsed.error.message}`);

  const compiled = compileSources(parsed.ast);
  if (!compiled.ok) throw new Error(`CompileError in ${template.id}: ${compiled.error.message}`);

  return {
    abiVersion: PRECOMPILE_ABI_VERSION,
    id: template.id,
    renderString: compiled.renderString,
    streamString: compiled.streamString,
    components: parsed.ast.imports.map(({ localName, specifier }) => ({ localName, specifier })),
  };
}

function resolve(request: string, resolver: SourceResolver): SourceTemplate {
  let template: unknown;
  try {
    template = resolver(request);
  } catch (error) {
    throw new Error(`ResolveError for ${JSON.stringify(request)}: ${message(error)}`, {
      cause: error,
    });
  }
  if (isSourceTemplate(template)) return template;
  throw new Error(`ResolveError: invalid result for ${JSON.stringify(request)}`);
}

// fallow-ignore-next-line complexity
function isSourceTemplate(value: unknown): value is SourceTemplate {
  if (!value || typeof value !== 'object') return false;
  const template = value as Record<string, unknown>;
  return (
    typeof template.id === 'string' && template.id.length > 0 && typeof template.source === 'string'
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
