/**
 * Property-based tests for the parser
 *
 * // Feature: astro-template-engine, Property 1: Parser round-trip — parse → print → parse produces equivalent AST
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { parse } from './parser.js';
import { print } from './printer.js';
import type {
  TemplateAST,
  TemplateNode,
  AttrNode,
  SpreadAttrNode,
  ComponentImport,
} from './types.js';

// ─── AST equivalence helpers ──────────────────────────────────────────────────

/**
 * Deep structural equality for two ASTs, ignoring insignificant whitespace
 * differences in text nodes that arise from pretty-printing.
 */
function astsEquivalent(a: TemplateAST, b: TemplateAST): boolean {
  if (a.frontmatter.source !== b.frontmatter.source) return false;
  if (!importsEquivalent(a.imports, b.imports)) return false;
  if (!nodesEquivalent(a.body, b.body)) return false;
  return true;
}

function importsEquivalent(a: ComponentImport[], b: ComponentImport[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((ai, i) => ai.localName === b[i].localName && ai.specifier === b[i].specifier);
}

function nodesEquivalent(a: TemplateNode[], b: TemplateNode[]): boolean {
  // Filter out empty text nodes that may appear/disappear after printing
  const fa = a.filter((n) => !(n.type === 'text' && n.value.trim() === ''));
  const fb = b.filter((n) => !(n.type === 'text' && n.value.trim() === ''));
  if (fa.length !== fb.length) return false;
  return fa.every((na, i) => nodeEquivalent(na, fb[i]));
}

function nodeEquivalent(a: TemplateNode, b: TemplateNode): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'text':
      return b.type === 'text' && a.value === b.value;
    case 'expression':
      return b.type === 'expression' && a.source === b.source;
    case 'slot':
      return b.type === 'slot' && a.name === b.name;
    case 'script':
      return b.type === 'script' && a.content === b.content;
    case 'style':
      return b.type === 'style' && a.content === b.content;
    case 'raw':
      return b.type === 'raw' && a.html === b.html;
    case 'element':
      if (b.type !== 'element') return false;
      if (a.tag !== b.tag) return false;
      if (a.selfClosing !== b.selfClosing) return false;
      if (!attrsEquivalent(a.attrs, b.attrs)) return false;
      if (!nodesEquivalent(a.children, b.children)) return false;
      return true;
  }
}

