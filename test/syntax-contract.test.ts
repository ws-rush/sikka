import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { collectHtml } from './helpers.js';
import { Sikka } from '../src/index.js';
import { compile } from '../src/precompile.js';
import {
  assertRenderedHtml,
  syntaxContractCases,
  validateSyntaxContractCases,
  type SyntaxContractCase,
} from './syntax-contract.js';

type ContractCase = SyntaxContractCase;

function templateFor(case_: ContractCase, request: string): { id: string; source: string } {
  const source = request === case_.id ? case_.template : case_.components?.[request];
  if (source === undefined) throw new Error(`Unknown Template: ${request}`);
  return { id: request, source };
}

function sourceSikka(case_: ContractCase): Sikka {
  return new Sikka({
    mode: 'source',
    autoEscape: case_.autoEscape,
    resolver: (request) => templateFor(case_, request),
  });
}

function wrap(
  artifact: ReturnType<typeof compile>[number],
  componentUrl: (id: string) => string
): string {
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
  const runtime = new URL('../src/runtime.ts', import.meta.url).href;
  return `import { runtime } from ${JSON.stringify(runtime)};
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

async function precompiledSikka(case_: ContractCase): Promise<Sikka> {
  const artifacts = compile(case_.id, { resolver: (request) => templateFor(case_, request) });
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const urls = new Map<string, string>();
  const moduleUrl = (id: string): string => {
    const known = urls.get(id);
    if (known) return known;
    const artifact = byId.get(id);
    if (!artifact) throw new Error(`Missing artifact: ${id}`);
    const url = `data:text/javascript,${encodeURIComponent(wrap(artifact, moduleUrl))}`;
    urls.set(id, url);
    return url;
  };
  const module = await import(moduleUrl(case_.id));
  return new Sikka({ mode: 'precompiled', autoEscape: case_.autoEscape, resolver: () => module });
}

async function assertParity(case_: ContractCase, sikka: Sikka): Promise<void> {
  let rendered: string | undefined;
  if (case_.streaming === 'await-only') {
    expect(() => sikka.render(case_.id, case_.props)).toThrow(/Sikka Frontmatter await.*stream/);
  } else {
    rendered = sikka.render(case_.id, case_.props);
    assertRenderedHtml(case_, rendered);
  }
  if (!case_.streaming) return;

  const streamed = await collectHtml(sikka.stream(case_.id, case_.props));
  assertRenderedHtml(case_, streamed);
  if (rendered !== undefined) expect(streamed).toBe(rendered);
}

describe('Syntax Contract', () => {
  it('validates the portable case manifest', () => {
    validateSyntaxContractCases(syntaxContractCases);
  });

  it('rejects invalid case metadata', () => {
    expect(() =>
      validateSyntaxContractCases([
        {
          id: 'invalid',
          template: '<p />',
          components: [],
          props: {},
          expectedHtml: '<p></p>',
          modes: [],
        },
      ])
    ).toThrow(/Invalid Syntax Contract case metadata/);
  });

  it('rejects duplicate stable IDs', () => {
    expect(() =>
      validateSyntaxContractCases([
        {
          id: 'duplicate',
          template: '<p />',
          props: {},
          expectedHtml: '<p></p>',
          modes: ['source'],
        },
        {
          id: 'duplicate',
          template: '<p />',
          props: {},
          expectedHtml: '<p></p>',
          modes: ['source'],
        },
      ])
    ).toThrow(/Duplicate Syntax Contract case ID/);
  });

  for (const value of ['false', 'null', 'undefined', '0', '{}']) {
    const invalidComponent: ContractCase = {
      id: `invalid-component-${value.replaceAll(/[^a-z0-9]/g, '') || 'object'}`,
      template: `---\nconst Broken = ${value};\n---\n<Broken />`,
      props: {},
      expectedHtml: '',
      modes: ['source', 'precompiled'],
      streaming: 'same-html',
    };

    it(`rejects bound non-Component ${value} in source mode`, async () => {
      const sikka = sourceSikka(invalidComponent);
      expect(() => sikka.render(invalidComponent.id)).toThrow(/Invalid Component Broken/);
      await expect(collectHtml(sikka.stream(invalidComponent.id))).rejects.toThrow(
        /Invalid Component Broken/
      );
    });

    it(`rejects bound non-Component ${value} in precompiled mode`, async () => {
      const sikka = await precompiledSikka(invalidComponent);
      expect(() => sikka.render(invalidComponent.id)).toThrow(/Invalid Component Broken/);
      await expect(collectHtml(sikka.stream(invalidComponent.id))).rejects.toThrow(
        /Invalid Component Broken/
      );
    });
  }

  it('flushes source static content ahead of an async Component', async () => {
    const case_ = syntaxContractCases.find(({ id }) => id === 'async-components-source-order');
    if (!case_) throw new Error('Missing async Component syntax contract case');
    const stream = sourceSikka(case_).stream(case_.id, case_.props);

    const first = await stream.next();
    expect(first).toEqual({ value: 'before', done: false });
    expect(`${first.value}${await collectHtml(stream)}`).toBe(case_.expectedHtml);
  });

  for (const case_ of syntaxContractCases) {
    if (case_.modes.includes('source')) {
      it(`${case_.id} has regular/stream parity in source mode`, async () => {
        await assertParity(case_, sourceSikka(case_));
      });
    }

    if (case_.modes.includes('precompiled')) {
      it(`${case_.id} has regular/stream parity in precompiled mode`, async () => {
        await assertParity(case_, await precompiledSikka(case_));
      });
    }
  }
});
