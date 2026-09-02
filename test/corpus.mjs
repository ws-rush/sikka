// Shared Syntax Contract corpus runner.
//
// Plain JavaScript on purpose: it is imported both by the Node test suite
// (through nub) and by the CI candidate scripts (through plain `node`), which
// cannot resolve the `.js`-for-`.ts` specifiers used across the TypeScript
// sources. Case data and expected-HTML assertions come from
// test/syntax-contract.ts, and rendering modules are injected so callers can
// point the runner at either the sources (tests) or the exact built candidate
// (CI scripts).

import { assertRenderedHtml } from './syntax-contract.ts';

/** Rendering modules used to execute one Syntax Contract case. */
export const AWAIT_ONLY_PATTERN = /Sikka Frontmatter await.*stream/;

export function templateFor(case_, request) {
  const source = request === case_.id ? case_.template : case_.components?.[request];
  if (source === undefined) throw new Error(`Unknown Template: ${request}`);
  return { id: request, source };
}

/**
 * Wraps one precompile artifact's render/stream bodies in a static ESM module.
 * `runtimeUrl` and `componentUrl(id)` return import specifiers, so the same
 * wrapper serves data-URL modules (tests, reports) and generated files
 * (browser artifacts).
 */
export function wrapPrecompiledModule(artifact, runtimeUrl, componentUrl) {
  const components = artifact.components.map((component, index) => ({
    ...component,
    render: `__component_${index}_render`,
    stream: `__component_${index}_stream`,
  }));
  const imports = components
    .map(
      ({ id, render, stream }) =>
        `import { render as ${render}, stream as ${stream} } from ${JSON.stringify(componentUrl(id))};`
    )
    .join('\n');
  return `import { runtime } from ${JSON.stringify(runtimeUrl)};
${imports}
export function render(props, slots = {}) {
  const { escape: __escape, RawHtml: __RawHtml, classList: __classList, styleObject: __styleObject, filter: __filter, aggregateAssets: __aggregateAssets } = runtime(this);
  const __components = { ${components.map(({ localName, render }) => `${JSON.stringify(localName)}: ${render}`).join(', ')} };
${artifact.renderString}
}
export async function* stream(props, slots = {}) {
  const { escape: __escape, RawHtml: __RawHtml, classList: __classList, styleObject: __styleObject, filter: __filter, aggregateAssets: __aggregateAssets } = runtime(this);
  const __components = { ${components.map(({ localName, stream }) => `${JSON.stringify(localName)}: ${stream}`).join(', ')} };
${artifact.streamString}
}`;
}

export function sourceSikka(case_, modules) {
  return new modules.Sikka({
    mode: 'source',
    autoEscape: case_.autoEscape,
    resolver: (request) => templateFor(case_, request),
  });
}

export async function precompiledSikka(case_, modules) {
  const artifacts = modules.compile(case_.id, {
    resolver: (request) => templateFor(case_, request),
  });
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const urls = new Map();
  const moduleUrl = (id) => {
    const known = urls.get(id);
    if (known) return known;
    const artifact = byId.get(id);
    if (!artifact) throw new Error(`Missing artifact: ${id}`);
    const url = `data:text/javascript,${encodeURIComponent(
      wrapPrecompiledModule(artifact, modules.runtimeUrl, moduleUrl)
    )}`;
    urls.set(id, url);
    return url;
  };
  const module = await import(moduleUrl(case_.id));
  return new modules.Sikka({
    mode: 'precompiled',
    autoEscape: case_.autoEscape,
    resolver: () => module,
  });
}

async function collectHtml(gen) {
  const chunks = [];
  for await (const chunk of gen) chunks.push(chunk);
  return chunks.join('');
}

function assertAwaitOnlyRejected(case_, sikka) {
  try {
    sikka.render(case_.id, case_.props);
  } catch (error) {
    if (AWAIT_ONLY_PATTERN.test(String(error))) return;
    throw error;
  }
  throw new Error(
    `Syntax Contract case ${case_.id} accepted awaited Frontmatter in a regular Render`
  );
}

export async function assertCorpusParity(case_, sikka) {
  let rendered;
  if (case_.streaming === 'await-only') {
    assertAwaitOnlyRejected(case_, sikka);
  } else {
    rendered = sikka.render(case_.id, case_.props);
    assertRenderedHtml(case_, rendered);
  }
  if (!case_.streaming) return;

  const streamed = await collectHtml(sikka.stream(case_.id, case_.props));
  assertRenderedHtml(case_, streamed);
  if (rendered !== undefined && streamed !== rendered)
    throw new Error(`Syntax Contract case ${case_.id} streamed HTML differs from its Render`);
}

/**
 * Runs one case in every applicable mode against the injected modules.
 * Returns the completed modes plus the first failure, if any.
 */
export async function runSyntaxContractCase(case_, modules) {
  const completedModes = [];
  let failure;
  for (const mode of case_.modes) {
    try {
      const sikka =
        mode === 'source' ? sourceSikka(case_, modules) : await precompiledSikka(case_, modules);
      await assertCorpusParity(case_, sikka);
      completedModes.push(mode);
    } catch (error) {
      const detail = error?.cause ? `${error}: ${error.cause}` : String(error);
      failure = { mode, detail };
      break;
    }
  }
  return { id: case_.id, modes: case_.modes, completedModes, failure };
}