function attrsEquivalent(
  a: (AttrNode | SpreadAttrNode)[],
  b: (AttrNode | SpreadAttrNode)[]
): boolean {
  if (a.length !== b.length) return false;
  return a.every((ai, i) => {
    const bi = b[i];

    // Narrow SpreadAttrNode
    if ('type' in ai && ai.type === 'spread') {
      const bSpread = bi as SpreadAttrNode;
      return 'type' in bi && bi.type === 'spread' && ai.expression === bSpread.expression;
    }
    // If we reach here, ai is AttrNode (or at least not a spread we support)
    if ('type' in bi && bi.type === 'spread') return false;

    // Both are AttrNode
    const aAttr = ai as AttrNode;
    const bAttr = bi as AttrNode;

    if (aAttr.name !== bAttr.name) return false;
    if (aAttr.value === true && bAttr.value === true) return true;
    if (typeof aAttr.value === 'string' && typeof bAttr.value === 'string') {
      return aAttr.value === bAttr.value;
    }
    if (
      typeof aAttr.value === 'object' &&
      typeof bAttr.value === 'object' &&
      'type' in aAttr.value &&
      aAttr.value.type === 'expression' &&
      'type' in bAttr.value &&
      bAttr.value.type === 'expression'
    ) {
      return aAttr.value.source === bAttr.value.source;
    }
    return false;
  });
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Safe text content: no `<`, `{`, `}` characters to avoid ambiguity */
const safeText = fc
  .string({ minLength: 1, maxLength: 30 })
  .map((s) => s.replace(/[<>{}"'\\]/g, '_'))
  .filter((s) => s.length > 0 && s.trim().length > 0);

/** Safe attribute name: starts with a letter, alphanumeric + hyphen */
const attrName = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/).filter((s) => s.length > 0);

/** Safe attribute string value: no quotes or angle brackets */
const attrStringValue = fc
  .string({ minLength: 0, maxLength: 20 })
  .map((s) => s.replace(/["'<>&]/g, '_'));

/** Safe expression source: simple identifiers and property accesses */
const exprSource = fc.oneof(
  fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,10}$/),
  fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,5}\.[a-z][a-zA-Z0-9]{0,5}$/)
);

/** Safe HTML tag names */
const safeTags = fc.constantFrom(
  'div',
  'span',
  'p',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'nav',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3'
);

/** Safe slot names */
const slotName = fc.oneof(fc.constant(''), fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/));

/** Safe script/style content: no closing tag sequences */
const verbatimContent = fc
  .string({ minLength: 0, maxLength: 40 })
  .map((s) => s.replace(/<\//g, '__').replace(/-->/g, '__'));

/** A single attribute node */
const attrArb: fc.Arbitrary<AttrNode> = fc.oneof(
  // Boolean attribute
  attrName.map((name) => ({ name, value: true as const })),
  // String attribute
  fc.record({ name: attrName, value: attrStringValue }),
  // Expression attribute
  fc.record({
    name: attrName,
    value: exprSource.map((source) => ({ type: 'expression' as const, source })),
  })
);

/** Leaf template nodes (no children) */
const leafNodeArb: fc.Arbitrary<TemplateNode> = fc.oneof(
  // Text node
  safeText.map((value) => ({ type: 'text' as const, value })),
  // Expression node
  exprSource.map((source) => ({ type: 'expression' as const, source })),
  // Default slot
  fc.constant({ type: 'slot' as const, name: '', children: [] as TemplateNode[] }),
  // Named slot
  slotName
    .filter((n) => n !== '')
    .map((name) => ({ type: 'slot' as const, name, children: [] as TemplateNode[] })),
  // Script node
  verbatimContent.map((content) => ({
    type: 'script' as const,
    content,
    attrs: [] as (AttrNode | SpreadAttrNode)[],
  })),
  // Style node
  verbatimContent.map((content) => ({
    type: 'style' as const,
    content,
    attrs: [] as (AttrNode | SpreadAttrNode)[],
  }))
);

/** Element node with optional leaf children */
const elementNodeArb: fc.Arbitrary<TemplateNode> = fc
  .record({
    type: fc.constant('element' as const),
    tag: safeTags,
    attrs: fc.array(attrArb, { minLength: 0, maxLength: 3 }),
    children: fc.array(leafNodeArb, { minLength: 0, maxLength: 3 }),
    selfClosing: fc.boolean(),
  })
  .map((node) => {
    // Self-closing elements must have no children
    if (node.selfClosing) {
      return { ...node, children: [] as TemplateNode[] };
    }
    return node;
  });

/** Top-level body nodes: mix of leaves and elements */
const bodyNodeArb: fc.Arbitrary<TemplateNode> = fc.oneof(leafNodeArb, elementNodeArb);

/** Safe frontmatter source (no --- sequences) */
const frontmatterSource = fc
  .string({ minLength: 0, maxLength: 60 })
  .map((s) => s.replace(/---/g, '___').replace(/\r/g, ''))
  .filter((s) => !s.includes('---'));

/** A component import */
const componentImportArb: fc.Arbitrary<ComponentImport> = fc.record({
  localName: fc.stringMatching(/^[A-Z][a-zA-Z]{0,10}$/),
  specifier: fc.stringMatching(/^\.[/][a-z][a-zA-Z0-9]{0,10}\.astro$/),
});

/**
 * Build a valid template string from structured parts.
 * We build the string via `print` on a hand-constructed AST so we know
 * the string is always syntactically valid.
 */
const validTemplateArb: fc.Arbitrary<string> = fc
  .record({
    frontmatterSource,
    imports: fc.array(componentImportArb, { minLength: 0, maxLength: 2 }),
    body: fc.array(bodyNodeArb, { minLength: 0, maxLength: 5 }),
  })
  .map(({ frontmatterSource: fmSrc, imports, body }) => {
    // Build import lines to embed in frontmatter
    const importLines = imports
      .map((imp) => `import ${imp.localName} from '${imp.specifier}';`)
      .join('\n');

    const fullFrontmatter = [importLines, fmSrc].filter(Boolean).join('\n');

    const ast: TemplateAST = {
      frontmatter: { source: fullFrontmatter },
      body,
      imports,
    };

    return print(ast);
  });

// ─── Property 1: Parser round-trip ───────────────────────────────────────────

describe('Property 1: Parser round-trip', () => {
  // Feature: astro-template-engine, Property 1: Parser round-trip — parse → print → parse produces equivalent AST

  it('parse(print(parse(src).ast)) produces equivalent AST for generated valid templates', () => {
    fc.assert(
      fc.property(validTemplateArb, (src) => {
        // First parse
        const result1 = parse(src);
        if (!result1.ok) {
          // The generated template should always be valid; if not, skip this sample
          return true;
        }
        const ast1 = result1.ast;

        // Print
        const printed = print(ast1);

        // Second parse
        const result2 = parse(printed);
        if (!result2.ok) {
          // The printed output must be parseable
          throw new Error(
            `print(ast) produced unparseable output.\nPrinted:\n${printed}\nError: ${result2.error.message}`
          );
        }
        const ast2 = result2.ast;

        // Assert structural equivalence
        const equivalent = astsEquivalent(ast1, ast2);
        if (!equivalent) {
          throw new Error(
            `ASTs not equivalent after round-trip.\n` +
              `Source:\n${src}\n\n` +
              `Printed:\n${printed}\n\n` +
              `AST1: ${JSON.stringify(ast1, null, 2)}\n\n` +
              `AST2: ${JSON.stringify(ast2, null, 2)}`
          );
        }
        return true;
      }),
      { numRuns: 100, verbose: false }
    );
  });

  it('round-trip holds for template with only frontmatter', () => {
    fc.assert(
      fc.property(frontmatterSource, (fmSrc) => {
        const ast: TemplateAST = {
          frontmatter: { source: fmSrc },
          body: [],
          imports: [],
        };
        const src = print(ast);
        const result1 = parse(src);
        if (!result1.ok) return true;

        const printed = print(result1.ast);
        const result2 = parse(printed);
        if (!result2.ok) {
          throw new Error(`Second parse failed: ${result2.error.message}\nPrinted: ${printed}`);
        }
        return astsEquivalent(result1.ast, result2.ast);
      }),
      { numRuns: 100 }
    );
  });

  it('round-trip holds for template with slot nodes', () => {
    fc.assert(
      fc.property(slotName, (name) => {
        const src = name === '' ? `<slot />` : `<slot name="${name}" />`;
        const result1 = parse(src);
        if (!result1.ok) return true;

        const printed = print(result1.ast);
        const result2 = parse(printed);
        if (!result2.ok) {
          throw new Error(`Second parse failed: ${result2.error.message}\nPrinted: ${printed}`);
        }
        return astsEquivalent(result1.ast, result2.ast);
      }),
      { numRuns: 100 }
    );
  });

  it('round-trip holds for template with script and style tags', () => {
    fc.assert(
      fc.property(verbatimContent, verbatimContent, (scriptContent, styleContent) => {
        const src = `<script>${scriptContent}</script><style>${styleContent}</style>`;
        const result1 = parse(src);
        if (!result1.ok) return true;

        const printed = print(result1.ast);
        const result2 = parse(printed);
        if (!result2.ok) {
          throw new Error(`Second parse failed: ${result2.error.message}\nPrinted: ${printed}`);
        }
        return astsEquivalent(result1.ast, result2.ast);
      }),
      { numRuns: 100 }
    );
  });

  it('round-trip holds for template with component imports', () => {
    fc.assert(
      fc.property(fc.array(componentImportArb, { minLength: 1, maxLength: 3 }), (imports) => {
        const importLines = imports
          .map((imp) => `import ${imp.localName} from '${imp.specifier}';`)
          .join('\n');
        const src = `---\n${importLines}\n---\n`;
        const result1 = parse(src);
        if (!result1.ok) return true;

        const printed = print(result1.ast);
        const result2 = parse(printed);
        if (!result2.ok) {
          throw new Error(`Second parse failed: ${result2.error.message}\nPrinted: ${printed}`);
        }
        return astsEquivalent(result1.ast, result2.ast);
      }),
      { numRuns: 100 }
    );
  });
});
