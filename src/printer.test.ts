import { describe, it, expect } from 'vitest';
import { print } from './printer.js';
import type { TemplateAST, RawNode } from './types.js';

describe('Pretty Printer', () => {
  it('prints an empty AST', () => {
    const ast: TemplateAST = {
      frontmatter: { source: '' },
      imports: [],
      body: [],
    };
    expect(print(ast)).toBe('');
  });

  it('prints frontmatter with newlines', () => {
    const ast: TemplateAST = {
      frontmatter: { source: 'const x = 1;' },
      imports: [],
      body: [{ type: 'text', value: 'hi' }],
    };
    expect(print(ast)).toBe('---\nconst x = 1;\n---\nhi');
  });

  it('prints frontmatter that already ends with a newline (coverage line 117)', () => {
    const ast: TemplateAST = {
      frontmatter: { source: 'const x = 2;\n' },
      imports: [],
      body: [{ type: 'text', value: 'hi' }],
    };
    expect(print(ast)).toBe('---\nconst x = 2;\n---\nhi');
  });

  it('prints raw nodes', () => {
    const ast: TemplateAST = {
      frontmatter: { source: '' },
      imports: [],
      body: [{ type: 'raw', html: '<div>raw</div>' } as RawNode],
    };
    expect(print(ast)).toBe('<div>raw</div>');
  });

  it('prints scripts and styles', () => {
    const ast: TemplateAST = {
      frontmatter: { source: '' },
      imports: [],
      body: [
        { type: 'script', content: 'console.log(1)' },
        { type: 'style', content: '.a { color: red }' },
      ],
    };
    expect(print(ast)).toBe('<script>console.log(1)</script><style>.a { color: red }</style>');
  });

  it('prints expressions and elements', () => {
    const ast: TemplateAST = {
      frontmatter: { source: '' },
      imports: [],
      body: [
        {
          type: 'element',
          tag: 'div',
          attrs: [{ name: 'id', value: 'foo' }],
          children: [{ type: 'expression', source: 'name' }],
          selfClosing: false,
        },
      ],
    };
    expect(print(ast)).toBe('<div id="foo">{name}</div>');
  });

  it('prints named slots', () => {
    const ast: TemplateAST = {
      frontmatter: { source: '' },
      imports: [],
      body: [{ type: 'slot', name: 'header', children: [] }],
    };
    expect(print(ast)).toBe('<slot name="header" />');
  });
});
