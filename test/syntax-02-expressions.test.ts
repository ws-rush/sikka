import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { render } from './helpers.js';
import { compile as compileTemplate } from '../src/compiler.js';
import { SikkaError } from '../src/error.js';
import { parse } from '../src/parser.js';
import { compile as precompile, emitModule } from '../src/precompile.js';

describe('Syntax: Dynamic Expressions', () => {
  describe('Strings & Numbers', () => {
    it('renders null as empty', () => {
      const html = render('<div>{null}</div>');
      expect(html).toBe('<div></div>');
    });

    it('renders undefined as empty', () => {
      const html = render('<div>{undefined}</div>');
      expect(html).toBe('<div></div>');
    });

    it('renders true as empty', () => {
      const html = render('<div>{true}</div>');
      expect(html).toBe('<div></div>');
    });

    it('renders false as empty', () => {
      const html = render('<div>{false}</div>');
      expect(html).toBe('<div></div>');
    });

    it('renders 0 as "0"', () => {
      const html = render('<div>{0}</div>');
      expect(html).toBe('<div>0</div>');
    });

    it('renders -0 as "0"', () => {
      const html = render('<div>{-0}</div>');
      expect(html).toBe('<div>0</div>');
    });

    it('renders NaN as "NaN"', () => {
      const html = render('<div>{NaN}</div>');
      expect(html).toBe('<div>NaN</div>');
    });

    it('renders Infinity as "Infinity"', () => {
      const html = render('<div>{Infinity}</div>');
      expect(html).toBe('<div>Infinity</div>');
    });

    it('renders -Infinity as "-Infinity"', () => {
      const html = render('<div>{-Infinity}</div>');
      expect(html).toBe('<div>-Infinity</div>');
    });

    it('renders BigInt as string', () => {
      const html = render('<div>{100n}</div>');
      expect(html).toBe('<div>100</div>');
    });

    it('escapes < in strings', () => {
      const html = render('---\n---\n<div>{"<"}</div>');
      expect(html).toBe('<div>&lt;</div>');
    });

    it('escapes > in strings', () => {
      const html = render('<div>{">"}</div>');
      expect(html).toBe('<div>&gt;</div>');
    });

    it('escapes & in strings', () => {
      const html = render('<div>{"&"}</div>');
      expect(html).toBe('<div>&amp;</div>');
    });

    it('escapes quotes in strings', () => {
      const html = render('<div>{"\'"}</div>');
      expect(html).toBe('<div>&#39;</div>');
    });

    it('renders IIFE returning string', () => {
      const html = render('<div>{(() => "A")()}</div>');
      expect(html).toBe('<div>A</div>');
    });

    it('auto-escapes string interpolation with HTML tags', () => {
      const html = render('---\nconst val = "world";\n---\n<div>{`<b>${val}</b>`}</div>');
      expect(html).toBe('<div>&lt;b&gt;world&lt;/b&gt;</div>');
    });

    it('renders objects as [object Object]', () => {
      const html = render('<div>{{ a: 1 }}</div>');
      expect(html).toBe('<div>[object Object]</div>');
    });

    it('renders functions as their source', () => {
      const html = render('<div>{() => "x"}</div>');
      expect(html).toContain('()');
    });
  });

  describe('Template Literals & Logic', () => {
    it('accesses nested object property in expression', () => {
      const html = render('<div>{ { a: 1 }.a }</div>');
      expect(html).toBe('<div>1</div>');
    });

    it('renders string fallback with ||', () => {
      const html = render('<div>{ false || "x" }</div>');
      expect(html).toBe('<div>x</div>');
    });

    it('renders ternary expression', () => {
      const html = render('---\nconst x = true;\n---\n<div>{x ? "yes" : "no"}</div>');
      expect(html).toBe('<div>yes</div>');
    });

    it('renders ternary expression (false branch)', () => {
      const html = render('---\nconst x = false;\n---\n<div>{x ? "yes" : "no"}</div>');
      expect(html).toBe('<div>no</div>');
    });

    it('renders nullish coalescing', () => {
      const html = render('---\nconst a = null;\n---\n<div>{a ?? "default"}</div>');
      expect(html).toBe('<div>default</div>');
    });

    it('renders nested template literals', () => {
      const html = render('<div>{`a ${`b`} c`}</div>');
      expect(html).toBe('<div>a b c</div>');
    });

    it('renders 0 && element as "0"', () => {
      const html = render('---\n---\n<div>{0 && "<span/>"}</div>');
      expect(html).toBe('<div>0</div>');
    });

    it('renders complex && and || chains', () => {
      const html = render(
        '---\nconst a = true, b = false, c = "result";\n---\n<div>{a && b || c}</div>'
      );
      expect(html).toBe('<div>result</div>');
    });

    it('renders function calls returning strings', () => {
      const html = render(
        '---\nfunction renderHeader() { return "Header"; }\n---\n<div>{renderHeader()}</div>'
      );
      expect(html).toBe('<div>Header</div>');
    });

    it('renders bitwise operators', () => {
      const html = render('---\nconst a = 5, b = 3;\n---\n<div>{a & b}</div>');
      expect(html).toBe('<div>1</div>');
    });

    it('renders object spread in logic', () => {
      const html = render('---\nconst obj = { key: "val" };\n---\n<div>{ { ...obj }.key }</div>');
      expect(html).toBe('<div>val</div>');
    });

    it('renders switch statement via IIFE', () => {
      const html = render(
        `<div>{(() => { switch (2) { case 1: return "a"; case 2: return "b"; default: return "c"; } })()}</div>`
      );
      expect(html).toBe('<div>b</div>');
    });

    it('renders try/catch in IIFE', () => {
      const html = render(
        '<div>{ (() => { try { throw "e"; } catch { return "caught"; } })() }</div>'
      );
      expect(html).toBe('<div>caught</div>');
    });
  });

  describe('Arrays / Mapping', () => {
    it('flattens nested arrays', () => {
      const html = render('---\n---\n<div>{ [["a"], ["b"]] }</div>');
      expect(html).toBe('<div>ab</div>');
    });

    it('filters null/bools from arrays', () => {
      const html = render('<div>{ [true, null, "a"] }</div>');
      expect(html).toBe('<div>a</div>');
    });

    it('renders .map() returning elements', () => {
      const html = render(
        '---\nconst arr = [1, 2, 3];\n---\n<div>{arr.map(i => <span>{i}</span>)}</div>'
      );
      expect(html).toBe('<div><span>1</span><span>2</span><span>3</span></div>');
    });

    it('renders .map() returning nested arrays of elements', () => {
      const html = render(
        '---\nconst arr = [{A: "x", B: "y"}];\n---\n<div>{arr.map(i => [<p>{i.A}</p>, <b>{i.B}</b>])}</div>'
      );
      expect(html).toBe('<div><p>x</p><b>y</b></div>');
    });

    it('renders .filter().map() chains', () => {
      const html = render(
        '---\nconst arr = [0, 1, 2, 3];\n---\n<div>{arr.filter(i => i > 0).map(i => <span>{i}</span>)}</div>'
      );
      expect(html).toBe('<div><span>1</span><span>2</span><span>3</span></div>');
    });

    it('handles sparse arrays (skips undefined entries)', () => {
      const html = render('---\nconst arr = [1, , 3];\n---\n<div>{arr}</div>');
      expect(html).toBe('<div>13</div>');
    });

    it('uses array index in map callback', () => {
      const html = render(
        '---\nconst arr = ["a", "b"];\n---\n<div>{arr.map((i, idx) => <span data-idx={idx}>{i}</span>)}</div>'
      );
      expect(html).toContain('data-idx="0"');
      expect(html).toContain('data-idx="1"');
    });

    it('maps over Sets via spread', () => {
      const html = render('---\n---\n<div>{ [...new Set([1])] }</div>');
      expect(html).toBe('<div>1</div>');
    });

    it('renders mixed numbers and strings', () => {
      const html = render('<div>{ [1, "a", 2, "b"] }</div>');
      expect(html).toBe('<div>1a2b</div>');
    });

    it('renders conditional elements in map', () => {
      const html = render(
        '---\nconst items = [1, 2, 3];\n---\n<div>{items.map(i => i > 1 && <span>{i}</span>)}</div>'
      );
      expect(html).toBe('<div><span>2</span><span>3</span></div>');
    });
  });

  describe('Edge cases', () => {
    it('renders empty expression as empty', () => {
      const html = render('<div>{}</div>');
      expect(html).toBe('<div></div>');
    });

    it('renders whitespace-only expression as empty', () => {
      const html = render('<div>{ }</div>');
      expect(html).toBe('<div></div>');
    });

    it('renders comment-only expression as empty', () => {
      const html = render('<div>{/* comment */}</div>');
      expect(html).toBe('<div></div>');
    });

    it('renders multiple same expressions independently', () => {
      const html = render('---\nconst x = 1;\n---\n<div>{x}{x}{x}</div>');
      expect(html).toBe('<div>111</div>');
    });

    it('renders very long expression chains', () => {
      const html = render('---\nconst a = "x";\n---\n<div>{a + a + a + a + a}</div>');
      expect(html).toBe('<div>xxxxx</div>');
    });

    it('preserves unicode content', () => {
      const html = render('<div>日本語 🎉</div>');
      expect(html).toBe('<div>日本語 🎉</div>');
    });

    it('resolves nested expressions inside map', () => {
      const html = render(
        '---\nconst arr = [1, 2];\n---\n<div>{arr.map(i => <span>{i}</span>)}</div>'
      );
      expect(html).toBe('<div><span>1</span><span>2</span></div>');
    });

    it('renders multiple root elements sequentially', () => {
      const html = render('<span>a</span><span>b</span>');
      expect(html).toBe('<span>a</span><span>b</span>');
    });

    it('preserves text before and after tags', () => {
      const html = render('before<div>inside</div>after');
      expect(html).toBe('before<div>inside</div>after');
    });

    it('preserves whitespace between elements', () => {
      const html = render('<span>A</span> <span>B</span>');
      expect(html).toBe('<span>A</span> <span>B</span>');
    });
  });

  describe('Template Literals', () => {
    it('parses template literal with interpolation', () => {
      const html = render('---\nconst x = "world";\n---\n<div>{`hello ${x}`}</div>');
      expect(html).toBe('<div>hello world</div>');
    });

    it('parses expression with string literal containing braces', () => {
      const html = render('<div>{"{"}</div>');
      expect(html).toBe('<div>{</div>');
    });

    it('parses nested expressions with elements', () => {
      const html = render(
        '---\nconst arr = [1, 2];\n---\n<div>{arr.map(i => <span>{i}</span>)}</div>'
      );
      expect(html).toBe('<div><span>1</span><span>2</span></div>');
    });

    it('ignores quotes and braces inside expression comments', () => {
      expect(render("<div>{/* don't */}</div>")).toBe('<div></div>');
      expect(render("<p>{1 // it's\n}</p>")).toBe('<p>1</p>');
      expect(render('<p>{1 /* } */}</p>')).toBe('<p>1</p>');
    });

    it('ignores quotes, braces, and character classes inside regex literals while preserving division', () => {
      expect(render("<p>{'x}'.replace(/\\}/g, '!')}</p>")).toBe('<p>x!</p>');
      expect(render("<p>{'{a}'.replace(/[{}]/g, '!')}</p>")).toBe('<p>!a!</p>');
      expect(render("<p>{/'/.test(\"'\") ? 'q' : 'n'}</p>")).toBe('<p>q</p>');
      expect(render('<p>{12 / 3 / 2}</p>')).toBe('<p>2</p>');
    });

    it('treats < followed by a digit or after an identifier as comparison, not a tag', () => {
      expect(render('---\nconst n = 5;\n---\n<p>{n<10 ? "small" : "big"}</p>')).toBe(
        '<p>small</p>'
      );
      expect(render('<p>{[3,1].sort((a,b)=>a<b?-1:1).join()}</p>')).toBe('<p>1,3</p>');
    });
  });

  it('covers expression comments, regexes, operand tracking, and unclosed expressions', () => {
    const res = parse(
      `{a /* block */ + // line\r\nb}` +
        `{/[a-z/]+\\/x/gi.test(s) ? <b>yes</b> : null}` +
        `{10 / 2 + (a) / 2 + arr[0] / 2 + x++ / 2 + x-- / 2}` +
        `{obj.return < 5 ? typeof <span>ok</span> : null}`
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ast.body[0]).toEqual({
        type: 'expression',
        source: 'a /* block */ + // line\r\nb',
        nodes: ['a /* block */ + // line\r\nb'],
      });
      const b1 = res.ast.body[1];
      expect(b1.type).toBe('expression');
      if (b1.type === 'expression') {
        expect(b1.source).toBe('/[a-z/]+\\/x/gi.test(s) ? [NODE] : null');
      }
      expect(res.ast.body[2]).toEqual({
        type: 'expression',
        source: '10 / 2 + (a) / 2 + arr[0] / 2 + x++ / 2 + x-- / 2',
        nodes: ['10 / 2 + (a) / 2 + arr[0] / 2 + x++ / 2 + x-- / 2'],
      });
      const b3 = res.ast.body[3];
      expect(b3.type).toBe('expression');
      if (b3.type === 'expression') {
        expect(b3.source).toBe('obj.return < 5 ? typeof [NODE] : null');
      }
    }

    const unclosedExpr = parse('{foo');
    expect(unclosedExpr.ok).toBe(false);
    if (!unclosedExpr.ok) {
      expect(unclosedExpr.error.message.includes('Unclosed expression')).toBe(true);
    }

    const unclosedBlockComment = parse('{a /* unclosed');
    expect(unclosedBlockComment.ok).toBe(false);
    if (!unclosedBlockComment.ok) {
      expect(unclosedBlockComment.error.message.includes('Unclosed expression')).toBe(true);
    }
  });

  it('covers template literal interpolation, string escapes, and sequential nested is:raw tags', () => {
    const exprRes = parse('{"a\\"b" + "${raw}" + `hi ${ { a: 1 }.a } \\`end`}');
    expect(exprRes.ok).toBe(true);
    if (exprRes.ok) {
      const node = exprRes.ast.body[0];
      expect(node.type).toBe('expression');
      if (node.type === 'expression') {
        expect(node.source).toBe('"a\\"b" + "${raw}" + `hi ${ { a: 1 }.a } \\`end`');
      }
    }

    const unclosedWithFm = parse('---\nconst x = 1;\n---\n{ "unclosed');
    expect(unclosedWithFm.ok).toBe(false);
    if (!unclosedWithFm.ok) {
      expect(unclosedWithFm.error.line).toBe(4);
      expect(unclosedWithFm.error.column).toBe(12);
      expect(unclosedWithFm.error.message).toBe('Unclosed string literal starting with "');
    }

    const seqRaw = parse('<div is:raw><div>1</div><div>2</div></div>');
    expect(seqRaw.ok).toBe(true);
    if (seqRaw.ok) {
      expect(seqRaw.ast.body[0]).toEqual({
        type: 'element',
        tag: 'div',
        attrs: [],
        children: [{ type: 'raw', html: '<div>1</div><div>2</div>' }],
        selfClosing: false,
      });
    }
  });

  it('covers compiler.ts debug errors, frontmatter stripping, comment expressions, precompiled map, and static attrs', () => {
    const errAst = parse('{(() => { throw new Error("kaboom"); })()}');
    expect(errAst.ok).toBe(true);
    if (errAst.ok) {
      const debugCompiled = compileTemplate(errAst.ast, { debug: true, templateId: 'err.sikka' });
      expect(debugCompiled.ok).toBe(true);
      if (debugCompiled.ok) {
        try {
          debugCompiled.fn.renderSync({});
          throw new Error('expected throw');
        } catch (err) {
          const sErr = err as SikkaError;
          expect(sErr.category).toBe('Render');
          expect(sErr.template).toBe('err.sikka');
          expect(sErr.message.includes('Runtime Error: kaboom')).toBe(true);
        }
      }

      const rawCompiled = compileTemplate(errAst.ast, { debug: false });
      expect(rawCompiled.ok).toBe(true);
      if (rawCompiled.ok) {
        expect(() => rawCompiled.fn.renderSync({})).toThrow(/^Error: kaboom$/);
      }
    }

    const fmAst = parse(
      '---\n  import Card from "./Card.sikka";\n  export const title = "hi";\n---\n{/* c1 */}{// c2\n}<p>{title}</p>'
    );
    expect(fmAst.ok).toBe(true);
    if (fmAst.ok) {
      const c = compileTemplate(fmAst.ast);
      expect(c.ok).toBe(true);
      if (c.ok) {
        expect(c.fn.renderSync({})).toBe('<p>hi</p>');
      }
    }

    const preMapEntry = precompile('map.sikka', {
      resolver: () => ({
        id: 'map.sikka',
        source:
          '---\nconst items = Sikka.props.items;\n---\n<ul>{items.map((x) => <li>{x}</li>)}</ul>',
      }),
    });
    const mapCode = emitModule(preMapEntry[0]!, { componentSpecifier: (c) => `./${c.id}.js` });
    expect(mapCode.includes('for (let __i = 0')).toBe(true);
    expect(mapCode.includes('__array.map(')).toBe(true);

    const preMapMultiArg = precompile('map-multi.sikka', {
      resolver: () => ({
        id: 'map-multi.sikka',
        source: '<ul>{Sikka.props.items.map((x, i) => <li>{i}:{x}</li>)}</ul>',
      }),
    });
    const multiCode = emitModule(preMapMultiArg[0]!, { componentSpecifier: (c) => `./${c.id}.js` });
    expect(multiCode.includes('__array.forEach(')).toBe(true);

    const preMapGuards = precompile('map-guards.sikka', {
      resolver: () => ({
        id: 'map-guards.sikka',
        source:
          '<ul>{Sikka.props.items?.map((x) => <li>{x}</li>)}{Sikka.props.items.map((x) => <li>{x}</li>, Sikka.props)}</ul>',
      }),
    });
    const guardsCode = emitModule(preMapGuards[0]!, { componentSpecifier: (c) => `./${c.id}.js` });
    expect(guardsCode.includes('__array.forEach(')).toBe(false);
    expect(guardsCode.includes('for (let __i')).toBe(false);

    const attrsAst = parse(
      '<my-widget active /><div hidden data-empty="" class="a" className="b" style="; color: red ;" style="; margin: 0 ;" data-x="a&b" /><div style /><Fragment set:html="<p>hi</p>" slot="main" /><Fragment set:html id="x" />'
    );
    expect(attrsAst.ok).toBe(true);
    if (attrsAst.ok) {
      const escaped = compileTemplate(attrsAst.ast);
      expect(escaped.ok).toBe(true);
      if (escaped.ok) {
        expect(escaped.fn.renderSync({})).toBe(
          '<my-widget active="true"></my-widget><div hidden data-empty data-x="a&amp;b" class="a b" style=" color: red ; margin: 0 "></div><div></div><p>hi</p>'
        );
      }

      const unescaped = compileTemplate(attrsAst.ast, { autoEscape: false });
      expect(unescaped.ok).toBe(true);
      if (unescaped.ok) {
        expect(unescaped.fn.renderSync({}).includes('data-x="a&b"')).toBe(true);
      }
    }
  });

  it('preserves compiler fast-path codegen shapes (direct return, merged static, trimmed preamble, single-line RawHtml)', () => {
    const plain = precompile('plain.sikka', {
      resolver: () => ({ id: 'plain.sikka', source: '<p>a</p><p>b</p>' }),
    });
    const plainCode = emitModule(plain[0]!, { componentSpecifier: (c) => `./${c.id}.js` });
    expect(plainCode.includes('return "<p>a</p><p>b</p>"')).toBe(true);
    expect(plainCode.includes('let __out')).toBe(false);
    expect(plainCode.includes('const Sikka')).toBe(false);
    expect(plainCode.includes('runtime(this)')).toBe(false);
    expect(plainCode.includes('const __components')).toBe(false);

    const propsOnly = precompile('props-only.sikka', {
      resolver: () => ({ id: 'props-only.sikka', source: '<p>{Sikka.props.x}</p>' }),
    });
    const propsCode = emitModule(propsOnly[0]!, { componentSpecifier: (c) => `./${c.id}.js` });
    expect(propsCode.includes('const Sikka')).toBe(false);
    expect(propsCode.includes('__expression(props.x)')).toBe(true);
    expect(propsCode.includes('slots:')).toBe(false);

    const dollarVarAst = parse("<p>{$S.props.x}{'Sikka.props.x'}</p>");
    expect(dollarVarAst.ok).toBe(true);
    if (dollarVarAst.ok) {
      const c = compileTemplate(dollarVarAst.ast, { varName: '$S' });
      expect(c.ok).toBe(true);
      if (c.ok) expect(c.fn.renderSync({ x: 'ok' })).toBe('<p>okSikka.props.x</p>');
    }

    const noParenMap = precompile('map-noparen.sikka', {
      resolver: () => ({
        id: 'map-noparen.sikka',
        source: '<ul>{Sikka.props.items.map(x => <li>{x}</li>)}</ul>',
      }),
    });
    const noParenCode = emitModule(noParenMap[0]!, { componentSpecifier: (c) => `./${c.id}.js` });
    expect(noParenCode.includes('for (let __i = 0')).toBe(true);

    const singleRaw = precompile('single-raw.sikka', {
      resolver: () => ({ id: 'single-raw.sikka', source: '{true ? <b>ok</b> : null}' }),
    });
    const rawCode = emitModule(singleRaw[0]!, { componentSpecifier: (c) => `./${c.id}.js` });
    expect(rawCode.includes('new __RawHtml("<b>ok</b>")')).toBe(true);
    expect(rawCode.includes('let __out = "";')).toBe(false);
  });
});
