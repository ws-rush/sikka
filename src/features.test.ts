import { describe, it, expect } from 'vitest';
import { Engine } from './index.js';

describe('Engine: Custom Syntax and Features', () => {
  it('should support class:list', async () => {
    const engine = new Engine();
    const result = await engine.renderString(
      '<div class:list={["a", { b: true, c: false }]}></div>'
    );
    expect(result).toBe('<div class="a b"></div>');
  });

  it('should support style object', async () => {
    const engine = new Engine();
    const result = await engine.renderString(
      '<div style={{ color: "red", display: "block", backgroundColor: "blue" }}></div>'
    );
    expect(result).toBe('<div style="color:red;display:block;background-color:blue"></div>');
  });

  it('should support slot fallback', async () => {
    const engine = new Engine();
    engine.loadComponent('Layout', '<div><slot>Fallback</slot></div>');
    // Ensure the async compilation from loadComponent is finished.
    // In index.ts, it stores the promise, and _compileAST awaits it.
    const result = await engine.renderString('<Layout />');
    expect(result).toBe('<div>Fallback</div>');
  });

  it('should support slot overriding fallback', async () => {
    const engine = new Engine();
    engine.loadComponent('Layout', '<div><slot>Fallback</slot></div>');
    const result = await engine.renderString('<Layout>Overridden</Layout>');
    expect(result).toBe('<div>Overridden</div>');
  });

  it('should support custom varName', async () => {
    const engine = new Engine({ varName: 'data' });
    const template = `---
const { name } = data.props;
---
<h1>{name}</h1>`;
    const result = await engine.renderString(template, { name: 'World' });
    expect(result).toBe('<h1>World</h1>');
  });

  it('should support autoFilter', async () => {
    const engine = new Engine({
      autoFilter: true,
      filterFunction: (v) => (typeof v === 'string' ? v.toUpperCase() : v),
    });
    const result = await engine.renderString(
      '---\nconst { name } = Astro.props;\n---\n<h1>{name}</h1>',
      { name: 'world' }
    );
    expect(result).toBe('<h1>WORLD</h1>');
  });

  it('should support object spreading', async () => {
    const engine = new Engine();
    const result = await engine.renderString('<div {...{ id: "12", "data-test": "demo" }}></div>');
    expect(result).toBe('<div id="12" data-test="demo"></div>');
  });

  it('should support unescaped html via set:html', async () => {
    const engine = new Engine();
    const result = await engine.renderString('<div set:html="<s>strike</s>"></div>');
    expect(result).toBe('<div><s>strike</s></div>');
  });

  it('should support multiple named slots passing nested elements', async () => {
    const engine = new Engine();
    engine.loadComponent(
      'Layout',
      '<header><slot name="header" /></header><main><slot /></main><footer><slot name="footer" /></footer>'
    );
    const result = await engine.renderString(`
<Layout>
  <div slot="header">Header Content</div>
  <div>Main Content 1</div>
  <div>Main Content 2</div>
  <div slot="footer">Footer Content</div>
</Layout>
    `);

    // Normalize spaces for simpler exact match if possible, or just exact match
    // Actually, Astro retains spaces between tags in children usually, but let's test exact
    expect(result.trim().replace(/>\s+</g, '><')).toBe(
      '<header><div>Header Content</div></header><main><div>Main Content 1</div><div>Main Content 2</div></main><footer><div>Footer Content</div></footer>'
    );
  });

  it('should support attributes and spreading on script and style tags', async () => {
    const engine = new Engine();
    const result1 = await engine.renderString(
      '<script type="module" {...{ "data-id": "123" }}>console.log(1)</script>'
    );
    expect(result1).toBe('<script type="module" data-id="123">console.log(1)</script>');

    const result2 = await engine.renderString(
      '<style is:global {...{ "data-theme": "dark" }}>body{}</style>'
    );
    expect(result2).toBe('<style is:global data-theme="dark">body{}</style>');
  });
});
