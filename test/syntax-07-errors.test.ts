import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { Sikka, SikkaError } from '../src/index.js';
import { compileSources } from '../src/compiler.js';
import { compile as precompile } from '../src/precompile.js';
import { parse } from '../src/parser.js';
import { render } from './helpers.js';

function source(template: string): Sikka {
  return new Sikka({
    mode: 'source',
    resolver: () => ({ id: 'invalid.sikka', source: template }),
  });
}

describe('Syntax: Error Handling', () => {
  it('reports parser failures at the source entry boundary', () => {
    for (const template of ['---\nconst x = 1;', '<div>unclosed', '<div>{unclosed'])
      expect(() => render(template)).toThrow(/ParseError/);
  });

  it('reports typed source diagnostics with the canonical Template identity', () => {
    assert.throws(
      () => source('<div>').render('page'),
      (error: unknown) =>
        error instanceof SikkaError &&
        error.category === 'Parse' &&
        error.template === 'invalid.sikka' &&
        error.line === 1
    );
  });

  it('rejects invalid Directives consistently in Render, Streaming, and precompile', async () => {
    const template = '<div set:html="a" set:text="b" />';
    expect(() => source(template).render('page')).toThrow(/InvalidDirective/);
    expect(() => source(template).stream('page')).toThrow(/InvalidDirective/);
    expect(() =>
      precompile('page', { resolver: () => ({ id: 'page', source: template }) })
    ).toThrow(/InvalidDirective/);
  });

  it('categorizes invalid constructs before rendering', () => {
    const parsed = parse('<Fragment is:raw />');
    if (parsed.ok) throw new Error('Expected an invalid Fragment diagnostic');
    expect(parsed.error.category).toBe('Parse');
    expect(parsed.error.construct).toBe('Fragment');

    const directive = parse('<div set:html="a" set:text="b" />');
    if (!directive.ok) throw new Error('Expected a parsed Template');
    const compiled = compileSources(directive.ast);
    if (compiled.ok) throw new Error('Expected an invalid Directive diagnostic');
    expect(compiled.error.category).toBe('Compile');
    expect(compiled.error.construct).toBe('directive');
  });

  it('reports source resolver failures', () => {
    const sikka = new Sikka({
      mode: 'source',
      resolver: () => {
        throw new Error('missing');
      },
    });
    expect(() => sikka.render('page')).toThrow(/ResolveError.*page.*missing/);
  });

  it('covers parser line/column tracking, void elements, single-quoted/unclosed attrs, and type-only imports', () => {
    const multiLineErr = parse('<div>\n  <span>\n</div>\n<p>');
    expect(multiLineErr.ok).toBe(false);
    if (!multiLineErr.ok) {
      expect(multiLineErr.error.line).toBe(4);
      expect(multiLineErr.error.column).toBe(1);
    }

    const unclosedAttr = parse("<div class='unclosed");
    expect(unclosedAttr.ok).toBe(false);
    if (!unclosedAttr.ok) {
      expect(unclosedAttr.error.message.includes('Unclosed attribute value string')).toBe(true);
    }

    const singleQuotedAndVoid = parse(
      "<head><meta charset='utf-8'><link rel='stylesheet'></head><hr><p>ok</p>"
    );
    expect(singleQuotedAndVoid.ok).toBe(true);

    const typeImports = parse(
      '---\nimport { type A, type B } from "./types.js";\n---\n<p { ...Sikka.props.attrs }>ok</p>'
    );
    expect(typeImports.ok).toBe(true);
    if (typeImports.ok) {
      expect(typeImports.ast.imports.length).toBe(0);
    }
  });

  it('covers import forms: side-effect, namespace, mixed default/named/aliased/inline-type, and multiline', () => {
    const res = parse(`---
import './setup.js';
import type DefaultOnly from './types.js';
import * as UI from './UI.sikka';
  import Card, {
    Header,
    Footer as Foot,
    type CardProps,
  } from './Card.sikka';
---
<Card />`);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ast.imports).toEqual([
        { localName: '', specifier: './setup.js', isComponent: false },
        { localName: 'UI', specifier: './UI.sikka', isComponent: true },
        { localName: 'Card', specifier: './Card.sikka', isComponent: true },
        { localName: 'Header', specifier: './Card.sikka', isComponent: true },
        { localName: 'Foot', specifier: './Card.sikka', isComponent: true },
      ]);
    }
  });

  it('covers attribute whitespace, spread nodes, raw asset slash, and missing attribute name', () => {
    const res = parse('<div id = "x" {...props} /><script src="a.js" />');
    expect(res.ok).toBe(true);
    if (res.ok) {
      const div = res.ast.body[0];
      expect(div.type).toBe('element');
      if (div.type === 'element') {
        expect(div.attrs[0]).toEqual({ name: 'id', value: 'x' });
        const spread = div.attrs[1];
        expect(spread.type).toBe('spread');
        if (spread.type === 'spread') {
          expect(spread.expression.source).toBe('props');
          expect(spread.expression.nodes?.[0]).toBe('props');
        }
      }
    }

    for (const badRaw of ['<script src="a.js" / >', '<style / >']) {
      const bad = parse(badRaw);
      expect(bad.ok).toBe(false);
      if (!bad.ok) {
        expect(bad.error.message.includes("Expected '>' after '/'")).toBe(true);
      }
    }

    const noAttrName = parse('<div =1>');
    expect(noAttrName.ok).toBe(false);
    if (!noAttrName.ok) {
      expect(noAttrName.error.message.includes('Expected attribute name')).toBe(true);
    }

    const unclosedSpread = parse('<div {...props>');
    expect(unclosedSpread.ok).toBe(false);
  });

  it('covers frontmatter fences, hasAwait comment/string filtering, and rejectedConstruct', () => {
    const noNewline = parse('---');
    expect(noNewline.ok).toBe(false);
    if (!noNewline.ok) {
      expect(noNewline.error.message).toBe('Unclosed frontmatter fence');
    }

    const noClose = parse('---\nconst x = 1;');
    expect(noClose.ok).toBe(false);
    if (!noClose.ok) {
      expect(noClose.error.message.includes('missing closing')).toBe(true);
    }

    const noBodyNewline = parse('---\n---<p>hi</p>');
    expect(noBodyNewline.ok).toBe(true);
    if (noBodyNewline.ok) {
      const first = noBodyNewline.ast.body[0];
      expect(first.type).toBe('element');
      if (first.type === 'element') expect(first.tag).toBe('p');
    }

    const fakeAwait = parse(
      `---\n/* await x */\n// await y\nconst a = "await";\nconst b = 'don\\'t await';\nconst c = \`await\`;\n---\n<p/>`
    );
    expect(fakeAwait.ok).toBe(true);
    if (fakeAwait.ok) {
      expect(fakeAwait.ast.frontmatter.hasAwait).toBe(false);
    }

    const realAwait = parse('---\nconst data = await fetch("/x");\n---\n<p/>');
    expect(realAwait.ok).toBe(true);
    if (realAwait.ok) {
      expect(realAwait.ast.frontmatter.hasAwait).toBe(true);
    }

    const badDirective = parse('<div is:inline />');
    expect(badDirective.ok).toBe(false);
    if (!badDirective.ok) {
      expect(badDirective.error.construct).toBe('directive');
    }

    const badFragment = parse('<Fragment is:raw><p/></Fragment>');
    expect(badFragment.ok).toBe(false);
    if (!badFragment.ok) {
      expect(badFragment.error.construct).toBe('Fragment');
      expect(badFragment.error.message.includes('is:raw')).toBe(true);
    }
  });

  it('covers stray closing tags, comment boundaries, spread trimming, and slot edge cases', () => {
    const strayClose = parse('<p>hi<!-- c --></p></div>');
    expect(strayClose.ok).toBe(true);
    if (strayClose.ok) {
      expect(strayClose.ast.body.length).toBe(1);
      const p = strayClose.ast.body[0];
      expect(p.type).toBe('element');
      if (p.type === 'element') {
        expect(p.children).toEqual([
          { type: 'text', value: 'hi' },
          { type: 'raw', html: '<!-- c -->' },
        ]);
      }
    }

    const unclosedComment = parse('<!-- unclosed');
    expect(unclosedComment.ok).toBe(false);
    if (!unclosedComment.ok) {
      expect(unclosedComment.error.message).toBe('Unclosed HTML comment');
    }

    const unclosedExprStr = parse('{ "unclosed }');
    expect(unclosedExprStr.ok).toBe(false);

    const spacedSpread = parse('<div {... props } />');
    expect(spacedSpread.ok).toBe(true);
    if (spacedSpread.ok) {
      const div = spacedSpread.ast.body[0];
      if (div.type === 'element' && div.attrs[0].type === 'spread') {
        expect(div.attrs[0].expression.source).toBe('props');
        expect(div.attrs[0].expression.nodes?.[0]).toBe('props');
      }
    }

    const slotAttrs = parse(
      '<slot {...extra} name slot /><slot name={n} slot={s}><span>fb</span></slot>'
    );
    expect(slotAttrs.ok).toBe(true);
    if (slotAttrs.ok) {
      expect(slotAttrs.ast.body[0]).toEqual({
        type: 'slot',
        name: '',
        nameExpr: undefined,
        slot: undefined,
        slotExpr: undefined,
        children: [],
      });
      const s2 = slotAttrs.ast.body[1];
      expect(s2.type).toBe('slot');
      if (s2.type === 'slot') {
        expect(s2.nameExpr?.source).toBe('n');
        expect(s2.slotExpr?.source).toBe('s');
        expect(s2.children.length).toBe(1);
      }
    }

    for (const [badSlot, msg] of [
      ['<slot name="a"', 'Expected `/>` or `>` after <slot> attributes'],
      ['<slot>unclosed', 'Unclosed <slot> tag'],
      ['<slot></div></slot>', 'Unclosed <slot> tag'],
      ['<slot>{unclosed</slot>', 'Unclosed expression `{`'],
    ] as const) {
      const err = parse(badSlot);
      expect(err.ok).toBe(false);
      if (!err.ok) {
        expect(err.error.message).toBe(msg);
      }
    }
  });

  it('recognizes all OPERAND_KEYWORDS before JSX and all HTML VOID_ELEMENTS', () => {
    for (const kw of [
      'return',
      'yield',
      'await',
      'throw',
      'case',
      'typeof',
      'void',
      'delete',
      'in',
      'instanceof',
      'new',
      'of',
      'else',
      'do',
    ]) {
      const res = parse(`{() => { ${kw} <span>ok</span> }}`);
      expect(res.ok).toBe(true);
      if (res.ok) {
        const expr = res.ast.body[0];
        expect(expr.type).toBe('expression');
        if (expr.type === 'expression') {
          expect(expr.nodes?.some((n) => typeof n !== 'string' && n.type === 'element')).toBe(true);
        }
      }
    }

    for (const tag of [
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr',
    ]) {
      const res = parse(`<${tag}><p>after</p>`);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.ast.body.length).toBe(2);
      }
    }
  });
});
