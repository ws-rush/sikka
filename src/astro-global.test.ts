import { describe, it, expect } from 'vitest';
import { Engine } from './index.js';

describe('Astro Global API', () => {
  const engine = new Engine();

  it('supports destructuring and rest extraction from Astro.props', async () => {
    const template = `---
const { a, ...rest } = Astro.props;
---
<div>{a} {JSON.stringify(rest)}</div>`;
    const result = await engine.renderString(template, { a: 1, b: 2, c: 3 });
    expect(result).toBe('<div>1 {&quot;b&quot;:2,&quot;c&quot;:3}</div>');
  });

  it('handles implicit boolean props', async () => {
    // In Astro <Comp active /> sends { active: true }
    // When using renderString, we pass props manually.
    const template = `---
const { active } = Astro.props;
---
<div>{active ? "Active" : "Inactive"}</div>`;
    const result = await engine.renderString(template, { active: true });
    expect(result).toBe('<div>Active</div>');
  });

  it('handles mutating Astro.props locally', async () => {
    const template = `---
Astro.props.a = 2;
---
<div>{Astro.props.a}</div>`;
    const result = await engine.renderString(template, { a: 1 });
    expect(result).toBe('<div>2</div>');
  });

  it('supports symbols as prop keys', async () => {
    const sym = Symbol.for('key');
    const template = `---
const s = Astro.props[Symbol.for('key')];
---
<div>{s}</div>`;
    const result = await engine.renderString(template, { [sym]: 'Value' });
    expect(result).toBe('<div>Value</div>');
  });

  it('supports dashed names and dynamic key access', async () => {
    const template = `---
const data = Astro.props['data-val'];
const key = 'dynamic';
const val = Astro.props[key];
---
<div>{data} {val}</div>`;
    const result = await engine.renderString(template, {
      'data-val': 'Dashed',
      dynamic: 'Dynamic',
    });
    expect(result).toBe('<div>Dashed Dynamic</div>');
  });

  it('supports prop validation patterns (Zod)', async () => {
    // This is more of a JS/TS test but good to ensure it works in frontmatter
    // We use a simpler validation to avoid external dependencies.
    const templateSimple = `---
if (typeof Astro.props.name !== 'string') throw new Error('Invalid');
---
<div>{Astro.props.name}</div>`;
    const result = await engine.renderString(templateSimple, { name: 'Valid' });
    expect(result).toBe('<div>Valid</div>');
    await expect(engine.renderString(templateSimple, { name: 123 })).rejects.toThrow('Invalid');
  });
});
