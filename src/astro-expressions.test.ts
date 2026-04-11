import { describe, it, expect } from 'vitest';
import { Engine } from './index.js';

describe('Astro Expressions', () => {
  const engine = new Engine();

  describe('Strings & Numbers', () => {
    it('renders null, undefined, true, false as nothing', async () => {
      const template = `<div>{null}{undefined}{true}{false}</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div></div>');
    });

    it('renders 0 as "0"', async () => {
      const template = `<div>{0}</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>0</div>');
    });

    it('renders NaN, Infinity, -Infinity, -0', async () => {
      const template = `<div>{NaN} {Infinity} {-Infinity} {-0}</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>NaN Infinity -Infinity 0</div>');
    });

    it('renders BigInt', async () => {
      const template = `<div>{100n}</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>100</div>');
    });

    it('escapes <, >, &, "\', `', async () => {
      const template = `<div>{"<"} {">"} {"&"} {"\\""} {"'"}</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>&lt; &gt; &amp; &quot; &#39;</div>');
    });

    it('handles objects and functions', async () => {
      const template = `<div>{{ a: 1 }}</div><div>{() => "foo"}</div>`;
      const result = await engine.renderString(template);
      expect(result).toContain('<div>[object Object]</div>');
      expect(result).toContain('<div>() =&gt; &quot;foo&quot;</div>');
    });

    it('escapes automatically in string interpolation with HTML tags inside', async () => {
      const template = `---
const val = "world";
---
<div>{\`<b>\${val}</b>\`}</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>&lt;b&gt;world&lt;/b&gt;</div>');
    });
  });

  describe('Template Literals & Logic', () => {
    it('supports nullish coalescing', async () => {
      const template = `<div>{undefined ?? "fallback"}</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>fallback</div>');
    });

    it('renders 0 in 0 && element', async () => {
      const template = `<div>{ 0 && "Hidden" }</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>0</div>');
    });

    it('supports complex conditional && and ||', async () => {
      const template = `---
const a = true, b = false, c = "foo";
---
<div>{ a && b || c }</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>foo</div>');
    });

    it('supports switch statements and try/catch in IIFE', async () => {
      const template = `
<div>{ (() => { switch(1) { case 1: return "One"; } })() }</div>
<div>{ (() => { try { throw new Error("e"); } catch { return "Error"; } })() }</div>
`;
      const result = await engine.renderString(template);
      expect(result).toContain('<div>One</div>');
      expect(result).toContain('<div>Error</div>');
    });
  });

  describe('Arrays (Mapping)', () => {
    it('flattens and renders nested arrays', async () => {
      const template = `<div>{ [['a'], ['b']] }</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>ab</div>');
    });

    it('skips null, undefined, and booleans inside arrays', async () => {
      const template = `<div>{ [true, null, 'a', false, undefined, 'b'] }</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>ab</div>');
    });

    it('handles sparse arrays', async () => {
      const template = `<div>{ [1, , 3] }</div>`;
      const result = await engine.renderString(template);
      // sparse array [1, empty, 3].map(...) results in [rendered 1, skip empty, rendered 3]
      // Actually standard JS .join() or interpolation might handle empty as "".
      // Let's see how our engine handles it. It iterates if it's an array.
      expect(result).toBe('<div>13</div>');
    });

    it('handles mapping over Sets', async () => {
      const template = `<div>{ [...new Set(['a', 'b', 'a'])].map(i => i + i) }</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>aabb</div>');
    });
  });

  describe('Promises', () => {
    it('auto-awaits unawaited strings', async () => {
      const template = `<div>{Promise.resolve("Resolved")}</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>Resolved</div>');
    });

    it('handles Promise.all', async () => {
      const template = `<div>{Promise.all([Promise.resolve("A"), Promise.resolve("B")])}</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>AB</div>');
    });

    it('handles deeply nested promises', async () => {
      const template = `<div>{Promise.resolve(Promise.resolve("Deep"))}</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>Deep</div>');
    });

    it('renders async IIFE results', async () => {
      const template = `<div>{await (async () => "Async IIFE")()}</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>Async IIFE</div>');
    });

    it('handles rejected promise caught', async () => {
      const template = `<div>{Promise.reject("Fail").catch(e => e)}</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>Fail</div>');
    });
  });
});
