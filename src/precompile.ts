import { compileSources } from './compiler.js';
import { parse } from './parser.js';
import { SikkaError } from './error.js';
import type { SourceResolver, SourceTemplate } from './types.js';

/** The portable precompile-artifact ABI version. */
export const PRECOMPILE_ABI_VERSION = 2;

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
export function compile(
  entries: string | readonly string[],
  options: PrecompileOptions
): PrecompileArtifact[] {
  const requests = typeof entries === 'string' ? [entries] : entries;
  if (requests.length === 0)
    throw new SikkaError('GraphError: expected at least one entry request', { category: 'Resolve' });

  const artifacts = new Map<string, PrecompileArtifact>();
  const visiting: string[] = [];
  for (const request of requests) visit(request, undefined, options.resolver, artifacts, visiting);
  return [...artifacts.values()];
}

// fallow-ignore-next-line complexity
function visit(
  request: string,
  importer: string | undefined,
  resolver: SourceResolver,
  artifacts: Map<string, PrecompileArtifact>,
  visiting: string[]
): PrecompileArtifact {
  const template = resolve(request, importer, resolver);
  const known = artifacts.get(template.id);
  if (known) return known;
  if (visiting.includes(template.id)) throw cycleError(request, importer, visiting, template.id);

  visiting.push(template.id);
  try {
    const parsed = parse(template.source);
    if (!parsed.ok)
      throw new SikkaError(`ParseError in ${template.id}: ${parsed.error.message}`, {
        ...parsed.error,
        template: template.id,
      });

    const compiled = compileSources(parsed.ast, template.id);
    if (!compiled.ok)
      throw new SikkaError(`CompileError in ${template.id}: ${compiled.error.message}`, {
        ...compiled.error,
        template: template.id,
      });

    const components = parsed.ast.imports.map(({ localName, specifier }) => {
      const component = visit(specifier, template.id, resolver, artifacts, visiting);
      return { localName, specifier, id: component.id };
    });
    const artifact: PrecompileArtifact = {
      abiVersion: PRECOMPILE_ABI_VERSION,
      id: template.id,
      renderString: compiled.renderString,
      streamString: compiled.streamString,
      components,
    };
    artifacts.set(template.id, artifact);
    return artifact;
  } finally {
    visiting.pop();
  }
}

// fallow-ignore-next-line complexity
function resolve(
  request: string,
  importer: string | undefined,
  resolver: SourceResolver
): SourceTemplate {
  const context = importer ? ` imported by canonical identity ${JSON.stringify(importer)}` : '';
  let template: unknown;
  try {
    template = resolver(request, importer);
  } catch (error) {
    throw new SikkaError(`ResolveError for ${JSON.stringify(request)}${context}: ${message(error)}`, {
      category: 'Resolve',
      request,
      importer,
      cause: error,
    });
  }
  if (isSourceTemplate(template)) return template;
  const identity = sourceIdentity(template);
  const suffix = identity === undefined ? '' : ` (canonical identity ${JSON.stringify(identity)})`;
  throw new SikkaError(`ResolveError: invalid result for ${JSON.stringify(request)}${context}${suffix}`, {
    category: 'Resolve',
    request,
    importer,
    template: identity,
  });
}

function cycleError(
  request: string,
  importer: string | undefined,
  visiting: string[],
  identity: string
): Error {
  const context = importer ? ` imported by canonical identity ${JSON.stringify(importer)}` : '';
  const start = visiting.indexOf(identity);
  const cycle = [...visiting.slice(start), identity];
  return new SikkaError(
    `ResolveError for ${JSON.stringify(request)}${context}: circular component dependency ${cycle.join(' → ')}`,
    { category: 'Resolve', request, importer, template: identity }
  );
}

function sourceIdentity(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const identity = (value as Record<string, unknown>).id;
  return typeof identity === 'string' ? identity : undefined;
}

// fallow-ignore-next-line complexity
function isSourceTemplate(value: unknown): value is SourceTemplate {
  if (!value || typeof value !== 'object') return false;
  const template = value as Record<string, unknown>;
  return (
    typeof template.id === 'string' &&
    template.id.trim().length > 0 &&
    typeof template.source === 'string'
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
