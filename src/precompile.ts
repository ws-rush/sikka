import { compileSources } from './compiler.js';
import { parse } from './parser.js';
import { SikkaError } from './error.js';
import type { SourceResolver, SourceTemplate } from './types.js';

/** The portable precompile-artifact ABI version. */
export const PRECOMPILE_ABI_VERSION = 3;

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
export function emitModule(artifact: PrecompileArtifact, options: EmitModuleOptions = {}): string {
  if (artifact.abiVersion !== PRECOMPILE_ABI_VERSION)
    throw new Error(
      `Unsupported precompile artifact ABI ${String(artifact.abiVersion)}; expected ${PRECOMPILE_ABI_VERSION}`
    );

  const runtimeSpecifier = options.runtimeSpecifier ?? 'sikka/runtime';
  if (!runtimeSpecifier) throw new Error('emitModule requires a non-empty runtimeSpecifier');
  const components = artifact.components.map((component, index) => {
    const specifier = options.componentSpecifier?.(component);
    if (!specifier)
      throw new Error(
        `emitModule requires a componentSpecifier for ${JSON.stringify(component.id)} imported by ${JSON.stringify(artifact.id)}`
      );
    return {
      ...component,
      specifier,
      render: `__component_${index}_render`,
      stream: `__component_${index}_stream`,
    };
  });
  const imports = components
    .map(
      ({ specifier, render, stream }) =>
        `import { render as ${render}, stream as ${stream} } from ${JSON.stringify(specifier)};`
    )
    .join('\n');
  const regularComponents = components.map(
    ({ localName, render }) => `${JSON.stringify(localName)}: ${render}`
  );
  const streamingComponents = components.map(
    ({ localName, stream }) => `${JSON.stringify(localName)}: ${stream}`
  );
  const helpers =
    'const { escape: __escape, expression: __expression, RawHtml: __RawHtml, classList: __classList, styleObject: __styleObject, filter: __filter, autoFilter: __autoFilter, aggregateAssets: __aggregateAssets } = runtime(this);';

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
export function compile(
  entries: string | readonly string[],
  options: PrecompileOptions
): PrecompileArtifact[] {
  const requests = typeof entries === 'string' ? [entries] : entries;
  if (requests.length === 0)
    throw new SikkaError('GraphError: expected at least one entry request', {
      category: 'Resolve',
    });

  const artifacts = new Map<string, PrecompileArtifact>();
  const visiting: string[] = [];
  for (const request of requests) visit(request, undefined, options.resolver, artifacts, visiting);
  return [...artifacts.values()];
}

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
    throw new SikkaError(
      `ResolveError for ${JSON.stringify(request)}${context}: ${message(error)}`,
      {
        category: 'Resolve',
        request,
        importer,
        cause: error,
      }
    );
  }
  if (isSourceTemplate(template)) return template;
  const identity = sourceIdentity(template);
  const suffix = identity === undefined ? '' : ` (canonical identity ${JSON.stringify(identity)})`;
  throw new SikkaError(
    `ResolveError: invalid result for ${JSON.stringify(request)}${context}${suffix}`,
    {
      category: 'Resolve',
      request,
      importer,
      template: identity,
    }
  );
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
