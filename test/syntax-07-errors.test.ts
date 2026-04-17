import { describe, it, expect } from 'vitest';
import { Engine } from '../src/index.js';

describe('Syntax: Error Handling', () => {
  it('throws ParseError for unclosed frontmatter fence', () => {
    const engine = new Engine();
    expect(() => engine.renderString('---\nconst x = 1;')).toThrow(/ParseError/);
  });

  it('throws ParseError for unclosed tag', () => {
    const engine = new Engine();
    expect(() => engine.renderString('<div>unclosed')).toThrow(/ParseError/);
  });

  it('throws ParseError for unclosed expression', () => {
    const engine = new Engine();
    expect(() => engine.renderString('<div>{unclosed')).toThrow(/ParseError/);
  });

  it('throws ParseError for unclosed HTML comment', () => {
    const engine = new Engine();
    expect(() => engine.renderString('<!-- unclosed comment')).toThrow(/ParseError/);
  });

  it('throws descriptive error when readFile is not configured', () => {
    const engine = new Engine();
    expect(() => engine.render('test.astro')).toThrow(/readFile/);
  });

  it('throws descriptive error for missing file', () => {
    const engine = new Engine({
      readFile: () => null as unknown as string,
    });
    expect(() => engine.render('missing.astro')).toThrow();
  });

  it('throws CompileError when set:html and set:text are both used', () => {
    const engine = new Engine();
    expect(() => engine.renderString('<div set:html="a" set:text="b" />')).toThrow(/CompileError/);
  });

  it('throws CompileError when set:html has children', () => {
    const engine = new Engine();
    expect(() => engine.renderString('<div set:html="a">child</div>')).toThrow(/CompileError/);
  });

  it('throws runtime error for expression evaluation failure', () => {
    const engine = new Engine();
    expect(() => engine.renderString('---\n---\n{(() => { throw new Error("boom"); })()}')).toThrow(
      /boom/
    );
  });

  it('wraps runtime error with "Runtime Error:" prefix in debug mode', () => {
    const engine = new Engine({ debug: true });
    expect(() => engine.renderString('---\n---\n{(() => { throw new Error("boom"); })()}')).toThrow(
      /Runtime Error:/
    );
  });

  it.skip('throws CompileError for circular component dependency', () => {
    const engine = new Engine({
      readFile: (p) => {
        if (p.includes('a.astro')) return 'import B from "./b.astro";\n<B />';
        if (p.includes('b.astro')) return 'import A from "./a.astro";\n<A />';
        return null as unknown as string;
      },
    });
    expect(() => engine.render('/views/a.astro')).toThrow(/CompileError/);
  });

  it.skip('throws CompileError for unresolvable component import', () => {
    const engine = new Engine({
      readFile: (p) => {
        if (p.includes('main.astro')) return 'import Missing from "./missing.astro";\n<Missing />';
        return null as unknown as string;
      },
    });
    expect(() => engine.render('/views/main.astro')).toThrow(/CompileError/);
  });
});
