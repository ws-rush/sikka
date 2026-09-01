import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { collectHtml } from './helpers.js';
import { Sikka } from '../src/index.js';
import { compile } from '../src/precompile.js';
import {
  assertRenderedHtml,
  syntaxContractCases,
  validateSyntaxContractCases,
} from './syntax-contract.js';

function sourceSikka(case_: (typeof syntaxContractCases)[number]): Sikka {
  return new Sikka({
    mode: 'source',
    resolver: (request) => ({ id: request, source: case_.template }),
  });
}

async function precompiledSikka(case_: (typeof syntaxContractCases)[number]): Promise<Sikka> {
  const [artifact] = compile(case_.id, {
    resolver: (request) => ({ id: request, source: case_.template }),
  });
  const runtime = new URL('../src/runtime.ts', import.meta.url).href;
  const source = `import { runtime } from ${JSON.stringify(runtime)};
export function render(props, slots = {}) {
  const { escape: __escape, RawHtml: __RawHtml, classList: __classList, styleObject: __styleObject, filter: __filter } = runtime(this);
${artifact.renderString}
}
export async function* stream(props, slots = {}) {
  const { escape: __escape, RawHtml: __RawHtml, classList: __classList, styleObject: __styleObject, filter: __filter } = runtime(this);
${artifact.streamString}
}`;
  const module = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  return new Sikka({ mode: 'precompiled', resolver: () => module });
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

  for (const case_ of syntaxContractCases) {
    if (case_.modes.includes('source')) {
      it(`${case_.id} renders in source mode`, () => {
        assertRenderedHtml(case_, sourceSikka(case_).render(case_.id, case_.props));
      });

      if (case_.streaming === 'same-html') {
        it(`${case_.id} streams the same Rendered HTML in source mode`, async () => {
          const html = await collectHtml(sourceSikka(case_).stream(case_.id, case_.props));
          assertRenderedHtml(case_, html);
        });
      }
    }

    if (case_.modes.includes('precompiled')) {
      it(`${case_.id} renders in precompiled mode`, async () => {
        const sikka = await precompiledSikka(case_);
        assertRenderedHtml(case_, sikka.render(case_.id, case_.props));
      });

      if (case_.streaming === 'same-html') {
        it(`${case_.id} streams the same Rendered HTML in precompiled mode`, async () => {
          const sikka = await precompiledSikka(case_);
          assertRenderedHtml(case_, await collectHtml(sikka.stream(case_.id, case_.props)));
        });
      }
    }
  }
});
