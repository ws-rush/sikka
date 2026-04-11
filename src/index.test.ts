import { describe, it, expect, vi } from 'vitest';
import { Engine, type TemplateAST, type TemplateNode } from './index.js';
import { parse } from './parser.js';

// ─── 1. renderString() with inline string template ──────────────────────────────────

describe('renderString() — inline string template', () => {
  it('returns the correct HTML for a simple template (Requirement 9.1, 4.2)', async () => {
    const engine = new Engine();
    const template = '<p>Hello world</p>';
    const result = await engine.renderString(template);
    expect(result).toContain('Hello world');
  });

  it('interpolates props into the output (Requirement 9.1, 4.2)', async () => {
    const engine = new Engine();
    const template = `---
const { name } = Astro.props;
---
<p>{name}</p>`;
    const result = await engine.renderString(template, { name: 'Alice' });
    expect(result).toContain('Alice');
  });

  it('HTML-escapes interpolated string props (Requirement 3.1)', async () => {
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
  it('calls the readFile with the correct path (Requirement 4.1, 9.3)', async () => {
    const readFile = vi.fn().mockResolvedValue('<h1>From file</h1>');
    const path = '/templates/page.astro';
    const engine = new Engine({ readFile });

    const result = await engine.render(path);

    expect(readFile).toHaveBeenCalledOnce();
    expect(readFile).toHaveBeenCalledWith(path);
    expect(result).toContain('From file');
  });

  it('passes props to the rendered file template (Requirement 4.1, 9.3)', async () => {
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
});

// ─── 3. create isolated instances ───────────────────────────────────────────

describe('Engine — isolated instances', () => {
  it('returns an object with render, renderString, and invalidate methods (Requirement 9.4)', () => {
    const engine = new Engine();
    expect(typeof engine.render).toBe('function');
    expect(typeof engine.renderString).toBe('function');
    expect(typeof engine.invalidate).toBe('function');
  });

  it('each engine instance uses its own options (Requirement 9.4)', async () => {
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
  it('throws when the readFile rejects (Requirement 4.3)', async () => {
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
    await expect(engine.render('/A.astro')).rejects.toThrow('Circular dependency');
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
    await expect(engine.render('/main.astro')).rejects.toThrow('ParseError in ./Child.astro');
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

  it('fails to compile when template has unknown node type (engine test)', async () => {
    const engine = new Engine();
    const result = parse('<p>hi</p>');
    if (!result.ok) throw new Error('Parse failed');
    const ast = result.ast;
    ast.body.push({ type: 'invalid' } as unknown as TemplateNode);
    await expect(
      (
        engine as unknown as { _compileAST: (ast: TemplateAST, path: string) => Promise<unknown> }
      )._compileAST(ast, '')
    ).rejects.toThrow('Unknown node type');
  });

  it('invalidate() does nothing when no cache is present (coverage line 73)', () => {
    const engine = new Engine({ cache: false });
    // Should not throw
    expect(() => engine.invalidate()).not.toThrow();
    expect(() => engine.invalidate('key')).not.toThrow();
  });
});
