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
    const result = await engine.renderString('<h1>{name}</h1>', { name: 'world' });
    expect(result).toBe('<h1>WORLD</h1>');
  });
});
