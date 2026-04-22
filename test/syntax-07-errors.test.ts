import { describe, it, expect } from 'vitest';
import { Sikka } from '../src/index.js';

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
