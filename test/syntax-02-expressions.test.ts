import { describe, it, expect } from 'vitest';
import { render } from './helpers.js';

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
  });
});
