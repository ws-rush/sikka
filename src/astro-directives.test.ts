import { describe, it, expect } from 'vitest';
import { Engine } from './index.js';

describe('Astro Built-in Directives', () => {
  const engine = new Engine();

  describe('class:list', () => {
    it('supports complex arguments (Sets, nested arrays, truthy values)', async () => {
      const template = `<div class:list={[
  'a',
  new Set(['b']),
  ['c', ['d']],
  { e: true, f: false, g: 'truthy' }
]} />`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div class="a b c d e g"></div>');
    });

    it('handles duplicate classes', async () => {
      const template = `<div class:list={['a', 'a', 'b']} />`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div class="a a b"></div>'); // Astro might dedupe, but let's see what we do
    });

    it('handles mutating array inline', async () => {
      const template = `---
const arr = ['a'];
---
<div class:list={arr.push('b') && arr} />`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div class="a b"></div>');
    });
  });

  describe('style Object', () => {
    it('converts camelCase to kebab-case', async () => {
      const template = `<div style={{ backgroundColor: "blue", zIndex: 10 }} />`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div style="background-color:blue;z-index:10"></div>');
    });

    it('supports !important and vendor prefixes', async () => {
      const template = `<div style={{ color: "red !important", WebkitTransform: "none" }} />`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div style="color:red !important;-webkit-transform:none"></div>');
    });

    it('supports object toString override', async () => {
      const template = `<div style={{ toString: () => "color:red" }} />`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div style="color:red"></div>');
    });
  });

  describe('set:html and set:text', () => {
    it('fails when set:text is used with children', async () => {
      const template = `<div set:text="a">children</div>`;
      await expect(engine.renderString(template)).rejects.toThrow();
    });

    it('supports passing promises and arrays to set:html', async () => {
      const template = `
<div set:html={Promise.resolve("<b>1</b>")} />
<div set:html={['<i>2</i>', '<u>3</u>']} />
`;
      const result = await engine.renderString(template);
      expect(result).toContain('<div><b>1</b></div>');
      expect(result).toContain('<div><i>2</i><u>3</u></div>');
    });

    it('renders script and style tags in set:html', async () => {
      const template = `<div set:html={"<script>console.log(1)</script>"} />`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div><script>console.log(1)</script></div>');
    });

    it('fails when set:html and set:text are used together', async () => {
      const template = `<div set:html="a" set:text="b"></div>`;
      await expect(engine.renderString(template)).rejects.toThrow();
    });

    it('fails when set:html is used with children', async () => {
      const template = `<div set:html="a">children</div>`;
      await expect(engine.renderString(template)).rejects.toThrow();
    });
  });

  describe('is:raw and is:inline', () => {
    it('is:raw renders content verbatim and skips parsing', async () => {
      const template = `<div is:raw>{val} <Component /></div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div>{val} <Component /></div>');
    });

    it('fails if is:raw is used on Fragment', async () => {
      const template = `<Fragment is:raw>text</Fragment>`;
      await expect(engine.renderString(template)).rejects.toThrow();
    });

    it('supports nested is:raw', async () => {
      const template = `<div is:raw><span is:raw></span></div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div><span is:raw></span></div>');
    });

    it('is:inline on script/style remains untouched', async () => {
      const template = `<script is:inline>console.log(1)</script>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<script is:inline>console.log(1)</script>');
    });
  });
});
