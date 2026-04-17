import { describe, it, expect } from 'vitest';
import { Engine } from '../src/index.js';

describe('Engine', () => {
  describe('constructor', () => {
    it('creates engine with default options', () => {
      const engine = new Engine();
      expect(engine).toBeInstanceOf(Engine);
    });

    it('enables caching with cache: true', () => {
      const engine = new Engine({ cache: true });
      const fn1 = engine.compile('<div>hi</div>');
      const fn2 = engine.compile('<div>hi</div>');
      expect(fn1).toBe(fn2);
    });

    it('disables caching with cache: false', () => {
      const engine = new Engine({ cache: false });
      const fn1 = engine.compile('<div>hi</div>');
      const fn2 = engine.compile('<div>hi</div>');
      expect(fn1).not.toBe(fn2);
    });

    it('triggers LRU eviction with cacheSize', () => {
      const engine = new Engine({ cache: true, cacheSize: 2 });
      const fnA = engine.compile('aaa');
      engine.compile('bbb'); // fills cache to 2
      const fnC = engine.compile('ccc'); // evicts 'aaa' (LRU)
      const fnA2 = engine.compile('aaa'); // new reference since 'aaa' was evicted
      expect(fnA2).not.toBe(fnA);
      // Verify 'ccc' is still cached (it was just inserted)
      const fnC2 = engine.compile('ccc');
      expect(fnC2).toBe(fnC);
    });

    it('accepts a custom Cache object', () => {
      let getCount = 0;
      let setCount = 0;
      const customCache = {
        get: (_k: string) => {
          getCount++;
          return undefined;
        },
        set: (_k: string, _fn: unknown) => {
          setCount++;
        },
        delete: (_k: string) => {},
        clear: () => {},
      };
      const engine = new Engine({ cache: customCache });
      engine.compile('<div>a</div>');
      engine.compile('<div>a</div>');
      expect(getCount).toBe(2);
      expect(setCount).toBe(2);
    });
  });

  describe('renderString', () => {
    it('renders a basic template with props', () => {
      const engine = new Engine();
      const html = engine.renderString(
        '---\nconst { name } = Astro.props;\n---\n<h1>Hello, {name}!</h1>',
        { name: 'World' }
      );
      expect(html).toBe('<h1>Hello, World!</h1>');
    });

    it('renders without props', () => {
      const engine = new Engine();
      const html = engine.renderString('<div>static</div>');
      expect(html).toBe('<div>static</div>');
    });

    it('returns empty string for empty template', () => {
      const engine = new Engine();
      expect(engine.renderString('')).toBe('');
    });

    it('preserves whitespace-only template', () => {
      const engine = new Engine();
      expect(engine.renderString('   ')).toBe('   ');
    });
  });

  describe('render', () => {
    it('renders a file via readFile and views', () => {
      const engine = new Engine({
        views: '/views',
        readFile: (p) => {
          if (p === '/views/page.astro') return '<div>page</div>';
          return null as unknown as string;
        },
      });
      expect(engine.render('page.astro')).toBe('<div>page</div>');
    });

    it('resolves relative paths with views prefix', () => {
      let readPath = '';
      const engine = new Engine({
        views: '/templates',
        readFile: (p) => {
          readPath = p;
          return '<span>ok</span>';
        },
      });
      engine.render('sub/page.astro');
      expect(readPath).toBe('/templates/sub/page.astro');
    });

    it('passes absolute paths through without views prefix', () => {
      let readPath = '';
      const engine = new Engine({
        views: '/views',
        readFile: (p) => {
          readPath = p;
          return '<div>abs</div>';
        },
      });
      engine.render('/absolute/page.astro');
      expect(readPath).toBe('/absolute/page.astro');
    });

    it('passes protocol URLs through without views prefix', () => {
      let readPath = '';
      const engine = new Engine({
        views: '/views',
        readFile: (p) => {
          readPath = p;
          return '<div>proto</div>';
        },
      });
      engine.render('file:///test.astro');
      expect(readPath).toBe('file:///test.astro');
    });

    it('throws if readFile is not configured', () => {
      const engine = new Engine();
      expect(() => engine.render('test.astro')).toThrow(
        'Engine.render() requires options.readFile to be configured'
      );
    });

    it('throws if file is not found', () => {
      const engine = new Engine({
        readFile: () => null as unknown as string,
      });
      expect(() => engine.render('missing.astro')).toThrow();
    });
  });

  describe('compile', () => {
    it('returns a render function with renderSync', () => {
      const engine = new Engine();
      const fn = engine.compile('<div>{Astro.props.x}</div>');
      expect(typeof fn).toBe('function');
      expect(typeof fn.renderSync).toBe('function');
    });

    it('compiled function produces same output as renderString', () => {
      const engine = new Engine();
      const template = '---\nconst { name } = Astro.props;\n---\n<p>{name}</p>';
      const direct = engine.renderString(template, { name: 'test' });
      const fn = engine.compile(template);
      const compiled = fn.renderSync({ name: 'test' }, {});
      expect(direct).toBe(compiled);
    });

    it('returns same reference on cache hit', () => {
      const engine = new Engine({ cache: true });
      const fn1 = engine.compile('<div>cached</div>');
      const fn2 = engine.compile('<div>cached</div>');
      expect(fn1).toBe(fn2);
    });

    it('bypasses cache when config override is provided', () => {
      const engine = new Engine({ cache: true });
      const fn1 = engine.compile('<div>bypass</div>');
      const fn2 = engine.compile('<div>bypass</div>', { autoEscape: false });
      expect(fn1).not.toBe(fn2);
    });
  });

  describe('compileToString', () => {
    it('returns a JavaScript source string', () => {
      const engine = new Engine();
      const src = engine.compileToString('<div>{name}</div>');
      expect(typeof src).toBe('string');
      expect(src).toContain('__out');
      expect(src).toContain('return');
    });
  });

  describe('loadComponent', () => {
    it('registers a component usable in templates', () => {
      const engine = new Engine();
      engine.loadComponent('Header', '<header>{Astro.props.title}</header>');
      const html = engine.renderString('<Header title="Test" />');
      expect(html).toBe('<header>Test</header>');
    });

    it('component receives slots', () => {
      const engine = new Engine();
      engine.loadComponent('Card', '<div class="card"><slot /></div>');
      const html = engine.renderString('<Card><p>content</p></Card>');
      expect(html).toBe('<div class="card"><p>content</p></div>');
    });

    it('component can be used multiple times', () => {
      const engine = new Engine();
      engine.loadComponent('Item', '<li>{Astro.props.text}</li>');
      const html = engine.renderString(
        '<ul><Item text="a" /><Item text="b" /><Item text="c" /></ul>'
      );
      expect(html).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');
    });
  });

  describe('registerComponent', () => {
    it('registers a pre-compiled render function', () => {
      const engine = new Engine();
      const fn = engine.compile('<span>{Astro.props.text}</span>');
      engine.registerComponent('Label', fn);
      const html = engine.renderString('<Label text="hi" />');
      expect(html).toBe('<span>hi</span>');
    });
  });

  describe('invalidate', () => {
    it('removes a specific cache entry', () => {
      const engine = new Engine({ cache: true });
      const fn1 = engine.compile('<div>x</div>');
      engine.invalidate('<div>x</div>');
      const fn2 = engine.compile('<div>x</div>');
      expect(fn1).not.toBe(fn2);
    });

    it('clears all cache when called without arguments', () => {
      const engine = new Engine({ cache: true });
      const fn1 = engine.compile('<div>a</div>');
      const fn2 = engine.compile('<div>b</div>');
      engine.invalidate();
      const fn1b = engine.compile('<div>a</div>');
      const fn2b = engine.compile('<div>b</div>');
      expect(fn1).not.toBe(fn1b);
      expect(fn2).not.toBe(fn2b);
    });

    it('does not throw when invalidating non-existent key', () => {
      const engine = new Engine({ cache: true });
      expect(() => engine.invalidate('nonexistent')).not.toThrow();
    });

    it('does not throw when cache is disabled', () => {
      const engine = new Engine({ cache: false });
      expect(() => engine.invalidate('x')).not.toThrow();
      expect(() => engine.invalidate()).not.toThrow();
    });
  });

  describe('option: varName', () => {
    it('changes the global variable name', () => {
      const engine = new Engine({ varName: 'Ctx' });
      const html = engine.renderString('---\nconst { name } = Ctx.props;\n---\n<div>{name}</div>', {
        name: 'X',
      });
      expect(html).toBe('<div>X</div>');
    });
  });

  describe('option: autoEscape', () => {
    it('disables HTML escaping when false', () => {
      const engine = new Engine({ autoEscape: false });
      const html = engine.renderString('---\nconst val = "<b>hi</b>";\n---\n<div>{val}</div>');
      expect(html).toBe('<div><b>hi</b></div>');
    });
  });

  describe('option: autoFilter + filterFunction', () => {
    it('applies a custom filter to all expressions', () => {
      const engine = new Engine({
        autoFilter: true,
        filterFunction: (v: unknown) => (typeof v === 'string' ? v.toUpperCase() : v),
      });
      const html = engine.renderString('<div>{"hello"}</div>');
      expect(html).toBe('<div>HELLO</div>');
    });
  });

  describe('option: aggregateAssets', () => {
    it('suppresses script and style output when true', () => {
      const engine = new Engine({ aggregateAssets: true });
      const html = engine.renderString(
        '<script>var x=1;</script><style>body{}</style><div>hi</div>'
      );
      expect(html).toBe('<div>hi</div>');
    });
  });

  describe('option: debug', () => {
    it('wraps runtime errors with context', () => {
      const engine = new Engine({ debug: true });
      expect(() =>
        engine.renderString('---\n---\n{(() => { throw new Error("boom"); })()}')
      ).toThrow(/Runtime Error:/);
    });
  });
});
