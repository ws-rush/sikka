/**
 * Unit tests for compiler error cases — Requirements 2.8, 7.4
 *
 * Covers:
 *   1. Unresolvable import with no fileReader → CompileError with missing specifier
 *   2. Unresolvable import when fileReader rejects → CompileError with missing specifier
 *   3. Circular dependency (A → B → A) → CompileError listing the cycle
 */

import { describe, it, expect } from 'vitest';
import { compile, compileAST } from './compiler.js';
import { parse } from './parser.js';
import type { TemplateAST, RenderFunction, TemplateNode } from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(source: string): TemplateAST {
  const result = parse(source);
  if (!result.ok) throw new Error(`Expected parse success but got error: ${result.error.message}`);
  return result.ast;
}

/** Build a minimal TemplateAST that imports a single component. */
function makeASTWithImport(specifier: string, localName = 'Comp'): TemplateAST {
  return {
    frontmatter: { source: '' },
    body: [],
    imports: [{ localName, specifier }],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Compiler error cases', () => {
  // ── Requirement 2.8: unresolvable import ────────────────────────────────────

  it('returns CompileError with the missing specifier when no fileReader is provided', async () => {
    const ast = makeASTWithImport('./Button.astro');

    const result = await compile(ast /* no fileReader */);

    expect(result.ok).toBe(false);
    if (result.ok) return; // narrow type

    expect(result.error.specifier).toBe('./Button.astro');
    expect(result.error.message).toMatch(/Button\.astro/);
  });

  it('returns CompileError with the missing specifier when fileReader rejects', async () => {
    const specifier = './Missing.astro';
    const ast = makeASTWithImport(specifier);

    const fileReader = async (path: string): Promise<string> => {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    };

    const result = await compile(ast, { fileReader, basePath: '/templates/index.astro' });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.specifier).toBe(specifier);
    expect(result.error.message).toMatch(/Missing\.astro/);
  });

  // ── Requirement 7.4: circular dependency ────────────────────────────────────

  it('returns CompileError listing the cycle when A imports B and B imports A', async () => {
    // A.astro imports B.astro; B.astro imports A.astro
    const sourceA = `---\nimport B from './B.astro';\n---\n<B />`;
    const sourceB = `---\nimport A from './A.astro';\n---\n<A />`;

    const files: Record<string, string> = {
      '/templates/A.astro': sourceA,
      '/templates/B.astro': sourceB,
    };

    const fileReader = async (path: string): Promise<string> => {
      const src = files[path];
      if (src === undefined) throw new Error(`File not found: ${path}`);
      return src;
    };

    // Parse A.astro manually to get its AST, then compile with fileReader
    const { parse } = await import('./parser.js');
    const parseResult = parse(sourceA);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = await compile(parseResult.ast, {
      fileReader,
      basePath: '/templates/A.astro',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    // The error message must mention the cycle
    expect(result.error.message).toMatch(/circular/i);
    // The cycle array should contain both paths
    expect(result.error.cycle).toBeDefined();
    expect(result.error.cycle!.some((p) => p.includes('A.astro'))).toBe(true);
    expect(result.error.cycle!.some((p) => p.includes('B.astro'))).toBe(true);
  });

  it('returns CompileError when sub-component has parse error', async () => {
    const files: Record<string, string> = {
      '/templates/A.astro': '---\nimport B from "./B.astro";\n---\n<B />',
      '/templates/B.astro': '<p>{ unclosed',
    };
    const result = await compile(ok(files['/templates/A.astro']), {
      fileReader: async (p) => files[p],
      basePath: '/templates/A.astro',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('Parse error in component');
  });

  it('returns CompileError when sub-component has compile error (coverage for line 135)', async () => {
    const files: Record<string, string> = {
      '/templates/A.astro': '---\nimport B from "./B.astro";\n---\n<B />',
      // Syntax error inside frontmatter that parse() accepts but compileAST() rejects
      '/templates/B.astro': '---\nconst x = 1;\nconst x = 2;\n---\n',
    };
    const result = await compile(ok(files['/templates/A.astro']), {
      fileReader: async (p) => files[p],
      basePath: '/templates/A.astro',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
  });
});

describe('Compiler — node emission', () => {
  it('emits script tags verbatim', async () => {
    const ast = ok('<script>console.log("hi");</script>');
    const { fn } = (await compile(ast)) as { fn: RenderFunction };
    expect(await fn({})).toBe('<script>console.log("hi");</script>');
  });

  it('emits style tags verbatim', async () => {
    const ast = ok('<style>.hi { color: red; }</style>');
    const { fn } = (await compile(ast)) as { fn: RenderFunction };
    expect(await fn({})).toBe('<style>.hi { color: red; }</style>');
  });

  it('emits raw HTML (coverage for raw node)', async () => {
    const ast: TemplateAST = {
      frontmatter: { source: '' },
      imports: [],
      body: [{ type: 'raw', html: '<div>Raw</div>' }],
    };
    const { fn } = (await compile(ast)) as { fn: RenderFunction };
    expect(await fn({})).toBe('<div>Raw</div>');
  });

  it('emits self-closing elements', async () => {
    const ast = ok('<div />');
    const { fn } = (await compile(ast)) as { fn: RenderFunction };
    expect(await fn({})).toBe('<div />');
  });

  it('emits boolean attributes', async () => {
    const ast = ok('<input disabled />');
    const { fn } = (await compile(ast)) as { fn: RenderFunction };
    expect(await fn({})).toBe('<input disabled />');
  });

  it('emits string attributes', async () => {
    const ast = ok('<div class="foo"></div>');
    const { fn } = (await compile(ast)) as { fn: RenderFunction };
    expect(await fn({})).toBe('<div class="foo"></div>');
  });

  it('emits dynamic attributes', async () => {
    const ast = ok('<div id={id}></div>');
    const { fn } = (await compile(ast)) as { fn: RenderFunction };
    expect(await fn({ id: 'bar' })).toBe('<div id="bar"></div>');
  });

  it('handles class:list on elements', async () => {
    const ast = ok('<div class:list={["a", { b: true, c: false }]} />');
    const { fn } = (await compile(ast)) as { fn: RenderFunction };
    expect(await fn({})).toBe('<div class="a b" />');
  });

  it('handles style objects on elements', async () => {
    const ast = ok('<div style={{ color: "red", fontSize: "12px" }} />');
    const { fn } = (await compile(ast)) as { fn: RenderFunction };
    expect(await fn({})).toBe('<div style="color:red;font-size:12px" />');
  });

  it('handles empty/falsy class:list and style', async () => {
    const ast = ok('<div class:list={null} style={undefined} />');
    const { fn } = (await compile(ast)) as { fn: RenderFunction };
    expect(await fn({})).toBe('<div class="" style="" />');
  });

  it('handles style attributes as strings in expressions (coverage for styleObjectHelper string branch)', async () => {
    const ast = ok('<div style={"color: blue"} />');
    const { fn } = (await compile(ast)) as { fn: RenderFunction };
    expect(await fn({})).toBe('<div style="color: blue" />');
  });
});

describe('Compiler — components', () => {
  it('passes different prop types to components', async () => {
    const files: Record<string, string> = {
      '/templates/Main.astro':
        '---\nimport Comp from "./Comp.astro";\n---\n<Comp str="hi" bool={true} num={123} boolStatic />',
      '/templates/Comp.astro':
        '{Astro.props.str} {Astro.props.bool ? "T" : "F"} {Astro.props.num} {Astro.props.boolStatic ? "S" : "N"}',
    };
    const { fn } = (await compile(ok(files['/templates/Main.astro']), {
      fileReader: async (p) => files[p],
      basePath: '/templates/Main.astro',
    })) as { fn: RenderFunction };
    expect(await fn({})).toBe('hi T 123 S');
  });

  it('handles non-Error objects in debug mode runtime error', async () => {
    const ast = ok('{(() => { throw "string error" })()}');
    const { fn } = (await compile(ast, { debug: true })) as { fn: RenderFunction };
    await expect(fn({})).rejects.toThrow('Runtime Error: string error');
  });

  it('returns CompileError when sub-component has compile error (via compile)', async () => {
    const files: Record<string, string> = {
      '/templates/A.astro': '---\nimport B from "./B.astro";\n---\n<B />',
      '/templates/B.astro': '<p>{ unclosed',
    };
    const result = await compile(ok(files['/templates/A.astro']), {
      fileReader: async (p) => files[p],
      basePath: '/templates/A.astro',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
  });

  it('resolves components without ./ or ../ prefix', async () => {
    const files: Record<string, string> = {
      '/A.astro': '---\nimport B from "B.astro";\n---\n<B />',
      'B.astro': '<span>B</span>',
    };
    const { fn } = (await compile(ok(files['/A.astro']), {
      fileReader: async (p) => files[p],
      basePath: '/A.astro',
    })) as { fn: RenderFunction };
    expect(await fn({})).toBe('<span>B</span>');
  });

  it('handles ".." segments in resolvePath (coverage for line 215)', async () => {
    const files: Record<string, string> = {
      '/a/b/c.astro': '---\nimport D from "../d.astro";\n---\n<D />',
      '/a/d.astro': '<span>D</span>',
    };
    const { fn } = (await compile(ok(files['/a/b/c.astro']), {
      fileReader: async (p) => files[p],
      basePath: '/a/b/c.astro',
    })) as { fn: RenderFunction };
    expect(await fn({})).toBe('<span>D</span>');
  });

  it('requires fileReader when imports exist (direct branch check)', async () => {
    const ast = ok('---\nimport B from "./B.astro";\n---\n<B />');
    const result = await compile(ast, {}); // empty options
    expect(result.ok).toBe(false);
    if (result.ok) return;
  });

  it('requires fileReader when imports exist', async () => {
    const ast = ok('---\nimport B from "./B.astro";\n---\n<B />');
    const result = await compile(ast);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('no fileReader provided');
  });

  it('passes class:list to components correctly', async () => {
    const files: Record<string, string> = {
      '/templates/Main.astro':
        '---\nimport Comp from "./Comp.astro";\n---\n<Comp class:list={["a", "b"]} />',
      '/templates/Comp.astro': '{Astro.props["class:list"].join("-")}',
    };
    const { fn } = (await compile(ok(files['/templates/Main.astro']), {
      fileReader: async (p) => files[p],
      basePath: '/templates/Main.astro',
    })) as { fn: RenderFunction };
    expect(await fn({})).toBe('a-b');
  });

  it('throws runtime error in debug mode', async () => {
    const ast = ok('{undefinedValue.prop}');
    const { fn } = (await compile(ast, { debug: true })) as { fn: RenderFunction };
    await expect(fn({})).rejects.toThrow('is not defined');
  });

  it('throws raw error when debug mode is disabled', async () => {
    const ast = ok('{undefinedValue.prop}');
    const { fn } = (await compile(ast, { debug: false })) as { fn: RenderFunction };
    await expect(fn({})).rejects.toThrow('undefinedValue is not defined');
  });

  it('returns CompileError when buildFunctionBody throws', async () => {
    // Force buildFunctionBody to throw by providing an invalid node type
    const ast = {
      frontmatter: { source: '' },
      imports: [],
      body: [{ type: 'invalid' } as unknown as TemplateNode],
    };
    const result = compileAST(ast);
    expect(result.ok).toBe(false);
    if (result.ok) return;
  });

  it('handles non-Error objects in compileAST catch block (coverage for line 314)', async () => {
    // We use a Proxy to force a non-Error throw during the execution of compileAST
    const result = compileAST(
      new Proxy({} as TemplateAST, {
        get() {
          throw 'string error';
        },
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('string error');
  });

  it('covers emitText empty value branch (line 435)', async () => {
    const ast: TemplateAST = {
      frontmatter: { source: '' },
      imports: [],
      body: [{ type: 'text', value: '' }],
    };
    const { fn } = (await compile(ast)) as { fn: RenderFunction };
    expect(await fn({})).toBe('');
  });

  it('covers resolvePath branch for basePath with no slash (line 198)', async () => {
    // resolvePath('index.astro', './sub.astro') should work
    const files: Record<string, string> = {
      'index.astro': '---\nimport Sub from "./sub.astro";\n---\n<Sub />',
      'sub.astro': 'SUB',
    };
    const { fn } = (await compile(ok(files['index.astro']), {
      fileReader: async (p) => files[p],
      basePath: 'index.astro', // no slash
    })) as { fn: RenderFunction };
    expect(await fn({})).toBe('SUB');
  });

  it('covers autoFilter default branch (line 286)', async () => {
    const ast = ok('{val}');
    const { fn } = (await compile(ast, { autoFilter: true })) as { fn: RenderFunction };
    expect(await fn({ val: 'foo' })).toBe('foo');
  });

  it('covers compile branch for undefined basePath with imports (line 172)', async () => {
    const files: Record<string, string> = {
      'Comp.astro': 'COMP',
    };
    const ast = makeASTWithImport('Comp.astro');
    const result = await compile(ast, {
      fileReader: async (p) => files[p],
      // no basePath
    });
    expect(result.ok).toBe(true);
  });

  it('covers autoEscape: false branch (line 390)', async () => {
    const ast = ok('{val}');
    const { fn } = (await compile(ast, { autoEscape: false })) as { fn: RenderFunction };
    // Should NOT be escaped
    expect(await fn({ val: '<br>' })).toBe('<br>');
  });

  it('covers custom varName branch (line 336)', async () => {
    const ast = ok('{MyVar.props.val}');
    const { fn } = (await compile(ast, { varName: 'MyVar' })) as { fn: RenderFunction };
    expect(await fn({ val: 'hi' })).toBe('hi');
  });

  it('covers manual filterFunction branch (line 286)', async () => {
    const ast = ok('{val}');
    const filterFunction = (v: unknown) => String(v).toUpperCase();
    const { fn } = (await compile(ast, { autoFilter: true, filterFunction })) as {
      fn: RenderFunction;
    };
    expect(await fn({ val: 'abc' })).toBe('ABC');
  });

  it('covers nested slot default content (line 412)', async () => {
    const ast = ok('<slot name="other"><span>default</span></slot>');
    const { fn } = (await compile(ast)) as { fn: RenderFunction };
    expect(await fn({})).toContain('<span>default</span>');
  });

  it('covers default slot named "" (line 407)', async () => {
    const ast = ok('<slot />');
    const { fn } = (await compile(ast)) as { fn: RenderFunction };
    expect(await fn({}, { '': 'custom default' })).toBe('custom default');
  });
});
