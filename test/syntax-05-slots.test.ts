import { describe, it, expect } from 'vitest';
import { Engine } from '../src/index.js';
import { render } from './helpers.js';

describe('Syntax: Slots', () => {
  describe('Default and Named Slots', () => {
    it('receives unnamed children in default slot', () => {
      const engine = new Engine();
      engine.loadComponent('Card', '<div><slot /></div>');
      const html = engine.renderString('<Card><p>content</p></Card>');
      expect(html).toBe('<div><p>content</p></div>');
    });

    it('receives named children in named slot', () => {
      const engine = new Engine();
      engine.loadComponent('Comp', '<div><slot name="header" /></div>');
      const html = engine.renderString('<Comp><span slot="header">Title</span></Comp>');
      expect(html).toBe('<div><span>Title</span></div>');
    });

    it('concatenates multiple children assigned to same named slot', () => {
      const engine = new Engine();
      engine.loadComponent('Comp', '<slot name="x" />');
      const html = engine.renderString('<Comp><div slot="x">1</div><div slot="x">2</div></Comp>');
      expect(html).toBe('<div>1</div><div>2</div>');
    });

    it('passes slot attribute on component', () => {
      const engine = new Engine();
      engine.loadComponent('Outer', '<div><slot name="x" /></div>');
      engine.loadComponent('Header', '<header>h</header>');
      const html = engine.renderString('<Outer><Header slot="x" /></Outer>');
      expect(html).toContain('<header>h</header>');
    });

    it('passes slot attribute on Fragment', () => {
      const engine = new Engine();
      engine.loadComponent('Comp', '<div><slot name="x" /></div>');
      const html = engine.renderString('<Comp><Fragment slot="x">content</Fragment></Comp>');
      expect(html).toBe('<div>content</div>');
    });

    it('handles out-of-order slot content', () => {
      const engine = new Engine();
      engine.loadComponent('Comp', '<slot name="x" /><slot />');
      const html = engine.renderString('<Comp>1<span slot="x">2</span>3</Comp>');
      // Named slot gets "2", default slot gets "1" and "3"
      expect(html).toContain('2');
      expect(html).toContain('1');
      expect(html).toContain('3');
    });

    it('discards unused slots', () => {
      const engine = new Engine();
      engine.loadComponent('Comp', '<div><slot /></div>');
      const html = engine.renderString('<Comp><span slot="unknown">discarded</span></Comp>');
      // "unknown" slot is not in the component, so it's discarded
      expect(html).toBe('<div></div>');
    });

    it.skip('renders dynamic slot name', () => {
      // <slot name={name}/>
    });

    it.skip('renders dynamic slot assignment', () => {
      // <div slot={name}>C</div>
    });

    it.skip('renders slot names with spaces', () => {
      // <slot name="a b"/>
    });

    it.skip('renders slot names with hyphens', () => {
      // <slot name="a-b"/>
    });

    it.skip('renders slot names with numbers', () => {
      // <slot name="1"/>
    });
  });

  describe('Fallback Content', () => {
    it('renders component fallback when no children', () => {
      const engine = new Engine();
      engine.loadComponent('Header', '<header>fallback</header>');
      engine.loadComponent('Comp', '<div><slot><Header/></slot></div>');
      const html = engine.renderString('<Comp />');
      // Slot fallback renders Header component
      expect(html).toContain('fallback');
    });

    it('renders slot fallback when component receives no children', () => {
      const engine = new Engine();
      engine.loadComponent('Comp', '<div><slot>default text</slot></div>');
      const html = engine.renderString('<Comp />');
      expect(html).toBe('<div>default text</div>');
    });

    it('overrides fallback with provided children', () => {
      const engine = new Engine();
      engine.loadComponent('Comp', '<div><slot>fallback</slot></div>');
      const html = engine.renderString('<Comp><span>real</span></Comp>');
      expect(html).toBe('<div><span>real</span></div>');
    });

    it('overrides fallback with conditional content', () => {
      const engine = new Engine();
      engine.loadComponent('Comp', '<div><slot>fallback</slot></div>');
      const html = engine.renderString(
        '---\nconst x = true;\n---\n<Comp>{x && <span>yes</span>}</Comp>'
      );
      expect(html).toContain('<span>yes</span>');
      expect(html).not.toContain('fallback');
    });

    it('overrides fallback with null (renders empty)', () => {
      const engine = new Engine();
      engine.loadComponent('Comp', '<div><slot>fallback</slot></div>');
      const html = engine.renderString('<Comp>{null}</Comp>');
      expect(html).toBe('<div></div>');
    });

    it('overrides fallback with undefined (renders empty)', () => {
      const engine = new Engine();
      engine.loadComponent('Comp', '<div><slot>fallback</slot></div>');
      const html = engine.renderString('<Comp>{undefined}</Comp>');
      expect(html).toBe('<div></div>');
    });

    it('renders nested slot fallbacks', () => {
      const html = render('<slot><slot>A</slot></slot>');
      expect(html).toContain('A');
    });

    it('renders loop in slot fallback', () => {
      const html = render(
        '---\nconst arr = [1, 2, 3];\n---\n<slot>{arr.map(i => <p>{i}</p>)}</slot>'
      );
      expect(html).toContain('<p>1</p>');
      expect(html).toContain('<p>2</p>');
      expect(html).toContain('<p>3</p>');
    });

    it('overrides fallback with empty string', () => {
      const engine = new Engine();
      engine.loadComponent('Comp', '<div><slot>fallback</slot></div>');
      const html = engine.renderString('<Comp>{""}</Comp>');
      expect(html).toBe('<div></div>');
    });

    it('overrides fallback with whitespace', () => {
      const engine = new Engine();
      engine.loadComponent('Comp', '<div><slot>fallback</slot></div>');
      const html = engine.renderString('<Comp> </Comp>');
      expect(html).toContain(' ');
    });

    it('renders mixed text and element in fallback', () => {
      const html = render('<slot>Text <b>Bold</b></slot>');
      expect(html).toContain('Text');
      expect(html).toContain('<b>Bold</b>');
    });

    it('renders multiple root elements in fallback', () => {
      const html = render('<slot><h1>1</h1><h2>2</h2></slot>');
      expect(html).toContain('<h1>1</h1>');
      expect(html).toContain('<h2>2</h2>');
    });

    it('renders slot fallback referencing another slot', () => {
      const html = render('<slot name="a"><slot name="b" /></slot>');
      // Neither slot has content, so inner slot renders empty
      expect(html).toBe('');
    });
  });

  describe('Slots — Edge Cases', () => {
    it('renders empty when slot has no fallback and no content', () => {
      const engine = new Engine();
      engine.loadComponent('SlotComp', '<div><slot name="optional" /></div>');
      const html = engine.renderString('<SlotComp />');
      expect(html).toBe('<div></div>');
    });

    it('renders nothing for named slot with no matching content', () => {
      const engine = new Engine();
      engine.loadComponent('Comp', '<div><slot name="x" /><slot /></div>');
      const html = engine.renderString('<Comp><span>default only</span></Comp>');
      // "x" slot has no content, so it renders nothing; default gets the span
      expect(html).toBe('<div><span>default only</span></div>');
    });

    it('renders fallback with expression using Astro.props', () => {
      const engine = new Engine();
      engine.loadComponent('Fb', '<div><slot>{Astro.props.fallbackText}</slot></div>');
      const html = engine.renderString('<Fb fallbackText="hello" />');
      expect(html).toBe('<div>hello</div>');
    });

    it('renders layout pattern with head and body slots', () => {
      const engine = new Engine();
      engine.loadComponent(
        'Layout',
        '<html><head><slot name="head" /></head><body><slot /></body></html>'
      );
      const html = engine.renderString('<Layout><meta slot="head" /><p>Content</p></Layout>');
      expect(html).toContain('<head><meta /></head>');
      expect(html).toContain('<body><p>Content</p></body>');
    });
  });
});
