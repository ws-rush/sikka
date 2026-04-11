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

    it('hits unclosed slot error', async () => {
      await expect(engine.renderString('<slot>')).rejects.toThrow('Unclosed <slot> tag');
    });

    it('hits expected /> or > after slot attributes', async () => {
      await expect(engine.renderString('<slot name="foo"')).rejects.toThrow(
        'Expected `/>` or `>` after <slot> attributes'
      );
    });

    it('hits unclosed frontmatter fence at end of file', async () => {
      await expect(engine.renderString('---\nfoo')).rejects.toThrow(
        'Unclosed frontmatter fence: missing closing `---`'
      );
    });

    it('hits script self-closing error', async () => {
      await expect(engine.renderString('<script /')).rejects.toThrow("Expected '>' after '/'");
    });

    it('hits script unclosed opening tag error', async () => {
      await expect(engine.renderString('<script ')).rejects.toThrow(
        "Expected '>' to close <script> opening tag"
      );
    });

    it('hits is:raw with complex nesting and characters', async () => {
      const template = '<div is:raw><div >INNER</div></div>';
      const result = await engine.renderString(template);
      expect(result).toBe('<div><div >INNER</div></div>');

      const template2 = '<div is:raw><div/ >INNER</div></div>';
      const result2 = await engine.renderString(template2);
      expect(result2).toBe('<div><div/ >INNER</div></div>');

      const template3 = '<div is:raw><div\n>INNER</div></div>';
      const result3 = await engine.renderString(template3);
      expect(result3).toBe('<div><div\n>INNER</div></div>');

      const template4 = '<div is:raw><divx>NOT A DIV</divx></div>';
      const result4 = await engine.renderString(template4);
      expect(result4).toBe('<div><divx>NOT A DIV</divx></div>');
    });

    it('hits nested braces in expression', async () => {
      const res = await engine.renderString('<div>{ { a: { b: 1 } }.a.b }</div>');
      expect(res).toBe('<div>1</div>');
    });

    it('hits comment in slot loop', async () => {
      const res = await engine.renderString('<slot><!-- comment --></slot>');
      expect(res).toBe('<!-- comment -->');
    });

    it('hits unclosed script tag error', async () => {
      await expect(engine.renderString('<script>')).rejects.toThrow('Unclosed <script> tag');
    });
  });
});
