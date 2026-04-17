import { describe, it, expect } from 'vitest';
import { render } from './helpers.js';
import { Engine } from '../src/index.js';

describe('Syntax: Astro Global', () => {
  describe('Astro.props', () => {
    it('destructures props with defaults', () => {
      const html = render('---\nconst { a = 1 } = Astro.props;\n---\n<div>{a}</div>');
      expect(html).toBe('<div>1</div>');
    });

    it('destructures props with provided values', () => {
      const html = render('---\nconst { a = 1 } = Astro.props;\n---\n<div>{a}</div>', { a: 42 });
      expect(html).toBe('<div>42</div>');
    });

    it('uses rest props', () => {
      const html = render(
        '---\nconst { a, ...rest } = Astro.props;\n---\n<div {...rest}>{a}</div>',
        { a: 'hello', id: 'x', class: 'c' }
      );
      expect(html).toContain('hello');
      expect(html).toContain('id="x"');
      expect(html).toContain('class="c"');
    });

    it('returns undefined for undefined prop', () => {
      const html = render('---\nconst b = Astro.props.unknown;\n---\n<div>{b}</div>');
      expect(html).toBe('<div></div>');
    });

    it('accesses implicit boolean prop as truthy', () => {
      const engine = new Engine();
      engine.loadComponent(
        'Comp',
        '---\nconst isTrue = Astro.props.active;\n---\n<div>{isTrue ? "yes" : "no"}</div>'
      );
      const html = engine.renderString('<Comp active />');
      expect(html).toBe('<div>yes</div>');
    });

    it('accesses dashed prop names via bracket notation', () => {
      const html = render('---\nconst data = Astro.props["data-val"];\n---\n<div>{data}</div>', {
        'data-val': 'test',
      });
      expect(html).toBe('<div>test</div>');
    });

    it('accesses props via dynamic key', () => {
      const html = render(
        '---\nconst key = "name";\nconst val = Astro.props[key];\n---\n<div>{val}</div>',
        { name: 'dynamic' }
      );
      expect(html).toBe('<div>dynamic</div>');
    });

    it('accesses nested object props', () => {
      const html = render('---\nconst { user } = Astro.props;\n---\n<div>{user.name}</div>', {
        user: { name: 'Alice' },
      });
      expect(html).toBe('<div>Alice</div>');
    });

    it('accesses array prop length', () => {
      const html = render('---\nconst { items } = Astro.props;\n---\n<div>{items.length}</div>', {
        items: [1, 2, 3],
      });
      expect(html).toBe('<div>3</div>');
    });

    it.skip('accesses symbols as prop keys', () => {
      // Astro.props[Symbol.for('key')]
    });

    it.skip('mutates Astro.props', () => {
      // Astro.props.a = 2
    });

    it.skip('uses Zod validation', () => {
      // schema.parse(Astro.props)
    });
  });
});
