import { describe, it, expect } from 'vitest';
import { Engine } from './index.js';

describe('Coverage tests', () => {
  const engine = new Engine();

  describe('Compiler coverage', () => {
    it('hits set:text on standard elements', async () => {
      const res1 = await engine.renderString('<div set:text="foo"></div>');
      expect(res1).toBe('<div>foo</div>');
      const res2 = await engine.renderString('<div set:text={Promise.resolve("bar")}></div>');
      expect(res2).toBe('<div>bar</div>');
    });

    it('hits style in emitAttr (fallback case)', async () => {
      // Capitalized Tag not in components triggers fallback
      const res = await engine.renderString('<Tag style={{ color: "red" }} />');
      expect(res).toBe('<Tag style="color:red" />');
    });

    it('hits spread in emitComponentCall', async () => {
      engine.loadComponent('Comp', '<div {...Astro.props}><slot /></div>');
      const res = await engine.renderString('<Comp {...{id: "1"}} />');
      expect(res).toBe('<div id="1"></div>');
    });

    it('hits slotAttr.value === true', async () => {
      engine.loadComponent('Comp', '<div><slot /></div>');
      const res = await engine.renderString('<Comp><div slot></div></Comp>');
      expect(res).toBe('<div><div></div></div>');
    });
  });

  describe('Parser coverage', () => {
    it('hits malformed frontmatter no newline', async () => {
      await expect(engine.renderString('---foo')).rejects.toThrow('Unclosed frontmatter fence');
    });

    it('hits closing tag error in parseGenericElement', async () => {
      await expect(engine.renderString('<div ')).rejects.toThrow(
        "Expected '>' or '/>' to close opening tag <div>"
      );
    });

    it('hits mismatched closing tag', async () => {
      const res = await engine.renderString('<div></span>');
      expect(res).toBe('<div></div>');
    });

    it('hits set:html and set:text on Fragments with dynamic values', async () => {
      const res1 = await engine.renderString(
        '<Fragment set:html={Promise.resolve("<b></b>")}></Fragment>'
      );
      expect(res1).toBe('<b></b>');
      const res2 = await engine.renderString(
        '<Fragment set:text={Promise.resolve("<b></b>")}></Fragment>'
      );
      expect(res2).toBe('&lt;b&gt;&lt;/b&gt;');
    });

    it('hits is:raw unclosed error', async () => {
      await expect(engine.renderString('<div is:raw>')).rejects.toThrow(
        'Unclosed <div> tag with is:raw'
      );
    });

    it('hits attribute name missing', async () => {
      await expect(engine.renderString('<div = />')).rejects.toThrow('Expected attribute name');
    });

    it('hits is:raw on Fragment error', async () => {
      await expect(engine.renderString('<Fragment is:raw>text</Fragment>')).rejects.toThrow(
        'is:raw is not supported on Fragments'
      );
    });
  });
});
