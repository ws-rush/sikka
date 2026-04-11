/**
 * Unit tests for the parser — Requirements 1.1–1.7
 */

import { describe, it, expect } from 'vitest';
import { parse } from './parser.js';
import type {
  TemplateAST,
  ElementNode,
  ExpressionNode,
  TextNode,
  SlotNode,
  ScriptNode,
  StyleNode,
} from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(source: string): TemplateAST {
  const result = parse(source);
  if (!result.ok) throw new Error(`Expected parse success but got error: ${result.error.message}`);
  return result.ast;
}

function fail(source: string) {
  const result = parse(source);
  if (result.ok) throw new Error('Expected parse failure but got success');
  return result.error;
}

// ─── Frontmatter (Requirement 1.1) ───────────────────────────────────────────

describe('frontmatter extraction', () => {
  it('extracts frontmatter source between --- fences', () => {
    const ast = ok(`---\nconst x = 1;\n---\n<p>hello</p>`);
    expect(ast.frontmatter.source).toBe('const x = 1;');
  });

  it('handles template with no frontmatter', () => {
    const ast = ok(`<p>hello</p>`);
    expect(ast.frontmatter.source).toBe('');
  });

  it('returns ParseError with line/column for unclosed frontmatter fence', () => {
    const err = fail(`---\nconst x = 1;\n`);
    expect(err.message).toMatch(/unclosed frontmatter/i);
    expect(err.line).toBeGreaterThan(0);
    expect(err.column).toBeGreaterThan(0);
  });
  it('fails with malformed frontmatter (no newline after opening fence)', () => {
    const err = fail(`---malformed`);
    expect(err.message).toMatch(/unclosed frontmatter/i);
  });

  it('handles frontmatter with no newline after closing fence (coverage for line 100)', () => {
    const ast = ok(`---\nconst x = 1;\n---<p>no newline</p>`);
    expect(ast.frontmatter.source).toBe('const x = 1;');
    expect((ast.body[0] as ElementNode).tag).toBe('p');
  });

  it('handles empty body after frontmatter (coverage for line 100)', () => {
    const ast = ok(`---\nconst x = 1;\n---`);
    expect(ast.body).toHaveLength(0);
  });
});

// ─── Import collection (Requirement 1.3) ─────────────────────────────────────

describe('import collection', () => {
  it('collects component imports from frontmatter', () => {
    const ast = ok(`---\nimport Button from './Button.astro';\n---\n`);
    expect(ast.imports).toHaveLength(1);
    expect(ast.imports[0]).toEqual({ localName: 'Button', specifier: './Button.astro' });
  });

  it('collects multiple imports', () => {
    const ast = ok(`---\nimport A from './A.astro';\nimport B from './B.astro';\n---\n`);
    expect(ast.imports).toHaveLength(2);
    expect(ast.imports[0].localName).toBe('A');
    expect(ast.imports[1].localName).toBe('B');
  });

  it('returns empty imports when no import statements', () => {
    const ast = ok(`---\nconst x = 1;\n---\n`);
    expect(ast.imports).toHaveLength(0);
  });
});

// ─── Text nodes ───────────────────────────────────────────────────────────────

describe('text nodes', () => {
  it('parses plain text', () => {
    const ast = ok(`hello world`);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toEqual({ type: 'text', value: 'hello world' });
  });
});

// ─── Expression nodes (Requirement 1.2) ──────────────────────────────────────

