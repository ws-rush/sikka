import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { Sikka, SikkaError } from '../src/index.js';
import { compileSources } from '../src/compiler.js';
import { compile as precompile } from '../src/precompile.js';
import { parse } from '../src/parser.js';
import { consume } from './helpers.js';

describe('Syntax: Error Handling', () => {
  it('throws ParseError for unclosed frontmatter fence', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('---\nconst x = 1;')).toThrow(/ParseError/);
  });

  it('throws ParseError for unclosed tag', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<div>unclosed')).toThrow(/ParseError/);
  });

  it('throws ParseError for unclosed expression', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<div>{unclosed')).toThrow(/ParseError/);
  });

  it('throws ParseError for unclosed HTML comment', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<!-- unclosed comment')).toThrow(/ParseError/);
  });

  it('throws descriptive error when readFile is not configured', () => {
    const sikka = new Sikka();
    expect(() => sikka.render('test.astro')).toThrow(/readFile/);
  });

  it('throws descriptive error for missing file', () => {
    const sikka = new Sikka({
      readFile: () => null as unknown as string,
    });
    expect(() => sikka.render('missing.astro')).toThrow();
  });

  it('throws CompileError when set:html and set:text are both used', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<div set:html="a" set:text="b" />')).toThrow(/CompileError/);
  });

  it('throws CompileError when set:html has children', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<div set:html="a">child</div>')).toThrow(/CompileError/);
  });

  it('categorizes invalid Directives and Fragments', () => {
    const parsed = parse('<Fragment is:raw />');
    if (parsed.ok) throw new Error('Expected an invalid Fragment diagnostic');
    expect(parsed.error.category).toBe('Parse');
    expect(parsed.error.construct).toBe('Fragment');
    expect(parsed.error.message).toContain('is:raw');

    const directive = parse('<div set:html="a" set:text="b" />');
    if (!directive.ok) throw new Error('Expected a parsed Template');
    const compiled = compileSources(directive.ast);
    if (compiled.ok) throw new Error('Expected an invalid Directive diagnostic');
    expect(compiled.error.category).toBe('Compile');
    expect(compiled.error.construct).toBe('directive');
    expect(compiled.error.message).toContain('set:html');
  });

  it('exposes typed category and template context at public boundaries', () => {
    assert.throws(
      () => new Sikka({ mode: 'source', resolver: () => ({ id: 'page', source: '<div>' }) }).render('page'),
      (error: unknown) =>
        error instanceof SikkaError &&
        error.category === 'Parse' &&
        error.template === 'page' &&
        error.line === 1
    );
    assert.throws(
      () => new Sikka({ mode: 'source', resolver: () => { throw new Error('missing'); } }).render('page'),
      (error: unknown) =>
        error instanceof SikkaError && error.category === 'Resolve' && error.request === 'page'
    );
  });

  it('rejects the same invalid Template in source, Streaming, and precompiled entry points', () => {
    const source = '<div set:html="a" set:text="b" />';
    const sikka = new Sikka({ mode: 'source', resolver: () => ({ id: 'invalid', source }) });
    expect(() => sikka.render('invalid')).toThrow(/InvalidDirective/);
    expect(() => sikka.stream('invalid')).toThrow(/InvalidDirective/);
    expect(() => precompile('invalid', { resolver: () => ({ id: 'invalid', source }) })).toThrow(
      /InvalidDirective/
    );
  });

  it('rejects unsupported directives and Fragment forms', () => {
    for (const template of [
      '<div set:text="a">child</div>',
      '<Fragment id="x" />',
      '<Fragment {...props} />',
      '<Fragment set:html="a">child</Fragment>',
      '<Fragment set:html="a" set:text="b" />',
      '<script is:inline></script>',
    ]) expect(() => new Sikka().renderString(template)).toThrow(/Invalid(Directive|Fragment)/);
  });

  it('rejects unsupported spread Directives and dynamic content conflicts in streams', async () => {
    for (const directive of ['set:text', 'is:raw', 'client:load']) {
      const template = `<div {...{ ${JSON.stringify(directive)}: true }} />`;
      expect(() => new Sikka().renderString(template)).toThrow(
        new RegExp(`InvalidDirective.*${directive}`)
      );
      await expect(consume(new Sikka().streamString(template))).rejects.toThrow(
        new RegExp(`InvalidDirective.*${directive}`)
      );
    }
    const conflict = '<div {...{ "set:html": "a" }} set:text="b" />';
    expect(() => new Sikka().renderString(conflict)).toThrow(/InvalidDirective.*set:html.*set:text/);
    await expect(consume(new Sikka().streamString(conflict))).rejects.toThrow(
      /InvalidDirective.*set:html.*set:text/
    );
  });

  it('throws runtime error for expression evaluation failure', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('---\n---\n{(() => { throw new Error("boom"); })()}')).toThrow(
      /boom/
    );
  });

  it('wraps runtime error with "Runtime Error:" prefix in debug mode', () => {
    const sikka = new Sikka({ debug: true });
    expect(() => sikka.renderString('---\n---\n{(() => { throw new Error("boom"); })()}')).toThrow(
      /Runtime Error:/
    );
  });

  it('throws CompileError for circular component dependency', () => {
    const sikka = new Sikka({
      readFile: (p) => {
        if (p.includes('a.astro')) return '---\nimport B from "./b.astro";\n---\n<B />';
        if (p.includes('b.astro')) return '---\nimport A from "./a.astro";\n---\n<A />';
        return null as unknown as string;
      },
    });
    expect(() => sikka.render('/views/a.astro')).toThrow(/CompileError/);
  });

  it('throws CompileError for unresolvable component import', () => {
    const sikka = new Sikka({
      readFile: (p) => {
        if (p.includes('main.astro'))
          return '---\nimport Missing from "./missing.astro";\n---\n<Missing />';
        return null as unknown as string;
      },
    });
    expect(() => sikka.render('/views/main.astro')).toThrow(/CompileError/);
  });

  it('throws ParseError for unclosed element at EOF', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<div>unclosed')).toThrow(/ParseError/);
  });

  it('throws ParseError for unclosed style', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<style>body{}')).toThrow(/ParseError/);
  });

  it('throws ParseError for unclosed slot', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<slot name="x">')).toThrow(/ParseError/);
  });

  it('throws ParseError for unclosed string literal in expression', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<div>{"unclosed}</div>')).toThrow(/ParseError/);
  });

  it('throws ParseError for missing > after script attributes', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<script type="module"')).toThrow(/ParseError/);
  });

  it('throws ParseError for missing close after slot attributes', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<slot name="x"')).toThrow(/ParseError/);
  });

  it('throws ParseError for missing > on element opening tag', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<div class="x"')).toThrow(/ParseError/);
  });

  it('throws ParseError for missing attribute name', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<div ="val">')).toThrow(/ParseError/);
  });

  it('throws ParseError for script with / but no >', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<script type="module"/ var x;')).toThrow(/ParseError/);
  });

  it('throws ParseError for unclosed attribute value string', () => {
    const sikka = new Sikka();
    expect(() => sikka.renderString('<div class="unclosed>hi</div>')).toThrow(/ParseError/);
  });
});
