import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { collectHtml } from './helpers.js';
import { Sikka } from '../src/index.js';
import {
  assertRenderedHtml,
  syntaxContractCases,
  validateSyntaxContractCases,
} from './syntax-contract.js';

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
    if (!case_.modes.includes('source')) continue;

    it(`${case_.id} renders in source mode`, () => {
      assertRenderedHtml(case_, new Sikka().renderString(case_.template, case_.props));
    });

    if (case_.streaming === 'same-html') {
      it(`${case_.id} streams the same Rendered HTML in source mode`, async () => {
        const html = await collectHtml(new Sikka().streamString(case_.template, case_.props));
        assertRenderedHtml(case_, html);
      });
    }
  }
});