describe('expression nodes', () => {
  it('parses a simple expression', () => {
    const ast = ok(`{name}`);
    expect(ast.body[0]).toEqual({ type: 'expression', source: 'name' });
  });

  it('parses a nested expression with braces', () => {
    const ast = ok(`{obj.fn({key: 'val'})}`);
    const node = ast.body[0] as ExpressionNode;
    expect(node.type).toBe('expression');
    expect(node.source).toContain('obj.fn');
  });

  it('returns ParseError for unclosed expression', () => {
    const err = fail(`{unclosed`);
    expect(err.message).toMatch(/unclosed expression/i);
  });

  it('parses expressions with string literals and escaped quotes', () => {
    const ast = ok(`{"quoted \\" string"}`);
    expect((ast.body[0] as ExpressionNode).source).toBe('"quoted \\" string"');
  });

  it('parses expressions with template literals', () => {
    const ast = ok(`{\`count: \${n}\`}`);
    expect((ast.body[0] as ExpressionNode).source).toBe('`count: ${n}`');
  });

  it('returns ParseError for unclosed string literal in expression', () => {
    const err = fail(`{"unclosed}`);
    expect(err.message).toMatch(/unclosed string literal/i);
  });

  it('parses expressions with nested braces in template literals', () => {
    const ast = ok(`{\`\${{a:1}.a}\`}`);
    expect((ast.body[0] as ExpressionNode).source).toBe('`${{a:1}.a}`');
  });
});

// ─── Element nodes (Requirement 1.2) ─────────────────────────────────────────

describe('element nodes', () => {
  it('parses a simple element', () => {
    const ast = ok(`<p>hello</p>`);
    const el = ast.body[0] as ElementNode;
    expect(el.type).toBe('element');
    expect(el.tag).toBe('p');
    expect(el.selfClosing).toBe(false);
    expect((el.children[0] as TextNode).value).toBe('hello');
  });

  it('parses a self-closing element', () => {
    const ast = ok(`<br />`);
    const el = ast.body[0] as ElementNode;
    expect(el.type).toBe('element');
    expect(el.tag).toBe('br');
    expect(el.selfClosing).toBe(true);
  });

  it('parses nested elements', () => {
    const ast = ok(`<div><span>text</span></div>`);
    const div = ast.body[0] as ElementNode;
    expect(div.tag).toBe('div');
    const span = div.children[0] as ElementNode;
    expect(span.tag).toBe('span');
  });

  it('parses string attributes', () => {
    const ast = ok(`<a href="/home">link</a>`);
    const el = ast.body[0] as ElementNode;
    expect(el.attrs[0]).toEqual({ name: 'href', value: '/home' });
  });

  it('parses boolean attributes', () => {
    const ast = ok(`<input disabled />`);
    const el = ast.body[0] as ElementNode;
    expect(el.attrs[0]).toEqual({ name: 'disabled', value: true });
  });

  it('parses dynamic expression attributes', () => {
    const ast = ok(`<div class={cls} />`);
    const el = ast.body[0] as ElementNode;
    expect(el.attrs[0].name).toBe('class');
    expect((el.attrs[0].value as ExpressionNode).type).toBe('expression');
    expect((el.attrs[0].value as ExpressionNode).source).toBe('cls');
  });

  it('returns ParseError for unclosed tag', () => {
    const err = fail(`<div><span>text</span>`);
    expect(err.message).toMatch(/unclosed tag/i);
    expect(err.line).toBeGreaterThan(0);
  });

  it('handles void elements without closing tag', () => {
    const ast = ok(`<img src="x.png">`);
    const el = ast.body[0] as ElementNode;
    expect(el.tag).toBe('img');
    expect(el.children).toHaveLength(0);
  });

  it('returns ParseError when no tag name after <', () => {
    const err = fail(`< `);
    expect(err.message).toMatch(/Expected tag name after `<`/i);
  });

  it('returns ParseError for malformed closing tag expected >', () => {
    const err = fail(`<div></div `);
    expect(err.message).toMatch(/Expected '>' to close <\/div>/i);
  });

  it('returns ParseError when > or /> is missing in opening tag', async () => {
    const err = fail(`<div class="foo" `);
    expect(err.message).toMatch(/Expected '>' or '\/>' to close opening tag <div/i);
  });
  it('handles unexpected closing tag at top level (returns null node)', () => {
    const ast = ok(`<div></div></unexpected>`);
    expect(ast.body).toHaveLength(1);
    expect((ast.body[0] as ElementNode).tag).toBe('div');
  });
});

