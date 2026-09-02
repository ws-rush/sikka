import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { collectHtml } from './helpers.js';
import { assertCorpusParity, precompiledSikka, sourceSikka } from './corpus.mjs';
import { Sikka } from '../src/index.js';
import { compile } from '../src/precompile.js';
import {
  syntaxContractCases,
  validateSyntaxContractCases,
  type SyntaxContractCase,
} from './syntax-contract.js';

type ContractCase = SyntaxContractCase;

type CorpusModules = Parameters<typeof sourceSikka>[1];

const modules: CorpusModules = {
  Sikka,
  compile,
  runtimeUrl: new URL('../src/runtime.ts', import.meta.url).href,
};

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
      const sikka = sourceSikka(invalidComponent, modules);
      expect(() => sikka.render(invalidComponent.id)).toThrow(/Invalid Component Broken/);
      await expect(collectHtml(sikka.stream(invalidComponent.id))).rejects.toThrow(
        /Invalid Component Broken/
      );
    });

    it(`rejects bound non-Component ${value} in precompiled mode`, async () => {
      const sikka = await precompiledSikka(invalidComponent, modules);
      expect(() => sikka.render(invalidComponent.id)).toThrow(/Invalid Component Broken/);
      await expect(collectHtml(sikka.stream(invalidComponent.id))).rejects.toThrow(
        /Invalid Component Broken/
      );
    });
  }

  it('flushes source static content ahead of an async Component', async () => {
    const case_ = syntaxContractCases.find(({ id }) => id === 'async-components-source-order');
    if (!case_) throw new Error('Missing async Component syntax contract case');
    const stream = sourceSikka(case_, modules).stream(case_.id, case_.props);

    const first = await stream.next();
    expect(first).toEqual({ value: 'before', done: false });
    expect(`${first.value}${await collectHtml(stream)}`).toBe(case_.expectedHtml);
  });

  for (const case_ of syntaxContractCases) {
    if (case_.modes.includes('source')) {
      it(`${case_.id} has regular/stream parity in source mode`, async () => {
        await assertCorpusParity(case_, sourceSikka(case_, modules));
      });
    }

    if (case_.modes.includes('precompiled')) {
      it(`${case_.id} has regular/stream parity in precompiled mode`, async () => {
        await assertCorpusParity(case_, await precompiledSikka(case_, modules));
      });
    }
  }
});
