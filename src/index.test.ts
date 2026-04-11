import { describe, it, expect, vi } from 'vitest';
import { Engine } from './index.js';
import { parse } from './parser.js';
import { compileAST } from './compiler.js';
import { TemplateNode, RenderFunction } from './types.js';

// ─── 1. renderString() with inline string template ──────────────────────────────────

describe('renderString() — inline string template', () => {
  it('returns the correct HTML for a simple template', async () => {
    const engine = new Engine();
    const template = '<p>Hello world</p>';
    const result = await engine.renderString(template);
    expect(result).toContain('Hello world');
  });

  it('interpolates props into the output', async () => {
    const engine = new Engine();
    const template = `---
const { name } = Astro.props;
---
<p>{name}</p>`;
    const result = await engine.renderString(template, { name: 'Alice' });
    expect(result).toContain('Alice');
  });

  it('HTML-escapes interpolated string props', async () => {
    const engine = new Engine();
    const template = `---
const { value } = Astro.props;
---
<span>{value}</span>`;
    const result = await engine.renderString(template, { value: '<script>alert(1)</script>' });
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('renderStringAsync is an alias for renderString', async () => {
    const engine = new Engine();
    const template = '<p>Hello</p>';
    const result = await engine.renderStringAsync(template);
    expect(result).toBe('<p>Hello</p>');
  });

  it('throws ParseError in renderString if template is invalid', async () => {
    const engine = new Engine();
    const template = '<p>{ unclosed ';
    await expect(engine.renderString(template)).rejects.toThrow('ParseError');
  });
});

// ─── 2. render() with a file path ────────────────────────────────────────────

describe('render() — file path with injected readFile', () => {
  it('calls the readFile with the correct path', async () => {
    const readFile = vi.fn().mockResolvedValue('<h1>From file</h1>');
    const path = '/templates/page.astro';
    const engine = new Engine({ readFile });

    const result = await engine.render(path);

    expect(readFile).toHaveBeenCalledOnce();
    expect(readFile).toHaveBeenCalledWith(path);
    expect(result).toContain('From file');
  });

  it('passes props to the rendered file template', async () => {
    const source = `---
const { title } = Astro.props;
---
<h1>{title}</h1>`;
    const readFile = vi.fn().mockResolvedValue(source);
    const engine = new Engine({ readFile });

    const result = await engine.render('/templates/page-props.astro', { title: 'My Page' });

    expect(result).toContain('My Page');
  });

  it('renderAsync is an alias for render', async () => {
    const readFile = vi.fn().mockResolvedValue('<p>Hello</p>');
    const engine = new Engine({ readFile });
    const result = await engine.renderAsync('/test.astro');
    expect(result).toBe('<p>Hello</p>');
  });

  it('throws ParseError in render if file content is invalid', async () => {
    const readFile = vi.fn().mockResolvedValue('<p>{ unclosed ');
    const engine = new Engine({ readFile });
    await expect(engine.render('/test.astro')).rejects.toThrow('ParseError');
  });
  it('throws when readFile is missing in render()', async () => {
    const engine = new Engine();
    await expect(engine.render('/test.astro')).rejects.toThrow(
      'Engine.render() requires options.readFile to be configured'
    );
  });

  it('throws when readFile returns undefined', async () => {
    const engine = new Engine({ readFile: () => Promise.resolve(undefined as unknown as string) });
    await expect(engine.render('/test.astro')).rejects.toThrow('Could not read file');
  });

  it('handles component resolution when fileReader returns undefined', async () => {
    const engine = new Engine({
      readFile: (p) =>
        p === '/main.astro'
          ? Promise.resolve('---\nimport Child from "./Child.astro"\n---\n')
          : Promise.resolve(undefined as unknown as string),
      resolvePath: (_b, _s) => '/Child.astro',
    });
    await expect(engine.render('/main.astro')).rejects.toThrow(
      'Cannot resolve component: ./Child.astro'
    );
  });
});

describe('Engine — isolated instances', () => {
  it('returns an object with render, renderString, and invalidate methods', () => {
    const engine = new Engine();
    expect(typeof engine.render).toBe('function');
    expect(typeof engine.renderString).toBe('function');
    expect(typeof engine.invalidate).toBe('function');
  });

  it('each engine instance uses its own options', async () => {
    const readerA = vi.fn().mockResolvedValue('<p>engine A</p>');
    const readerB = vi.fn().mockResolvedValue('<p>engine B</p>');

    const engineA = new Engine({ readFile: readerA });
    const engineB = new Engine({ readFile: readerB });

    const resultA = await engineA.render('/page.astro');
    const resultB = await engineB.render('/page.astro');

    expect(readerA).toHaveBeenCalledOnce();
    expect(readerB).toHaveBeenCalledOnce();
    expect(resultA).toContain('engine A');
    expect(resultB).toContain('engine B');
  });
});

describe('LoadError — missing or unreadable file', () => {
  it('throws when the readFile rejects', async () => {
    const readFile = vi
      .fn()
      .mockRejectedValue(new Error("ENOENT: no such file '/templates/missing.astro'"));
    const engine = new Engine({ readFile });

    await expect(engine.render('/templates/missing.astro')).rejects.toThrow();
  });
});

describe('Engine — advanced features', () => {
  it('caches compiled templates for renderString', async () => {
    const engine = new Engine({ cache: true });
    const template = '<p>Cached</p>';

    // First render
    const result1 = await engine.renderString(template);
    expect(result1).toBe('<p>Cached</p>');

    // Second render (should use cache)
    const result2 = await engine.renderString(template);
    expect(result2).toBe('<p>Cached</p>');
  });

  it('caches compiled templates for renderFile', async () => {
    const readFile = vi.fn().mockResolvedValue('<p>File</p>');
    const engine = new Engine({ cache: true, readFile });

    await engine.render('/file.astro');
    await engine.render('/file.astro');

    expect(readFile).toHaveBeenCalledOnce();
  });

  it('invalidate() clears the whole cache', async () => {
    const readFile = vi.fn().mockResolvedValue('<p>File</p>');
    const engine = new Engine({ cache: true, readFile });

    await engine.render('/file.astro');
    engine.invalidate();
    await engine.render('/file.astro');

    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('invalidate(key) clears specific entry', async () => {
    const readFile = vi.fn().mockImplementation((path) => `<p>${path}</p>`);
    const engine = new Engine({ cache: true, readFile });

    await engine.render('/a.astro');
    await engine.render('/b.astro');

    engine.invalidate('/a.astro');

    await engine.render('/a.astro');
    await engine.render('/b.astro');

    expect(readFile).toHaveBeenCalledTimes(3); // /a.astro (1st), /b.astro (1st), /a.astro (2nd)
  });

  it('loadComponent pre-registers a component', async () => {
    const engine = new Engine();
    engine.loadComponent('MyComp', '<p>My Component</p>');

    const result = await engine.renderString('<MyComp />');
    expect(result).toBe('<p>My Component</p>');
  });

  it('registerComponent registers a pre-compiled component', async () => {
    const engine = new Engine();
    const myComp: RenderFunction = (async (props: Record<string, unknown>) =>
      `<div>${props.name}</div>`) as RenderFunction;
    myComp.stream = async function* (props: Record<string, unknown>) {
      yield `<div>${props.name}</div>`;
    };
    engine.registerComponent('MyComp', myComp);

    const result = await engine.renderString('<MyComp name="World" />');
    expect(result).toBe('<div>World</div>');
  });

  it('renderStringStream returns an async iterator', async () => {
    const engine = new Engine({ autoEscape: false });
    const template = '<ul>{ [1, 2].map(i => "<li>" + i + "</li>").join("") }</ul>';
    const stream = engine.renderStringStream(template);
    let result = '';
    for await (const chunk of stream) {
      result += chunk;
    }
    expect(result).toBe('<ul><li>1</li><li>2</li></ul>');
  });

  it('resolves component imports recursively', async () => {
    const files: Record<string, string> = {
      '/main.astro': `---
import Child from './Child.astro';
---
<Child />`,
      '/Child.astro': `<p>Child Content</p>`,
    };

    const readFile = vi.fn((path) => Promise.resolve(files[path]));
    const resolvePath = vi.fn((_base, _spec) => Promise.resolve('/Child.astro'));

    const engine = new Engine({ readFile, resolvePath });
    const result = await engine.render('/main.astro');

    expect(result).toBe('<p>Child Content</p>');
  });

  it('throws when circular dependency is detected', async () => {
    const files: Record<string, string> = {
      '/A.astro': '---\nimport B from "./B.astro";\n---\n<B />',
      '/B.astro': '---\nimport A from "./A.astro";\n---\n<A />',
    };

    const readFile = vi.fn((path) => Promise.resolve(files[path]));
    const resolvePath = vi.fn((base, spec) => {
      if (spec === './B.astro') return Promise.resolve('/B.astro');
      if (spec === './A.astro') return Promise.resolve('/A.astro');
      return Promise.resolve(spec);
    });

    const engine = new Engine({ readFile, resolvePath });
    await expect(engine.render('/A.astro')).rejects.toThrow(
      'Circular component dependency detected'
    );
  });

  it('uses global components inside imported components', async () => {
    const files: Record<string, string> = {
      '/Local.astro': '<GlobalComp />',
    };
    const engine = new Engine({
      readFile: (path) => Promise.resolve(files[path]),
      resolvePath: (base, spec) => Promise.resolve(spec),
    });

    engine.loadComponent('GlobalComp', '<span>From Global</span>');

    const result = await engine.renderString(
      '---\nimport Local from "/Local.astro";\n---\n<Local />'
    );
    expect(result).toBe('<span>From Global</span>');
  });

  it('throws ParseError when child component has parse error', async () => {
    const files: Record<string, string> = {
      '/main.astro': '---\nimport Child from "./Child.astro";\n---\n<Child />',
      '/Child.astro': '<p>{ unclosed </p>',
    };
    const resolvePath = (_basePath: string, _specifier: string) => Promise.resolve('/Child.astro');
    const engine = new Engine({ readFile: (p) => Promise.resolve(files[p]), resolvePath });
    await expect(engine.render('/main.astro')).rejects.toThrow(
      'Parse error in component ./Child.astro'
    );
  });

  it('uses global components during resolution (coverage line 160)', async () => {
    const engine = new Engine();
    engine.loadComponent('Global', '<span>Global</span>');
    const result = await engine.renderString('---\nimport Global from "Global";\n---\n<Global />');
    expect(result).toBe('<span>Global</span>');
  });

  it('throws CompileError when child component fails compileAST in resolution (coverage line 198)', async () => {
    const files: Record<string, string> = {
      '/main.astro': '---\nimport Child from "./Child.astro";\n---\n<Child />',
      '/Child.astro': '---\nconst x = 1;\nconst x = 2;\n---\n',
    };
    const engine = new Engine({
      readFile: (p) => Promise.resolve(files[p]),
      resolvePath: (_b, _s) => Promise.resolve('/Child.astro'),
    });
    await expect(engine.render('/main.astro')).rejects.toThrow('CompileError');
  });

  it('fails to compile when template has unknown node type', async () => {
    const result = parse('<p>hi</p>');
    if (!result.ok) throw new Error('Parse failed');
    const ast = result.ast;
    ast.body.push({ type: 'invalid' } as unknown as TemplateNode);
    // We can't easily trigger this through public API without mocking parse,
    // so we just check that compileAST handles it.
    const cResult = compileAST(ast);
    if (cResult.ok) throw new Error('Expected compile to fail');
    expect(cResult.error.message).toContain('Unknown node type');
  });

  it('uses global components when rendering a file', async () => {
    const engine = new Engine({ readFile: () => Promise.resolve('<GlobalComp />') });
    engine.loadComponent('GlobalComp', '<span>Global</span>');
    const result = await engine.render('/file.astro');
    expect(result).toBe('<span>Global</span>');
  });

  it('invalidate() does nothing when no cache is present (coverage line 73)', () => {
    const engine = new Engine({ cache: false });
    // Should not throw
    expect(() => engine.invalidate()).not.toThrow();
    expect(() => engine.invalidate('key')).not.toThrow();
  });

  it('provides helpful error message for syntax errors in frontmatter', async () => {
    const engine = new Engine();
    const template = '---\nconst x = ;\n---\n';
    try {
      await engine.renderString(template);
      expect.fail('Should have thrown');
    } catch (e: unknown) {
      expect((e as Error).message).toContain('CompileError');
    }
  });

  it('aggregates scripts and styles', async () => {
    const engine = new Engine({ aggregateAssets: true });
    engine.loadComponent(
      'Comp',
      '<style>.a{color:red}</style><script>console.log(1)</script><div>Comp</div>'
    );
    const template = '<Comp /><style>.b{color:blue}</style><div>Main</div>';
    const result = await engine.renderStringFull(template);

    expect(result.html).not.toContain('<style>');
    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('<div>Comp</div>');
    expect(result.html).toContain('<div>Main</div>');

    expect(result.styles).toHaveLength(2);
    expect(result.styles).toContain('<style>.a{color:red}</style>');
    expect(result.styles).toContain('<style>.b{color:blue}</style>');
    expect(result.scripts).toHaveLength(1);
    expect(result.scripts).toContain('<script>console.log(1)</script>');
  });

  it('renderFull and renderStream work with files', async () => {
    const files: Record<string, string> = {
      '/page.astro': '<style>h1{color:red}</style><h1>Title</h1>',
    };
    const engine = new Engine({
      readFile: (path) => Promise.resolve(files[path]),
      aggregateAssets: true,
    });

    const full = await engine.renderFull('/page.astro');
    expect(full.html).toBe('<h1>Title</h1>');
    expect(full.styles).toContain('<style>h1{color:red}</style>');

    const chunks: string[] = [];
    for await (const chunk of engine.renderStream('/page.astro')) {
      if (typeof chunk === 'string') chunks.push(chunk);
    }
    expect(chunks.join('')).toBe('<h1>Title</h1>');
  });

  it('formatAsset handles boolean attributes', async () => {
    const engine = new Engine({ aggregateAssets: true });
    // @ts-expect-error - accessing private method for test
    const result = engine.formatAsset({
      type: 'script',
      content: 'console.log(1)',
      attrs: [{ name: 'async', value: true }],
    });
    expect(result).toBe('<script async>console.log(1)</script>');
  });
});