describe('comments', () => {
  it('parses and drops comments', () => {
    const ast = ok(`<!-- comment --><p>hi</p>`);
    expect(ast.body).toHaveLength(1);
    const p = ast.body[0] as ElementNode;
    expect(p.tag).toBe('p');
    expect((p.children[0] as TextNode).value).toBe('hi');
  });

  it('returns ParseError for unclosed comment', () => {
    const err = fail(`<!-- unclosed`);
    expect(err.message).toMatch(/unclosed HTML comment/i);
  });

  it('drops comments inside elements (coverage line 492)', () => {
    const ast = ok(`<div><!-- comment --><span>hi</span></div>`);
    const div = ast.body[0] as ElementNode;
    expect(div.children).toHaveLength(1);
    expect((div.children[0] as ElementNode).tag).toBe('span');
  });
});

// ─── Slot nodes (Requirement 1.4) ────────────────────────────────────────────

describe('slot nodes', () => {
  it('parses default slot', () => {
    const ast = ok(`<slot />`);
    const node = ast.body[0] as SlotNode;
    expect(node.type).toBe('slot');
    expect(node.name).toBe('');
  });

  it('parses named slot', () => {
    const ast = ok(`<slot name="header" />`);
    const node = ast.body[0] as SlotNode;
    expect(node.type).toBe('slot');
    expect(node.name).toBe('header');
  });

  it('returns ParseError for unclosed slot tag', () => {
    const err = fail(`<slot>`);
    expect(err.message).toMatch(/unclosed <slot> tag/i);
  });

  it('returns ParseError for malformed slot tag', () => {
    const err = fail(`<slot unclosed `);
    expect(err.message).toMatch(/Expected `\/>` or `>` after <slot> attributes/i);
  });

  it('returns ParseError for slot with attribute parse error (coverage for line 395)', () => {
    const err = fail(`<slot name={unclosed />`);
    expect(err.message).toMatch(/unclosed expression/i);
  });

  it('returns ParseError for slot with child parse error (coverage for line 418)', () => {
    const err = fail(`<slot>{unclosed</slot>`);
    expect(err.message).toMatch(/unclosed expression/i);
  });

  it('drops comments inside slots (coverage line 419)', () => {
    const ast = ok(`<slot><!-- comment --><p>hi</p></slot>`);
    const slot = ast.body[0] as SlotNode;
    expect(slot.children).toHaveLength(1);
    expect((slot.children[0] as ElementNode).tag).toBe('p');
  });
});

// ─── Script / Style nodes (Requirement 1.5) ──────────────────────────────────

describe('script and style nodes', () => {
  it('parses script tag with verbatim content', () => {
    const ast = ok(`<script>const x = 1;</script>`);
    const node = ast.body[0] as ScriptNode;
    expect(node.type).toBe('script');
    expect(node.content).toBe('const x = 1;');
  });

  it('parses style tag with verbatim content', () => {
    const ast = ok(`<style>body { color: red; }</style>`);
    const node = ast.body[0] as StyleNode;
    expect(node.type).toBe('style');
    expect(node.content).toBe('body { color: red; }');
  });

  it('does not parse expressions inside script', () => {
    const ast = ok(`<script>{notAnExpression}</script>`);
    const node = ast.body[0] as ScriptNode;
    expect(node.type).toBe('script');
    expect(node.content).toBe('{notAnExpression}');
  });

  it('parses self-closing script and style', () => {
    const ast1 = ok(`<script />`);
    expect((ast1.body[0] as ScriptNode).content).toBe('');
    const ast2 = ok(`<style />`);
    expect((ast2.body[0] as StyleNode).content).toBe('');
  });

  it('returns ParseError for unclosed script/style tag', () => {
    const err = fail(`<script>console.log(1);`);
    expect(err.message).toMatch(/unclosed <script> tag/i);
  });

  it('returns ParseError for malformed opening script tag', () => {
    const err = fail(`<script / `); // expected > after /
    expect(err.message).toMatch(/Expected '>' after '\/'/i);
  });

  it('returns ParseError for malformed raw tag open', () => {
    const err = fail(`<script x`); // expected > to close opening tag
    expect(err.message).toMatch(/Expected '>' to close <script> opening tag/i);
  });

  it('returns ParseError for script with attribute parse error (coverage for line 364)', () => {
    const err = fail(`<script lang={unclosed ></script>`);
    expect(err.message).toMatch(/unclosed expression/i);
  });
});

