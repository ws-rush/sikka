import { describe, it, expect } from 'vitest';
import { render } from './helpers.js';

describe('Syntax: Built-in Directives', () => {
  describe('class:list', () => {
    it('renders object with boolean keys', () => {
      const html = render('<div class:list={{ a: true, b: false }} />');
      expect(html).toBe('<div class="a"></div>');
    });

    it('renders Set', () => {
      const html = render('<div class:list={new Set(["a", "b"])} />');
      expect(html).toBe('<div class="a b"></div>');
    });

    it('filters null/undef/false/0 from array', () => {
      const html = render('---\n---\n<div class:list={["a", null, false, 0]} />');
      expect(html).toBe('<div class="a"></div>');
    });

    it('flattens deeply nested arrays', () => {
      const html = render('<div class:list={["a", [["b"]]]} />');
      expect(html).toBe('<div class="a b"></div>');
    });

    it('keeps duplicate classes', () => {
      const html = render('<div class:list={["a", "a"]} />');
      expect(html).toBe('<div class="a a"></div>');
    });

    it('renders empty class attribute for falsy top-level (false)', () => {
      const html = render('<div class:list={false} />');
      expect(html).toBe('<div class=""></div>');
    });

    it('renders empty class attribute for 0', () => {
      const html = render('<div class:list={0} />');
      expect(html).toBe('<div class=""></div>');
    });

    it('renders empty class attribute for empty array', () => {
      const html = render('<div class:list={[]} />');
      expect(html).toBe('<div class=""></div>');
    });

    it('renders empty class attribute for empty object', () => {
      const html = render('<div class:list={{}} />');
      expect(html).toBe('<div class=""></div>');
    });

    it('merges with static class attribute', () => {
      const html = render('<div class="x" class:list={["y"]} />');
      expect(html).toContain('class="x"');
      expect(html).toContain('class="y"');
    });

    it('merges with className attribute', () => {
      const html = render('<div className="x" class:list={["y"]} />');
      expect(html).toContain('class="x"');
      expect(html).toContain('class="y"');
    });

    it('renders dynamic string templates', () => {
      const html = render('---\nconst color = "red";\n---\n<div class:list={[`bg-${color}`]} />');
      expect(html).toContain('bg-red');
    });

    it('renders truthy non-booleans in object', () => {
      const html = render('<div class:list={{ a: 1, b: "yes" }} />');
      expect(html).toBe('<div class="a b"></div>');
    });
  });

  describe('style object', () => {
    it('converts camelCase to kebab-case', () => {
      const html = render('<div style={{ backgroundColor: "blue" }} />');
      expect(html).toBe('<div style="background-color:blue"></div>');
    });

    it('preserves CSS variables', () => {
      const html = render('<div style={{ "--custom": "10px" }} />');
      expect(html).toBe('<div style="--custom:10px"></div>');
    });

    it('renders numeric values without auto-px', () => {
      const html = render('<div style={{ zIndex: 99 }} />');
      expect(html).toBe('<div style="z-index:99"></div>');
    });

    it('renders null values as "null" string', () => {
      const html = render('<div style={{ color: null }} />');
      expect(html).toBe('<div style="color:null"></div>');
    });

    it('renders undefined values as "undefined" string', () => {
      const html = render('<div style={{ color: undefined }} />');
      expect(html).toBe('<div style="color:undefined"></div>');
    });

    it('renders empty string values', () => {
      const html = render('<div style={{ color: "" }} />');
      expect(html).toBe('<div style="color:"></div>');
    });

    it('combines style string with style object', () => {
      const html = render('<div style="margin:0" style={{ padding: "10px" }} />');
      expect(html).toContain('margin:0');
      expect(html).toContain('padding:10px');
    });

    it('renders quotes in values', () => {
      const html = render('<div style={{ fontFamily: \'"Inter"\' }} />');
      expect(html).toContain('font-family');
      expect(html).toContain('Inter');
    });

    it('preserves !important', () => {
      const html = render('<div style={{ color: "red !important" }} />');
      expect(html).toBe('<div style="color:red !important"></div>');
    });

    it('converts vendor prefixes to kebab-case', () => {
      const html = render('<div style={{ WebkitTransform: "none" }} />');
      expect(html).toBe('<div style="-webkit-transform:none"></div>');
    });

    it('spreads style properties', () => {
      const html = render(
        '---\nconst base = { margin: "0" };\n---\n<div style={{ ...base, color: "red" }} />'
      );
      expect(html).toContain('margin:0');
      expect(html).toContain('color:red');
    });
  });

  describe('set:html and set:text', () => {
    it('renders set:html with null as empty', () => {
      const html = render('<div set:html={null} />');
      expect(html).toBe('<div></div>');
    });

    it('renders set:text with undefined as empty', () => {
      const html = render('<div set:text={undefined} />');
      expect(html).toBe('<div></div>');
    });

    it('inserts raw HTML with set:html string', () => {
      const html = render('<div set:html="<b>hi</b>" />');
      expect(html).toBe('<div><b>hi</b></div>');
    });

    it('inserts raw HTML with set:html dynamic value', () => {
      const html = render('---\nconst html = "<b>bold</b>";\n---\n<div set:html={html} />');
      expect(html).toBe('<div><b>bold</b></div>');
    });

    it('escapes text with set:text', () => {
      const html = render('---\nconst txt = "<b>bold</b>";\n---\n<div set:text={txt} />');
      expect(html).toBe('<div>&lt;b&gt;bold&lt;/b&gt;</div>');
    });

    it('renders set:html on Fragment', () => {
      const html = render('<Fragment set:html="<b>hi</b>" />');
      expect(html).toBe('<b>hi</b>');
    });

    it('renders set:html with script tags verbatim', () => {
      const html = render('<div set:html={"<script>alert()</script>"} />');
      expect(html).toContain('<script>alert()</script>');
    });

    it('renders set:html with style tags verbatim', () => {
      const html = render('<div set:html={"<style>body{}</style>"} />');
      expect(html).toContain('<style>body{}</style>');
    });

    it('renders set:html on template element', () => {
      const html = render('<template set:html="5" />');
      expect(html).toContain('5');
    });

    it('concatenates set:html with array values', () => {
      const html = render('<div set:html={["a", "b"]} />');
      expect(html).toBe('<div>ab</div>');
    });

    it('renders set:html with boolean true', () => {
      const html = render('<div set:html={true} />');
      expect(html).toBe('<div>true</div>');
    });

    it('renders set:html with object', () => {
      const html = render('<div set:html={{}} />');
      expect(html).toBe('<div>[object Object]</div>');
    });

    it('throws CompileError when set:html and set:text are both used', () => {
      expect(() => render('<div set:html="a" set:text="b" />')).toThrow(/CompileError/);
    });

    it('throws CompileError when set:html has children', () => {
      expect(() => render('<div set:html="a">child</div>')).toThrow(/CompileError/);
    });
  });

  describe('is:raw and is:inline', () => {
    it('preserves is:inline script verbatim with attribute', () => {
      const html = render('<script is:inline>console.log(1);</script>');
      expect(html).toBe('<script is:inline>console.log(1);</script>');
    });

    it('preserves is:inline style verbatim with attribute', () => {
      const html = render('<style is:inline>body{}</style>');
      expect(html).toBe('<style is:inline>body{}</style>');
    });

    it('renders is:raw content verbatim (expression text preserved)', () => {
      const html = render('---\nconst val = "<b>bold</b>";\n---\n<div is:raw>{val}</div>');
      expect(html).toBe('<div>{val}</div>');
    });

    it('renders is:raw with HTML tags verbatim', () => {
      const html = render('<div is:raw><p>text &amp; more</p></div>');
      expect(html).toBe('<div><p>text &amp; more</p></div>');
    });

    it('renders nested is:raw elements', () => {
      const html = render('<div is:raw><span is:raw>raw</span></div>');
      expect(html).toContain('raw');
    });

    it('throws error for is:raw on Fragment', () => {
      expect(() => render('<Fragment is:raw></Fragment>')).toThrow();
    });
  });

  describe('Script & Style — Edge Cases', () => {
    it('renders self-closing script as empty tag', () => {
      const html = render('<script />');
      expect(html).toBe('<script></script>');
    });

    it('renders self-closing style as empty tag', () => {
      const html = render('<style />');
      expect(html).toBe('<style></style>');
    });

    it('renders script with attributes', () => {
      const html = render('<script type="module">import "a";</script>');
      expect(html).toBe('<script type="module">import "a";</script>');
    });
  });
});
