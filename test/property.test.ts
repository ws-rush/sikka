import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Sikka } from '../src/index.js';

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
        const sikka = new Sikka();
        const html1 = sikka.renderString(template);
        const html2 = sikka.renderString(template);
        expect(html1).toBe(html2);
      })
    );
  });

  it('cache identity: compile returns same reference for same template', () => {
    fc.assert(
      fc.property(safeText, (str) => {
        const template = `<div>${str}</div>`;
        const sikka = new Sikka({ cache: true });
        const fn1 = sikka.compile(template);
        const fn2 = sikka.compile(template);
        expect(fn1).toBe(fn2);
      })
    );
  });

  it('cache bypass: compile with config returns new reference', () => {
    const sikka = new Sikka({ cache: true });
    const template = '<div>test</div>';
    const fn1 = sikka.compile(template);
    const fn2 = sikka.compile(template, { autoEscape: false });
    expect(fn1).not.toBe(fn2);
  });

  it('null-safety: renderString with no props matches empty object', () => {
    const sikka = new Sikka();
    const template = '<div>static content</div>';
    expect(sikka.renderString(template)).toBe(sikka.renderString(template, {}));
  });

  it('empty frontmatter equivalence: body renders same with or without --- fences', () => {
    fc.assert(
      fc.property(safeText, (str) => {
        const body = `<span>${str}</span>`;
        const sikka = new Sikka();
        const withFM = sikka.renderString(`---\n---\n${body}`);
        const withoutFM = sikka.renderString(body);
        expect(withFM).toBe(withoutFM);
      })
    );
  });

  it('prop reflection: rendered output contains expected text for string props', () => {
    fc.assert(
      fc.property(alphaNum, (propVal) => {
        const sikka = new Sikka();
        const html = sikka.renderString(
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
        const sikka = new Sikka();
        sikka.loadComponent('Item', '<span>{Astro.props.text}</span>');
        const htmlA = sikka.renderString(`<Item text="${valA}" />`);
        const htmlB = sikka.renderString(`<Item text="${valB}" />`);
        expect(htmlA).not.toBe(htmlB);
      })
    );
  });
});
