import { describe, it, expect } from 'vitest';
import { Engine } from './index.js';

describe('Astro File Structure', () => {
  const engine = new Engine();

  describe('Component Script (Frontmatter)', () => {
    it('supports top-level await destructuring', async () => {
      const template = `---
const { results: [firstUser] } = await Promise.resolve({ results: [{ name: 'Alice' }] });
---
<div>{firstUser.name}</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>Alice</div>');
    });

    it('supports TypeScript interface and type declarations', async () => {
      // These should be ignored/parsed correctly as part of the JS block
      const template = `---
export interface Props { title: string; }
export type User = { id: string };
const title: string = "Hello";
---
<h1>{title}</h1>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<h1>Hello</h1>');
    });

    it('supports hoisted functions vs const functions', async () => {
      const template = `---
function hoisted() { return "A"; }
const notHoisted = () => "B";
---
<div>{hoisted()}{notHoisted()}</div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>AB</div>');
    });

    it('supports global mutations', async () => {
      const template = `---
globalThis.customVar = (globalThis.customVar || 0) + 1;
---
<div>{globalThis.customVar}</div>`;
      // We render twice to check mutation
      await engine.renderString(template);
      const result = await engine.renderString(template);
      expect(result).toBe('<div>2</div>');
      delete (globalThis as Record<string, unknown>).customVar;
    });

    it('supports Node APIs (process)', async () => {
      const template = `---
const nodeVer = process.version;
---
<div>{nodeVer}</div>`;
      const result = await engine.renderString(template);
      expect(result).toContain('v');
    });
  });

  describe('Component Template', () => {
    it('handles unmatched quotes inside JS expressions', async () => {
      const template = `<div data={ true ? 'a"b' : "c'd" }></div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div data="a&quot;b"></div>');
    });

    it('parses multiline attributes properly', async () => {
      const template = `<div class="
  text-red
"></div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div class="\n  text-red\n"></div>');
    });

    it('renders capitalized variables as dynamic tags', async () => {
      const template = `---
const Tag = "section";
---
<Tag>Content</Tag>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<section>Content</section>');
    });

    it('treats lowercase dynamic tags as HTML', async () => {
      // In Astro, <tag> is just an HTML tag named "tag"
      const template = `---
const tag = "section";
---
<tag>Content</tag>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<tag>Content</tag>');
    });

    it('distinguishes JSX vs HTML comments', async () => {
      const template = `<div>{/* JS comment */}<!-- HTML comment --></div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div><!-- HTML comment --></div>');
    });

    it('supports self-closing standard HTML', async () => {
      const template = `<div />`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div></div>');
    });

    it('supports DOCTYPE injection', async () => {
      const template = `<!DOCTYPE html><html></html>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<!DOCTYPE html><html></html>');
    });

    it('permits overlapping tags parsed linearly', async () => {
      const template = `<b><i></b></i>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<b><i></i></b>');
    });

    it('handles HTML entities in attributes', async () => {
      const template = `<div data-id="&amp;"></div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div data-id="&amp;"></div>');
    });

    it('handles unquoted attributes', async () => {
      const template = `---
const id = "test";
---
<div data-id={id}></div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div data-id="test"></div>');
    });

    it('handles unescaped < or > in text', async () => {
      const template = `<span> 1 < 2 </span>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<span> 1 < 2 </span>');
    });
  });
});
