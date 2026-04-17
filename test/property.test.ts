import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Engine } from '../src/index.js';

// Strings that are safe to embed in template bodies
const safeText = fc
  .string({ maxLength: 50 })
  .filter(
    (s) =>
      !s.includes('{') &&
      !s.includes('}') &&
      !s.includes('---') &&
      !s.includes('`') &&
      !s.includes('<')
  );

// Alphanumeric strings only (for prop values etc.)
const alphaNum = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z0-9]+$/.test(s));

describe('Property-Based Tests', () => {
  it('render determinism: same template + props always produce same output', () => {
    fc.assert(
      fc.property(safeText, (str) => {
        const template = `---\n---\n<div>${str}</div>`;
        const engine = new Engine();
        const html1 = engine.renderString(template);
        const html2 = engine.renderString(template);
        expect(html1).toBe(html2);
      })
    );
  });

  it('cache identity: compile returns same reference for same template', () => {
    fc.assert(
      fc.property(safeText, (str) => {
        const template = `<div>${str}</div>`;
        const engine = new Engine({ cache: true });
        const fn1 = engine.compile(template);
        const fn2 = engine.compile(template);
        expect(fn1).toBe(fn2);
      })
    );
  });

  it('cache bypass: compile with config returns new reference', () => {
    const engine = new Engine({ cache: true });
    const template = '<div>test</div>';
    const fn1 = engine.compile(template);
    const fn2 = engine.compile(template, { autoEscape: false });
    expect(fn1).not.toBe(fn2);
  });

  it('null-safety: renderString with no props matches empty object', () => {
    const engine = new Engine();
    const template = '<div>static content</div>';
    expect(engine.renderString(template)).toBe(engine.renderString(template, {}));
  });

  it('empty frontmatter equivalence: body renders same with or without --- fences', () => {
    fc.assert(
      fc.property(safeText, (str) => {
        const body = `<span>${str}</span>`;
        const engine = new Engine();
        const withFM = engine.renderString(`---\n---\n${body}`);
        const withoutFM = engine.renderString(body);
        expect(withFM).toBe(withoutFM);
      })
    );
  });

  it('prop reflection: rendered output contains expected text for string props', () => {
    fc.assert(
      fc.property(alphaNum, (propVal) => {
        const engine = new Engine();
        const html = engine.renderString(
          '---\nconst { name } = Astro.props;\n---\n<div>{name}</div>',
          { name: propVal }
        );
        expect(html).toContain(propVal);
      })
    );
  });

  it('component isolation: different props produce different outputs', () => {
    fc.assert(
      fc.property(alphaNum, alphaNum, (valA, valB) => {
        fc.pre(valA !== valB);
        const engine = new Engine();
        engine.loadComponent('Item', '<span>{Astro.props.text}</span>');
        const htmlA = engine.renderString(`<Item text="${valA}" />`);
        const htmlB = engine.renderString(`<Item text="${valB}" />`);
        expect(htmlA).not.toBe(htmlB);
      })
    );
  });
});
