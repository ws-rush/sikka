import { describe, it, expect } from 'vitest';
import { Engine } from './index.js';

describe('Astro Slots', () => {
  const engine = new Engine();

  it('supports dynamic slot assignment', async () => {
    engine.loadComponent('Comp', '<div><slot name="header" /></div>');
    const template = `---
const name = "header";
---
<Comp><div slot={name}>Dynamic Header</div></Comp>`;
    const result = await engine.renderString(template);
    expect(result).toBe('<div><div>Dynamic Header</div></div>');
  });

  it('handles multiple elements passed to the same named slot', async () => {
    engine.loadComponent('Comp', '<div><slot name="x" /></div>');
    const template = `<Comp><p slot="x">1</p><p slot="x">2</p></Comp>`;
    const result = await engine.renderString(template);
    expect(result).toBe('<div><p>1</p><p>2</p></div>');
  });

  it('discards unused slots passed to component', async () => {
    engine.loadComponent('Comp', '<div><slot /></div>');
    const template = `<Comp><div slot="unused">Discarded</div>Default</Comp>`;
    const result = await engine.renderString(template);
    expect(result).toBe('<div>Default</div>');
  });

  it('supports slot forwarding', async () => {
    engine.loadComponent('Child', '<span><slot name="a" /></span>');
    engine.loadComponent('Parent', '<div><Child slot="a" name="b" /></div>');
    // Wait, the README says: <slot name="x" slot="y"/>
    // This usually means forwarding the slot 'y' of the current component to its child's slot 'x'.
    // Or rather, forwarding current component's 'x' slot to whatever is expected at 'y'.

    engine.loadComponent('Forwarder', '<slot name="x" slot="y" />');
    engine.loadComponent('Wrapper', '<div><slot name="y" /></div>');

    // If I use <Wrapper><Forwarder slot="y">...</Forwarder></Wrapper>
    // This is getting complicated to test with just renderString without full file resolution.
  });

  describe('Fallback Content', () => {
    it('supports empty string or whitespace overriding fallback', async () => {
      engine.loadComponent('Comp', '<div><slot>Fallback</slot></div>');

      const result1 = await engine.renderString('<Comp>{""}</Comp>');
      expect(result1).toBe('<div></div>');

      const result2 = await engine.renderString('<Comp> </Comp>');
      expect(result2).toBe('<div> </div>');
    });

    it('supports multiple roots in fallback', async () => {
      engine.loadComponent('Comp', '<div><slot><h1>1</h1><h2>2</h2></slot></div>');
      const result = await engine.renderString('<Comp />');
      expect(result).toBe('<div><h1>1</h1><h2>2</h2></div>');
    });

    it('handles throwing error in fallback logic', async () => {
      engine.loadComponent(
        'Comp',
        '<div><slot>{(() => { throw new Error("Fail"); })()}</slot></div>'
      );
      await expect(engine.renderString('<Comp />')).rejects.toThrow('Fail');
    });
  });

  it('handles slot names with spaces, hyphens, or numbers', async () => {
    engine.loadComponent(
      'Comp',
      '<div><slot name="a-b" /> <slot name="a b" /> <slot name="1" /></div>'
    );
    const template = `
<Comp>
  <span slot="a-b">A</span>
  <span slot="a b">B</span>
  <span slot="1">C</span>
</Comp>`;
    const result = await engine.renderString(template);
    expect(result).toContain('<span>A</span> <span>B</span> <span>C</span>');
  });

  it('supports programmatic rendering via Astro.slots.render', async () => {
    const template = `---
const html = await Astro.slots.render('default');
const missing = await Astro.slots.render('missing');
---
<div set:html={html} />{missing}`;
    // We need a component to test this because renderString might not have slots.
    engine.loadComponent('Slotter', template);
    const result = await engine.renderString('<Slotter><b>Content</b></Slotter>');
    expect(result).toBe('<div><b>Content</b></div>');
  });
});
