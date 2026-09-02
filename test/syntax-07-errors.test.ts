import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { Sikka, SikkaError } from '../src/index.js';
import { compileSources } from '../src/compiler.js';
import { compile as precompile } from '../src/precompile.js';
import { parse } from '../src/parser.js';
import { render } from './helpers.js';

function source(template: string): Sikka {
  return new Sikka({
    mode: 'source',
    resolver: () => ({ id: 'invalid.astro', source: template }),
  });
}

describe('Syntax: Error Handling', () => {
  it('reports parser failures at the source entry boundary', () => {
    for (const template of ['---\nconst x = 1;', '<div>unclosed', '<div>{unclosed'])
      expect(() => render(template)).toThrow(/ParseError/);
  });

  it('reports typed source diagnostics with the canonical Template identity', () => {
    assert.throws(
      () => source('<div>').render('page'),
      (error: unknown) =>
        error instanceof SikkaError &&
        error.category === 'Parse' &&
        error.template === 'invalid.astro' &&
        error.line === 1
    );
  });

  it('rejects invalid Directives consistently in Render, Streaming, and precompile', async () => {
    const template = '<div set:html="a" set:text="b" />';
    expect(() => source(template).render('page')).toThrow(/InvalidDirective/);
    expect(() => source(template).stream('page')).toThrow(/InvalidDirective/);
    expect(() =>
      precompile('page', { resolver: () => ({ id: 'page', source: template }) })
    ).toThrow(/InvalidDirective/);
  });

  it('categorizes invalid constructs before rendering', () => {
    const parsed = parse('<Fragment is:raw />');
    if (parsed.ok) throw new Error('Expected an invalid Fragment diagnostic');
    expect(parsed.error.category).toBe('Parse');
    expect(parsed.error.construct).toBe('Fragment');

    const directive = parse('<div set:html="a" set:text="b" />');
    if (!directive.ok) throw new Error('Expected a parsed Template');
    const compiled = compileSources(directive.ast);
    if (compiled.ok) throw new Error('Expected an invalid Directive diagnostic');
    expect(compiled.error.category).toBe('Compile');
    expect(compiled.error.construct).toBe('directive');
  });

  it('reports source resolver failures', () => {
    const sikka = new Sikka({
      mode: 'source',
      resolver: () => {
        throw new Error('missing');
      },
    });
    expect(() => sikka.render('page')).toThrow(/ResolveError.*page.*missing/);
  });
});
