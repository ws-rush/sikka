import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { collectHtml, render } from './helpers.js';
import {
  compile as compileTemplate,
  compileStreaming as compileStreamingTemplate,
} from '../src/compiler.js';
import type { RenderFunction } from '../src/index.js';
import { parse } from '../src/parser.js';

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

    it('omits class for falsy values', () => {
      for (const value of ['false', '0', '[]', '{}']) {
        expect(render(`<div class:list={${value}} />`)).toBe('<div></div>');
      }
    });

    it('merges class and class:list in source order', () => {
      expect(render('<div class="x" class:list={["y"]} />')).toBe('<div class="x y"></div>');
    });

    it('merges className and class:list in source order', () => {
      expect(render('<div className="x" class:list={["y"]} />')).toBe('<div class="x y"></div>');
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

    it('preserves CSS variables including uppercase letters', () => {
      const html = render(
        '<div style={{ "--custom": "10px", "--myVar": "x", "--Brand-Color": "red" }} />'
      );
      expect(html).toBe('<div style="--custom:10px;--myVar:x;--Brand-Color:red"></div>');
    });

    it('renders numeric values without auto-px', () => {
      const html = render('<div style={{ zIndex: 99 }} />');
      expect(html).toBe('<div style="z-index:99"></div>');
    });

    it('omits nullish and empty values', () => {
      const html = render('<div style={{ color: null, background: undefined, padding: "" }} />');
      expect(html).toBe('<div></div>');
    });

    it('omits boolean values while retaining zero', () => {
      const html = render('<div style={{ hidden: false, enabled: true, zIndex: 0 }} />');
      expect(html).toBe('<div style="z-index:0"></div>');
    });

    it('combines style strings and objects in source order', () => {
      const html = render(
        '---\nconst first = { style: { marginTop: 0 } };\nconst second = { style: "color:red;" };\n---\n<div style="display:block;" {...first} style={{ padding: "10px" }} {...second} />'
      );
      expect(html).toBe('<div style="display:block;margin-top:0;padding:10px;color:red"></div>');
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

    it('renders spread set:html', () => {
      expect(render('<div {...{ "set:html": "<b>hi</b>" }} />')).toBe('<div><b>hi</b></div>');
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
    it('diagnoses unsupported is:inline', () => {
      expect(() => render('<script is:inline>console.log(1);</script>')).toThrow(
        /ParseError.*InvalidDirective.*is:inline/
      );
      expect(() => render('<style is:inline>body{}</style>')).toThrow(
        /ParseError.*InvalidDirective.*is:inline/
      );
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

  describe('is:raw Edge Cases', () => {
    it('renders is:raw with nested opening tags', () => {
      const html = render('<div is:raw><span>text</span></div>');
      expect(html).toBe('<div><span>text</span></div>');
    });

    it('renders is:raw with nested same-type elements', () => {
      const html = render('<div is:raw><div>inner</div></div>');
      expect(html).toBe('<div><div>inner</div></div>');
    });
  });

  describe('class:list Edge Cases', () => {
    it('handles inline array mutation with push', () => {
      const html = render(
        '---\nconst arr = ["a"];\n---\n<div class:list={arr.push("b") && arr} />'
      );
      expect(html).toContain('class="a b"');
    });
  });

  describe('style Edge Cases', () => {
    it('uses custom toString as the complete style value', () => {
      const html = render('<div style={{ toString: () => "color:red" }} />');
      expect(html).toBe('<div style="color:red"></div>');
    });
  });

  describe('set:text Edge Cases', () => {
    it('renders set:text with dynamic value (escaped)', () => {
      const html = render('---\nconst txt = "<b>bold</b>";\n---\n<div set:text={txt} />');
      expect(html).toBe('<div>&lt;b&gt;bold&lt;/b&gt;</div>');
    });
  });

  it('covers is:raw nesting, unclosed opening/closing tags, and fragment closing', () => {
    const unclosedOpen = parse('<div id="a"');
    expect(unclosedOpen.ok).toBe(false);
    if (!unclosedOpen.ok) {
      expect(unclosedOpen.error.message).toBe("Expected '>' or '/>' to close opening tag <div>");
      expect(unclosedOpen.error.column).toBe(12);
    }

    const nestedRaw = parse('<div is:raw><div>inner</div><divx>not-same</divx></div>');
    expect(nestedRaw.ok).toBe(true);
    if (nestedRaw.ok) {
      expect(nestedRaw.ast.body[0]).toEqual({
        type: 'element',
        tag: 'div',
        attrs: [],
        children: [{ type: 'raw', html: '<div>inner</div><divx>not-same</divx>' }],
        selfClosing: false,
      });
    }

    for (const badRaw of ['<div is:raw>unclosed', '<div is:raw><div']) {
      const err = parse(badRaw);
      expect(err.ok).toBe(false);
      if (!err.ok) {
        expect(err.error.message).toBe('Unclosed <div> tag with is:raw');
      }
    }

    const spacedClose = parse('<div >ok</div >');
    expect(spacedClose.ok).toBe(true);

    const badClose = parse('<div>ok</div foo>');
    expect(badClose.ok).toBe(false);
    if (!badClose.ok) {
      expect(badClose.error.message).toBe("Expected '>' to close </div>");
    }

    const frag = parse('<><span>hi</span></>');
    expect(frag.ok).toBe(true);
    if (frag.ok) {
      expect(frag.ast.body[0].type).toBe('element');
    }

    const unclosedFrag = parse('<><span>hi</span>');
    expect(unclosedFrag.ok).toBe(false);
  });

  it('covers compiler.ts dynamic/empty slots, asset class attrs, set:html/set:text, dynamic Tag, and component props', () => {
    const slotAst = parse(
      '<slot name={Sikka.props.n}><span>fb</span></slot><slot name={Sikka.props.m} /><slot />'
    );
    expect(slotAst.ok).toBe(true);
    if (slotAst.ok) {
      const c = compileTemplate(slotAst.ast);
      expect(c.ok).toBe(true);
      if (c.ok) {
        expect(c.fn.renderSync({ n: 'default', m: 'none' }, { '': 'def' })).toBe('defdef');
        expect(c.fn.renderSync({ n: 'missing', m: 'none' }, {})).toBe('<span>fb</span>');
      }
    }

    const assetAst = parse(
      '<script class="s">x()</script><style class:list={["a","b"]}>b{}</style>'
    );
    expect(assetAst.ok).toBe(true);
    if (assetAst.ok) {
      const c1 = compileTemplate(assetAst.ast, { aggregateAssets: false });
      expect(c1.ok).toBe(true);
      if (c1.ok) {
        expect(c1.fn.renderSync({})).toBe(
          '<script class="s">x()</script><style class="a b">b{}</style>'
        );
      }
      const c2 = compileTemplate(assetAst.ast, { aggregateAssets: true });
      expect(c2.ok).toBe(true);
      if (c2.ok) {
        expect(c2.fn.renderSync({})).toBe('');
      }
    }

    const dirAst = parse(
      '<div set:html="<b>raw</b>" /><Fragment set:html /><div set:text="<b>esc</b>" /><Fragment set:text /><div set:text={"<x>"} />'
    );
    expect(dirAst.ok).toBe(true);
    if (dirAst.ok) {
      const c = compileTemplate(dirAst.ast);
      expect(c.ok).toBe(true);
      if (c.ok) {
        expect(c.fn.renderSync({})).toBe(
          '<div><b>raw</b></div><div>&lt;b&gt;esc&lt;/b&gt;</div><div>&lt;x&gt;</div>'
        );
      }
    }

    const dynTagAst = parse('---\nconst Tag = Sikka.props.Tag;\n---\n<Tag>ok</Tag>');
    expect(dynTagAst.ok).toBe(true);
    if (dynTagAst.ok) {
      const c = compileTemplate(dynTagAst.ast);
      expect(c.ok).toBe(true);
      if (c.ok) {
        expect(c.fn.renderSync({ Tag: 'br' })).toBe('<br />');
        expect(c.fn.renderSync({ Tag: '!DOCTYPE html' })).toBe('<!DOCTYPE html>');
        expect(c.fn.renderSync({ Tag: 'section' })).toBe('<section>ok</section>');
      }
    }

    const compAst = parse(
      '---\nimport Card from "./Card.sikka";\nconst extra = { n: 2 };\n---\n<Card {...extra} flag title="hi" />'
    );
    expect(compAst.ok).toBe(true);
    if (compAst.ok) {
      const cardFn = ((props: Record<string, unknown>) =>
        `${props.n}:${props.flag}:${props.title}`) as unknown as RenderFunction;
      cardFn.render = (props) => Promise.resolve(cardFn.renderSync(props));
      cardFn.renderSync = (props) => `${props.n}:${props.flag}:${props.title}`;
      const c = compileTemplate(compAst.ast, { components: { Card: cardFn } });
      expect(c.ok).toBe(true);
      if (c.ok) {
        expect(c.fn.renderSync({})).toBe('2:true:hi');
      }
    }
  });

  it('covers compiler.ts boolean slot attr, non-streaming component in stream, missing renderSync, UnknownTag, and style filter', async () => {
    const slotBoolAst = parse(
      '---\nimport Card from "./Card.sikka";\n---\n<Card><span slot>def</span></Card><UnknownTag>ok</UnknownTag>'
    );
    expect(slotBoolAst.ok).toBe(true);
    if (slotBoolAst.ok) {
      const card = (async (_p: Record<string, unknown>, slots: Record<string, string>) =>
        `[${slots['']}]`) as unknown as RenderFunction;
      card.render = (p, s) => card(p, s);
      card.renderSync = (_p, s) => `[${s['']}]`;

      const c = compileTemplate(slotBoolAst.ast, { components: { Card: card } });
      expect(c.ok).toBe(true);
      if (c.ok) {
        expect(c.fn.renderSync({})).toBe('[<span>def</span>]<UnknownTag>ok</UnknownTag>');
      }

      const streamRes = compileStreamingTemplate(slotBoolAst.ast, {
        components: { Card: card },
        streamComponents: false,
      });
      expect(streamRes.ok).toBe(true);
      if (streamRes.ok) {
        expect(await collectHtml(streamRes.fn({}))).toBe(
          '[<span>def</span>]<UnknownTag>ok</UnknownTag>'
        );
      }

      const noSync = ((_p: Record<string, unknown>) => 'x') as unknown as RenderFunction;
      noSync.render = () => Promise.resolve('x');
      const cNoSync = compileTemplate(slotBoolAst.ast, { components: { Card: noSync } });
      expect(cNoSync.ok).toBe(true);
      if (cNoSync.ok) {
        expect(() => cNoSync.fn.renderSync({})).toThrow(/does not support synchronous rendering/);
      }
    }

    const styleAst = parse('<div style=";color:red;;" style=";;" />');
    expect(styleAst.ok).toBe(true);
    if (styleAst.ok) {
      const c = compileTemplate(styleAst.ast);
      expect(c.ok).toBe(true);
      if (c.ok) {
        expect(c.fn.renderSync({})).toBe('<div style="color:red"></div>');
      }
    }

    const badImportAst = parse('---\nimport { x } from "./helper.js";\n---\n<p/>');
    expect(badImportAst.ok).toBe(true);
    if (badImportAst.ok) {
      const badCompile = compileTemplate(badImportAst.ast, { templateId: 'bad-imp.sikka' });
      expect(badCompile.ok).toBe(false);
    }
  });
});
