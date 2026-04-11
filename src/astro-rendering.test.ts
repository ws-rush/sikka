import { describe, it, expect } from 'vitest';
import { Engine } from './index.js';

describe('Astro Element and Component Rendering', () => {
  const engine = new Engine();

  describe('Fragments', () => {
    it('supports set:html and set:text on Fragment', async () => {
      const template = `
<Fragment set:html="<b>HTML</b>" />
<Fragment set:text="<b>Text</b>" />
`;
      const result = await engine.renderString(template);
      expect(result).toContain('<b>HTML</b>');
      expect(result).toContain('&lt;b&gt;Text&lt;/b&gt;');
    });

    it('supports Fragments inside svg and table', async () => {
      const template = `
<svg><><path/></></svg>
<table><tbody><><tr><td>1</td></tr></></tbody></table>
`;
      const result = await engine.renderString(template);
      expect(result).toContain('<svg><path></path></svg>');
      expect(result).toContain('<table><tbody><tr><td>1</td></tr></tbody></table>');
    });

    it('handles Fragment inside head', async () => {
      const template = `<head><><title>Test</title></></head>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<head><title>Test</title></head>');
    });
  });

  describe('Props Spreading', () => {
    it('handles overriding spread vs spread overridden', async () => {
      const template1 = `<div {...{ id: "spread" }} id="static"></div>`;
      const result1 = await engine.renderString(template1);
      // static wins because it comes after
      expect(result1).toBe('<div id="static"></div>');

      const template2 = `<div id="static" {...{ id: "spread" }}></div>`;
      const result2 = await engine.renderString(template2);
      // spread wins because it comes after
      expect(result2).toBe('<div id="spread"></div>');
    });

    it('spreads arrays (indexes become keys)', async () => {
      const template = `<div {...['a', 'b']}></div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div 0="a" 1="b"></div>');
    });

    it('spreads directives like class:list and style', async () => {
      const template = `<div {...{ "class:list": ["a", "b"], style: { color: "red" } }}></div>`;
      const result = await engine.renderString(template);
      // Note: current implementation of emitAttr for spread might not handle class:list specifically
      // if it just does a loop over keys and escapes.
      // Let's check src/compiler.ts:emitAttr
      /*
      if ('type' in attr) {
        return [
          `{`,
          `  const __spread = (${transformExpression(attr.expression)});`,
          `  for (const __k in __spread) { ... }
      */
      // It doesn't seem to check for special names in spread loop.
      // Astro usually DOES support this.
      expect(result).toContain('class="a b"');
      expect(result).toContain('style="color:red"');
    });

    it('spreads objects with getters', async () => {
      const template = `<div {...{ get id() { return "dynamic"; } }}></div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div id="dynamic"></div>');
    });
  });

  describe('Directive combinations', () => {
    it('combines class:list with static class or className', async () => {
      // Astro often merges them.
      const template = `<div class="base" class:list={["extra"]}></div>`;
      const result = await engine.renderString(template);
      // Our current engine might emit two class attributes or one.
      // Standard HTML only allows one class attribute.
      expect(result).toBe('<div class="base extra"></div>');
    });

    it('combines style object with static style string', async () => {
      const template = `<div style="margin: 0;" style={{ padding: "10px" }}></div>`;
      const result = await engine.renderString(template);
      expect(result).toBe('<div style="margin: 0;padding:10px"></div>');
    });
  });
});