describe('attribute value parsing', () => {
  it('parses unquoted attribute values', () => {
    const ast = ok(`<div class=foo></div>`);
    const el = ast.body[0] as ElementNode;
    expect(el.attrs[0].value).toBe('foo');
  });

  it('returns ParseError for unclosed attribute string', () => {
    const err = fail(`<div class="unclosed></div>`);
    expect(err.message).toMatch(/unclosed attribute value string/i);
  });

  it('returns ParseError for unclosed expression in attribute value (coverage for line 552)', () => {
    const err = fail(`<div attr={unclosed ></div>`);
    expect(err.message).toMatch(/unclosed expression/i);
  });
});

// ─── Error location (Requirements 1.6, 1.7) ──────────────────────────────────

describe('error location reporting', () => {
  it('reports correct line for unclosed frontmatter', () => {
    const err = fail(`---\nline2\nline3\n`);
    expect(err.line).toBeGreaterThanOrEqual(3);
  });

  it('reports correct line for unclosed tag', () => {
    const err = fail(`<div>\n<p>text</p>\n`);
    expect(err.line).toBeGreaterThanOrEqual(1);
    expect(err.message).toMatch(/unclosed tag/i);
  });
});

// ─── Parser error cases — Requirements 1.6, 1.7 ──────────────────────────────

describe('parser error cases', () => {
  // Requirement 1.6: unclosed frontmatter fence
  it('unclosed frontmatter fence returns ParseError with correct line and column', () => {
    // Source: "---\nconst x = 1;\n" — no closing ---
    // The parser reaches end-of-string (offset 17) to report the error.
    // positionAt("---\nconst x = 1;\n", 17) → line 3, column 1
    const err = fail(`---\nconst x = 1;\n`);
    expect(err.message).toMatch(/unclosed frontmatter/i);
    expect(err.line).toBe(3);
    expect(err.column).toBe(1);
  });

  it('unclosed frontmatter fence on last line reports correct line', () => {
    // Source: "---\nline2\nline3\n" — 3 lines, error at end (offset 16) → line 4, column 1
    const err = fail(`---\nline2\nline3\n`);
    expect(err.message).toMatch(/unclosed frontmatter/i);
    expect(err.line).toBe(4);
    expect(err.column).toBe(1);
  });

  // Requirement 1.7: unclosed JSX tag
  it('unclosed JSX tag returns ParseError with correct line and column', () => {
    // Source: "<div>\n<p>text</p>\n" — <div> is never closed
    // Error points to the start of <div> at offset 0 → line 1, column 1
    const err = fail(`<div>\n<p>text</p>\n`);
    expect(err.message).toMatch(/unclosed tag/i);
    expect(err.line).toBe(1);
    expect(err.column).toBe(1);
  });

  it('unclosed JSX tag on second line reports correct line and column', () => {
    // Source: "<p>\n<div>\n</p>" — <div> is unclosed (</p> closes <p> first)
    // <div> starts at offset 4 → line 2, column 1
    const err = fail(`<p>\n<div>\n</p>`);
    expect(err.message).toMatch(/unclosed tag/i);
    expect(err.line).toBe(2);
    expect(err.column).toBe(1);
  });
});

// ─── Mixed content ────────────────────────────────────────────────────────────

describe('mixed content', () => {
  it('parses a realistic template', () => {
    const src = `---
import Button from './Button.astro';
const title = 'Hello';
---
<html>
  <head><title>{title}</title></head>
  <body>
    <slot />
    <style>body { margin: 0; }</style>
  </body>
</html>`;
    const ast = ok(src);
    expect(ast.frontmatter.source).toContain("const title = 'Hello'");
    expect(ast.imports[0].localName).toBe('Button');
    // body should have an html element
    const html = ast.body.find((n) => n.type === 'element' && (n as ElementNode).tag === 'html');
    expect(html).toBeDefined();
  });
});
