import { describe, it, expect } from 'vitest';
import { Engine } from '../src/index.js';
import {
  renderStream,
  renderStreamChunks,
  consume,
  collectStream,
  collectHtml,
} from './helpers.js';

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

    it('caches compiled file templates', () => {
      let readCount = 0;
      const e = new Engine({
        cache: true,
        views: '/v',
        readFile: () => {
          readCount++;
          return '<div>cached</div>';
        },
      });
      e.render('test.astro');
      e.render('test.astro');
      expect(readCount).toBe(1);
    });

    it('re-reads file after cache invalidation', () => {
      let readCount = 0;
      const e = new Engine({
        cache: true,
        views: '/v',
        readFile: () => {
          readCount++;
          return '<div>file</div>';
        },
      });
      e.render('test.astro');
      e.invalidate('/v/test.astro');
      e.render('test.astro');
      expect(readCount).toBe(2);
    });

    it('throws ParseError for malformed file content', () => {
      const e = new Engine({
        views: '/v',
        readFile: () => '---\nunclosed',
      });
      expect(() => e.render('bad.astro')).toThrow(/ParseError/);
    });

    it('throws CompileError for invalid file content', () => {
      const e = new Engine({
        views: '/v',
        readFile: () => '<div set:html="a" set:text="b" />',
      });
      expect(() => e.render('bad2.astro')).toThrow(/CompileError/);
    });

    it('resolves file-based component imports through render', () => {
      const e = new Engine({
        readFile: (p) => {
          if (p === '/v/main.astro')
            return '---\nimport Comp from "./comp.astro";\n---\n<Comp x="1" />';
          if (p === '/v/comp.astro') return '<div>{Astro.props.x}</div>';
          return null as unknown as string;
        },
      });
      const html = e.render('/v/main.astro');
      expect(html).toBe('<div>1</div>');
    });

    it('resolves nested file-based component imports', () => {
      const e = new Engine({
        readFile: (p) => {
          if (p === '/v/main.astro') return '---\nimport A from "./a.astro";\n---\n<A />';
          if (p === '/v/a.astro') return '---\nimport B from "./b.astro";\n---\n<B />';
          if (p === '/v/b.astro') return '<span>deep</span>';
          return null as unknown as string;
        },
      });
      const html = e.render('/v/main.astro');
      expect(html).toBe('<span>deep</span>');
    });

    it('throws for circular file-based component imports', () => {
      const e = new Engine({
        readFile: (p) => {
          if (p === '/v/a.astro') return '---\nimport B from "./b.astro";\n---\n<B />';
          if (p === '/v/b.astro') return '---\nimport A from "./a.astro";\n---\n<A />';
          return null as unknown as string;
        },
      });
      expect(() => e.render('/v/a.astro')).toThrow(/CompileError/);
    });

    it('throws for missing component import file', () => {
      const e = new Engine({
        readFile: (p) => {
          if (p === '/v/main.astro')
            return '---\nimport Missing from "./missing.astro";\n---\n<Missing />';
          return null as unknown as string;
        },
      });
      expect(() => e.render('/v/main.astro')).toThrow(/CompileError/);
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

    it('render method returns same as renderSync', async () => {
      const engine = new Engine();
      const fn = engine.compile('---\nconst { name } = Astro.props;\n---\n<p>{name}</p>');
      const sync = fn.renderSync({ name: 'test' }, {});
      const async_ = await fn.render({ name: 'test' }, {});
      expect(async_).toBe(sync);
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

    it('does not throw for valid template with expression', () => {
      const engine = new Engine();
      expect(() => engine.compileToString('---\n---\n{x}')).not.toThrow();
    });

    it('creates Astro object only when used in template', () => {
      const engine = new Engine();
      const src1 = engine.compileToString('<div>static</div>');
      expect(src1).not.toContain('Astro');
      const src2 = engine.compileToString('---\nconst { x } = Astro.props;\n---\n<div>{x}</div>');
      expect(src2).toContain('Astro');
    });

    it('resolves component imports from frontmatter', () => {
      const engine = new Engine();
      const src = engine.compileToString('import Foo from "./foo.astro";\n<Foo />');
      expect(src).toContain('__components');
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

  // ─── Options ──────────────────────────────────────────────────────────────

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

  // ─── Streaming: streamString ──────────────────────────────────────────────

  describe('streamString', () => {
    it('streams a static template as one chunk', async () => {
      const chunks = await renderStreamChunks('<div>Hello</div>');
      expect(chunks).toEqual(['<div>Hello</div>']);
    });

    it('streams a template with dynamic expression', async () => {
      const html = await renderStream(
        '---\nconst { name } = Astro.props;\n---\n<h1>Hello, {name}!</h1>',
        { name: 'World' }
      );
      expect(html).toBe('<h1>Hello, World!</h1>');
    });

    it('streams a template with multiple dynamic expressions', async () => {
      const html = await renderStream(
        '---\nconst { a, b } = Astro.props;\n---\n<p>{a} and {b}</p>',
        { a: 'foo', b: 'bar' }
      );
      expect(html).toBe('<p>foo and bar</p>');
    });

    it('yields nothing for empty template', async () => {
      const chunks = await renderStreamChunks('');
      expect(chunks).toEqual([]);
    });

    it('escapes HTML in expressions', async () => {
      const html = await renderStream('<div>{Astro.props.val}</div>', {
        val: '<script>alert("xss")</script>',
      });
      expect(html).toBe('<div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>');
    });

    it('handles loops', async () => {
      const html = await renderStream(
        '---\nconst items = Astro.props.items;\n---\n<ul>{items.map(item => <li>{item}</li>)}</ul>',
        { items: ['a', 'b', 'c'] }
      );
      expect(html).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');
    });

    it('handles conditionals', async () => {
      const html = await renderStream(
        '---\nconst { show } = Astro.props;\n---\n<div>{show ? "yes" : "no"}</div>',
        { show: true }
      );
      expect(html).toBe('<div>yes</div>');
    });

    it('produces same output as renderString for complex template', async () => {
      const engine = new Engine();
      const template = `---
const { title, items } = Astro.props;
---
<html>
  <head><title>{title}</title></head>
  <body>
    <h1>{title}</h1>
    <ul>{items.map(item => <li>{item}</li>)}</ul>
  </body>
</html>`;
      const props = { title: 'Test', items: ['x', 'y'] };
      const sync = engine.renderString(template, props);
      const stream = await renderStream(template, props);
      expect(stream).toBe(sync);
    });

    it('preserves whitespace-only template', async () => {
      const html = await renderStream('   ');
      expect(html).toBe('   ');
    });

    it('separates static content from component call', async () => {
      const engine = new Engine();
      engine.loadComponent('Header', '<header>{Astro.props.title}</header>');
      const gen = engine.streamString('<div><Header title="Hi" /></div>');
      const chunks: string[] = [];
      for await (const chunk of gen) chunks.push(chunk);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks.join('')).toBe('<div><header>Hi</header></div>');
    });

    it('streams multiple components', async () => {
      const engine = new Engine();
      engine.loadComponent('A', '<a/>');
      engine.loadComponent('B', '<b/>');
      const html = await collectStream(engine, '<div><A /><B /></div>');
      expect(html).toBe('<div><a></a><b></b></div>');
    });

    it('caches streaming functions', async () => {
      const engine = new Engine({ cache: true });
      const html1 = await collectHtml(engine.streamString('<div>hi</div>'));
      const html2 = await collectHtml(engine.streamString('<div>hi</div>'));
      expect(html1).toBe(html2);
      expect(html1).toBe('<div>hi</div>');
    });

    it('invalidates streaming cache', async () => {
      const engine = new Engine({ cache: true });
      const html1 = await collectHtml(engine.streamString('<div>x</div>'));
      engine.invalidate('<div>x</div>');
      const html2 = await collectHtml(engine.streamString('<div>x</div>'));
      expect(html1).toBe(html2);
      expect(html1).toBe('<div>x</div>');
    });

    it('sync and streaming caches are independent', async () => {
      const engine = new Engine({ cache: true });
      const syncHtml = engine.renderString('<div>test</div>');
      engine.invalidate('<div>test</div>');
      const syncHtml2 = engine.renderString('<div>test</div>');
      expect(syncHtml).toBe(syncHtml2);
      const streamHtml = await collectHtml(engine.streamString('<div>test</div>'));
      expect(streamHtml).toBe(syncHtml);
    });

    it('clears all caches when invalidate called without key', async () => {
      const engine = new Engine({ cache: true });
      await renderStream('<div>a</div>');
      await renderStream('<div>b</div>');
      engine.invalidate();
      const html = await renderStream('<div>a</div>');
      expect(html).toBe('<div>a</div>');
    });

    it('throws ParseError for invalid template', () => {
      const engine = new Engine();
      expect(() => engine.streamString('---\nunclosed')).toThrow(/ParseError/);
    });

    it('covers streaming with cache: false', async () => {
      const engine = new Engine({ cache: false });
      const html = await collectStream(engine, '<div>no cache</div>');
      expect(html).toBe('<div>no cache</div>');
    });

    it('propagates runtime errors with debug option', async () => {
      const engine = new Engine({ debug: true });
      const gen = engine.streamString('---\n---\n{(() => { throw new Error("boom"); })()}');
      await expect(consume(gen)).rejects.toThrow(/boom/);
    });
  });

  // ─── Streaming: streamString with options ─────────────────────────────────

  describe('streamString with options', () => {
    it('respects autoEscape: false', async () => {
      const engine = new Engine({ autoEscape: false });
      const html = await collectStream(
        engine,
        '---\nconst val = "<b>hi</b>";\n---\n<div>{val}</div>'
      );
      expect(html).toBe('<div><b>hi</b></div>');
    });

    it('respects varName option', async () => {
      const engine = new Engine({ varName: 'Ctx' });
      const html = await collectStream(
        engine,
        '---\nconst { name } = Ctx.props;\n---\n<div>{name}</div>',
        { name: 'X' }
      );
      expect(html).toBe('<div>X</div>');
    });

    it('respects aggregateAssets option', async () => {
      const engine = new Engine({ aggregateAssets: true });
      const html = await collectStream(
        engine,
        '<script>var x=1;</script><style>body{}</style><div>hi</div>'
      );
      expect(html).toBe('<div>hi</div>');
    });

    it('respects autoFilter + filterFunction', async () => {
      const engine = new Engine({
        autoFilter: true,
        filterFunction: (v: unknown) => (typeof v === 'string' ? v.toUpperCase() : v),
      });
      const html = await collectStream(engine, '<div>{"hello"}</div>');
      expect(html).toBe('<div>HELLO</div>');
    });
  });

  // ─── Streaming: stream (file-based) ───────────────────────────────────────

  describe('stream', () => {
    it('streams a template from file', async () => {
      const engine = new Engine({
        views: '/views',
        readFile: (p) => {
          if (p === '/views/page.astro') return '<div>page</div>';
          return null as unknown as string;
        },
      });
      const html = await collectHtml(engine.stream('page.astro'));
      expect(html).toBe('<div>page</div>');
    });

    it('streams a file with components', async () => {
      const engine = new Engine({
        views: '/views',
        readFile: (p) => {
          if (p === '/views/main.astro')
            return '---\nimport Comp from "./comp.astro";\n---\n<div><Comp x="1" /></div>';
          if (p === '/views/comp.astro') return '<span>{Astro.props.x}</span>';
          return null as unknown as string;
        },
        cache: true,
      });
      const html = await collectHtml(engine.stream('main.astro'));
      expect(html).toBe('<div><span>1</span></div>');
    });

    it('throws if readFile is not configured', () => {
      const engine = new Engine();
      expect(() => engine.stream('test.astro')).toThrow(
        'Engine.stream() requires options.readFile to be configured'
      );
    });

    it('throws if file is not found', () => {
      const engine = new Engine({
        readFile: () => null as unknown as string,
      });
      expect(() => engine.stream('missing.astro')).toThrow();
    });

    it('caches streaming file templates', async () => {
      let readCount = 0;
      const engine = new Engine({
        cache: true,
        views: '/v',
        readFile: () => {
          readCount++;
          return '<div>cached</div>';
        },
      });
      await consume(engine.stream('test.astro'));
      await consume(engine.stream('test.astro'));
      expect(readCount).toBe(1);
    });

    it('re-reads file after cache invalidation', async () => {
      let readCount = 0;
      const engine = new Engine({
        cache: true,
        views: '/v',
        readFile: () => {
          readCount++;
          return '<div>file</div>';
        },
      });
      await consume(engine.stream('test.astro'));
      engine.invalidate('/v/test.astro');
      await consume(engine.stream('test.astro'));
      expect(readCount).toBe(2);
    });

    it('throws ParseError for malformed file content', () => {
      const engine = new Engine({
        views: '/v',
        readFile: () => '---\nunclosed',
      });
      expect(() => engine.stream('bad.astro')).toThrow(/ParseError/);
    });

    it('resolves absolute paths without views prefix', async () => {
      let readPath = '';
      const engine = new Engine({
        views: '/views',
        readFile: (p) => {
          readPath = p;
          return '<div>abs</div>';
        },
      });
      await consume(engine.stream('/absolute/page.astro'));
      expect(readPath).toBe('/absolute/page.astro');
    });

    it('covers streaming file with protocol URL', async () => {
      let readPath = '';
      const engine = new Engine({
        views: '/views',
        readFile: (p) => {
          readPath = p;
          return '<div>proto</div>';
        },
      });
      await consume(engine.stream('file:///test.astro'));
      expect(readPath).toBe('file:///test.astro');
    });

    it('resolves file-based component imports through stream', async () => {
      const e = new Engine({
        readFile: (p) => {
          if (p === '/v/main.astro')
            return '---\nimport Comp from "./comp.astro";\n---\n<Comp x="1" />';
          if (p === '/v/comp.astro') return '<div>{Astro.props.x}</div>';
          return null as unknown as string;
        },
      });
      const html = await collectHtml(e.stream('/v/main.astro'));
      expect(html).toBe('<div>1</div>');
    });

    it('resolves nested file-based component imports', async () => {
      const e = new Engine({
        readFile: (p) => {
          if (p === '/v/main.astro') return '---\nimport A from "./a.astro";\n---\n<A />';
          if (p === '/v/a.astro') return '---\nimport B from "./b.astro";\n---\n<B />';
          if (p === '/v/b.astro') return '<span>deep</span>';
          return null as unknown as string;
        },
      });
      const html = await collectHtml(e.stream('/v/main.astro'));
      expect(html).toBe('<span>deep</span>');
    });

    it('throws for circular file-based component imports', () => {
      const e = new Engine({
        readFile: (p) => {
          if (p === '/v/a.astro') return '---\nimport B from "./b.astro";\n---\n<B />';
          if (p === '/v/b.astro') return '---\nimport A from "./a.astro";\n---\n<A />';
          return null as unknown as string;
        },
      });
      expect(() => e.stream('/v/a.astro')).toThrow(/CompileError/);
    });

    it('throws for missing component import file', () => {
      const e = new Engine({
        readFile: (p) => {
          if (p === '/v/main.astro')
            return '---\nimport Missing from "./missing.astro";\n---\n<Missing />';
          return null as unknown as string;
        },
      });
      expect(() => e.stream('/v/main.astro')).toThrow(/CompileError/);
    });
  });

  // ─── Streaming: async frontmatter ─────────────────────────────────────────

  describe('streamString with async frontmatter', () => {
    it('supports await in frontmatter', async () => {
      const html = await renderStream(
        `---
const data = await Promise.resolve({ name: "Async" });
---
<p>{data.name}</p>`
      );
      expect(html).toBe('<p>Async</p>');
    });

    it('supports async function calls via props', async () => {
      const getData = async () => 'fetched';
      const html = await renderStream(
        `---
const { getData } = Astro.props;
const result = await getData();
---
<span>{result}</span>`,
        { getData }
      );
      expect(html).toBe('<span>fetched</span>');
    });

    it('supports await with delayed promise', async () => {
      const html = await renderStream(
        `---
const val = await new Promise(r => setTimeout(() => r("delayed"), 10));
---
<div>{val}</div>`
      );
      expect(html).toBe('<div>delayed</div>');
    });
  });

  // ─── Streaming: syntax coverage ───────────────────────────────────────────

  describe('streamString: syntax coverage', () => {
    it('handles class:list', async () => {
      const html = await renderStream('<div class:list={["a", { b: true, c: false }]} />');
      expect(html).toBe('<div class="a b"></div>');
    });

    it('handles class:list with Set', async () => {
      const html = await renderStream(
        '---\nconst s = new Set(["x", "y"]);\n---\n<div class:list={s} />'
      );
      expect(html).toBe('<div class="x y"></div>');
    });

    it('handles class:list edge case with push', async () => {
      const html = await renderStream(
        '---\nconst arr = ["a"];\n---\n<div class:list={arr.push("b") && arr} />'
      );
      expect(html).toContain('class="a b"');
    });

    it('handles style objects', async () => {
      const html = await renderStream('<div style={{ color: "red", fontSize: 16 }} />');
      expect(html).toBe('<div style="color:red;font-size:16"></div>');
    });

    it('uses custom toString when defined for style', async () => {
      const html = await renderStream('<div style={{ toString: () => "color:red" }} />');
      expect(html).toContain('color:red');
    });

    it('handles set:html directive', async () => {
      const html = await renderStream(
        '---\nconst raw = "<b>bold</b>";\n---\n<div set:html={raw} />'
      );
      expect(html).toBe('<div><b>bold</b></div>');
    });

    it('handles set:html with static value', async () => {
      const html = await renderStream('<div set:html="<b>static</b>" />');
      expect(html).toBe('<div><b>static</b></div>');
    });

    it('handles set:text directive', async () => {
      const html = await renderStream(
        '---\nconst val = "<b>not bold</b>";\n---\n<div set:text={val} />'
      );
      expect(html).toBe('<div>&lt;b&gt;not bold&lt;/b&gt;</div>');
    });

    it('handles set:text with static value', async () => {
      const html = await renderStream('<div set:text="plain" />');
      expect(html).toBe('<div>plain</div>');
    });

    it('handles Fragment', async () => {
      const html = await renderStream('<><p>a</p><p>b</p></>');
      expect(html).toBe('<p>a</p><p>b</p>');
    });

    it('handles Fragment with set:html', async () => {
      const html = await renderStream(
        '---\nconst raw = "<p>raw</p>";\n---\n<Fragment set:html={raw} />'
      );
      expect(html).toBe('<p>raw</p>');
    });

    it('handles Fragment with set:text', async () => {
      const html = await renderStream(
        '---\nconst txt = "hello";\n---\n<Fragment set:text={txt} />'
      );
      expect(html).toBe('hello');
    });

    it('handles void elements', async () => {
      const html = await renderStream('<img src="test.jpg" /><br />');
      expect(html).toBe('<img src="test.jpg" /><br />');
    });

    it('handles is:raw', async () => {
      const html = await renderStream('<div is:raw><span>text</span></div>');
      expect(html).toBe('<div><span>text</span></div>');
    });

    it('handles script and style tags', async () => {
      const html = await renderStream('<script>var x;</script><style>body{}</style><div>hi</div>');
      expect(html).toBe('<script>var x;</script><style>body{}</style><div>hi</div>');
    });

    it('parses single-quoted attribute values', async () => {
      const html = await renderStream("<div class='test'>hi</div>");
      expect(html).toContain('test');
    });

    it('parses DOCTYPE', async () => {
      const html = await renderStream('<!DOCTYPE html>');
      expect(html).toContain('DOCTYPE');
    });

    it('parses HTML comment', async () => {
      const html = await renderStream('<!-- comment --><div>hi</div>');
      expect(html).toContain('<!-- comment -->');
      expect(html).toContain('hi');
    });

    it('handles dynamic class attribute', async () => {
      const html = await renderStream('---\nconst cls = "dynamic";\n---\n<div class={cls} />');
      expect(html).toBe('<div class="dynamic"></div>');
    });

    it('handles dynamic style string', async () => {
      const html = await renderStream('---\nconst s = "color:blue";\n---\n<div style={s} />');
      expect(html).toBe('<div style="color:blue"></div>');
    });

    it('handles dynamic attribute', async () => {
      const html = await renderStream('---\nconst val = "my-id";\n---\n<div id={val} />');
      expect(html).toBe('<div id="my-id"></div>');
    });

    it('handles boolean attribute', async () => {
      const html = await renderStream('<input disabled />');
      expect(html).toBe('<input disabled />');
    });

    it('handles static class attribute', async () => {
      const html = await renderStream('<div class="static">hi</div>');
      expect(html).toBe('<div class="static">hi</div>');
    });

    it('handles static style attribute', async () => {
      const html = await renderStream('<div style="color:red">hi</div>');
      expect(html).toBe('<div style="color:red">hi</div>');
    });

    it('handles spread attributes', async () => {
      const html = await renderStream(
        '---\nconst attrs = { id: "main", class: "container" };\n---\n<div {...attrs} />'
      );
      expect(html).toBe('<div id="main" class="container"></div>');
    });

    it('spreads className through spread attribute', async () => {
      const html = await renderStream(
        '---\nconst myProps = { className: "test" };\n---\n<div {...myProps}>hi</div>'
      );
      expect(html).toContain('class="test"');
    });

    it('spreads class through spread attribute', async () => {
      const html = await renderStream(
        '---\nconst myProps = { class: "test" };\n---\n<div {...myProps}>hi</div>'
      );
      expect(html).toContain('class="test"');
    });

    it('spreads boolean attribute through spread', async () => {
      const html = await renderStream(
        '---\nconst myProps = { disabled: true };\n---\n<input {...myProps} />'
      );
      expect(html).toContain('disabled');
    });

    it('spreads mixed attributes through spread', async () => {
      const html = await renderStream(
        '---\nconst myProps = { id: "x", title: "t" };\n---\n<div {...myProps}>hi</div>'
      );
      expect(html).toContain('id="x"');
      expect(html).toContain('title="t"');
    });

    it('covers streaming with spread containing class:list', async () => {
      const html = await renderStream(
        '---\nconst myProps = { "class:list": ["a", "b"] };\n---\n<div {...myProps} />'
      );
      expect(html).toContain('class="a b"');
    });

    it('covers streaming with spread containing style object', async () => {
      const html = await renderStream(
        '---\nconst myProps = { style: { color: "blue" } };\n---\n<div {...myProps} />'
      );
      expect(html).toContain('style="color:blue"');
    });

    it('covers streaming with spread containing boolean true attribute', async () => {
      const html = await renderStream(
        '---\nconst myProps = { disabled: true, class: "btn" };\n---\n<button {...myProps}>Click</button>'
      );
      expect(html).toContain('disabled');
      expect(html).toContain('class="btn"');
    });

    it('covers streaming with spread containing false/null attributes', async () => {
      const html = await renderStream(
        '---\nconst myProps = { hidden: false, title: null };\n---\n<div {...myProps}>visible</div>'
      );
      expect(html).toBe('<div>visible</div>');
    });

    it('renders element with both static and dynamic attrs and spread', async () => {
      const html = await renderStream(
        '---\nconst myAttrs = { id: "x" };\n---\n<div class="a" id="b" {...myAttrs} style="c" style={{ color: "red" }}>hi</div>'
      );
      expect(html).toContain('class="a"');
      expect(html).toContain('style=');
      expect(html).toContain('hi');
    });

    it('renders component with slot content', async () => {
      const engine = new Engine();
      engine.loadComponent('Card', '<div class="card"><slot /></div>');
      const html = await collectStream(engine, '<Card><p>hello</p></Card>');
      expect(html).toBe('<div class="card"><p>hello</p></div>');
    });

    it('renders component with named slots', async () => {
      const engine = new Engine();
      engine.loadComponent('Layout', '<div><slot name="header" /><main><slot /></main></div>');
      const html = await collectStream(
        engine,
        '<Layout><h1 slot="header">Title</h1><p>Body</p></Layout>'
      );
      expect(html).toBe('<div><h1>Title</h1><main><p>Body</p></main></div>');
    });

    it('renders component with fallback in slot', async () => {
      const engine = new Engine();
      engine.loadComponent('Comp', '<div><slot>fallback</slot></div>');
      const html = await collectStream(engine, '<Comp />');
      expect(html).toBe('<div>fallback</div>');
    });

    it('renders component used as fallback in slot', async () => {
      const engine = new Engine();
      engine.loadComponent('Fallback', '<span>fb</span>');
      engine.loadComponent('Comp', '<div><slot><Fallback /></slot></div>');
      const html = await collectStream(engine, '<Comp />');
      expect(html).toBe('<div><span>fb</span></div>');
    });

    it('renders component with dynamic slot attribute', async () => {
      const engine = new Engine();
      engine.loadComponent('SlotComp', '<div><slot name="a" /><slot /></div>');
      const html = await collectStream(
        engine,
        '---\nconst s = "a";\n---\n<SlotComp><span slot={s}>named</span><p>default</p></SlotComp>'
      );
      expect(html).toContain('named');
      expect(html).toContain('default');
    });

    it('renders component with spread props', async () => {
      const engine = new Engine();
      engine.loadComponent('Btn', '<button>{Astro.props.label}</button>');
      const html = await collectStream(
        engine,
        '---\nconst p = { label: "Click" };\n---\n<Btn {...p} />'
      );
      expect(html).toBe('<button>Click</button>');
    });

    it('renders component with string prop', async () => {
      const engine = new Engine();
      engine.loadComponent('Tag', '<span>{Astro.props.text}</span>');
      const html = await collectStream(engine, '<Tag text="hello" />');
      expect(html).toBe('<span>hello</span>');
    });

    it('renders component with boolean prop', async () => {
      const engine = new Engine();
      engine.loadComponent('BoolComp', '<div>{Astro.props.active ? "yes" : "no"}</div>');
      const html = await collectStream(engine, '<BoolComp active />');
      expect(html).toBe('<div>yes</div>');
    });

    it('renders component with class:list prop', async () => {
      const engine = new Engine();
      engine.loadComponent('Styled', '<div class:list={Astro.props.classes} />');
      const html = await collectStream(engine, '<Styled classes={["x", "y"]} />');
      expect(html).toBe('<div class="x y"></div>');
    });

    it('renders component with text child as slot content', async () => {
      const engine = new Engine();
      engine.loadComponent('Wrap', '<div><slot /></div>');
      const html = await collectStream(engine, '<Wrap>just text</Wrap>');
      expect(html).toBe('<div>just text</div>');
    });

    it('renders component with expression child as slot content', async () => {
      const engine = new Engine();
      engine.loadComponent('Wrap', '<div><slot /></div>');
      const html = await collectStream(engine, '---\nconst val = "expr";\n---\n<Wrap>{val}</Wrap>');
      expect(html).toBe('<div>expr</div>');
    });

    it('renders unknown capitalized tag as literal HTML (self-closing)', async () => {
      const html = await renderStream('<Unknown x="1" />');
      expect(html).toContain('Unknown');
      expect(html).toContain('x="1"');
    });

    it('renders unknown capitalized tag with children', async () => {
      const html = await renderStream('<UnknownTag x="1">hi</UnknownTag>');
      expect(html).toContain('UnknownTag');
      expect(html).toContain('hi');
    });

    it('renders nested component calls', async () => {
      const engine = new Engine();
      engine.loadComponent('A', '<a>{Astro.props.x}</a>');
      engine.loadComponent('B', '<b><A x={Astro.props.y} /></b>');
      const html = await collectStream(engine, '<B y="val" />');
      expect(html).toBe('<b><a>val</a></b>');
    });

    it('renders component in ternary true branch', async () => {
      const engine = new Engine();
      engine.loadComponent('A', '<span>A</span>');
      engine.loadComponent('B', '<span>B</span>');
      const html = await collectStream(
        engine,
        '---\nconst x = true;\n---\n<div>{x ? <A/> : <B/>}</div>'
      );
      expect(html).toBe('<div><span>A</span></div>');
    });

    it('renders component in ternary false branch', async () => {
      const engine = new Engine();
      engine.loadComponent('A', '<span>A</span>');
      engine.loadComponent('B', '<span>B</span>');
      const html = await collectStream(
        engine,
        '---\nconst x = false;\n---\n<div>{x ? <A/> : <B/>}</div>'
      );
      expect(html).toBe('<div><span>B</span></div>');
    });

    it('parses template literal with interpolation', async () => {
      const html = await renderStream('---\nconst x = "world";\n---\n<div>{`hello ${x}`}</div>');
      expect(html).toBe('<div>hello world</div>');
    });

    it('parses nested expressions with elements', async () => {
      const html = await renderStream(
        '---\nconst arr = [1, 2];\n---\n<div>{arr.map(i => <span>{i}</span>)}</div>'
      );
      expect(html).toBe('<div><span>1</span><span>2</span></div>');
    });

    it('parses expression with string literal containing braces', async () => {
      const html = await renderStream('<div>{"{"}</div>');
      expect(html).toBe('<div>{</div>');
    });

    it('covers streaming nested elements', async () => {
      const html = await renderStream(
        '<html><head></head><body><div><p>deep</p></div></body></html>'
      );
      expect(html).toBe('<html><head></head><body><div><p>deep</p></div></body></html>');
    });

    it('covers streaming with element children', async () => {
      const html = await renderStream('<div><span>a</span><span>b</span></div>');
      expect(html).toBe('<div><span>a</span><span>b</span></div>');
    });

    it('covers spread with class:string and dynamic style', async () => {
      const html = await renderStream(
        '---\nconst p = { class: "a" };\nconst s = { color: "red" };\n---\n<div {...p} style={s} />'
      );
      expect(html).toContain('class="a"');
      expect(html).toContain('style="color:red"');
    });

    it('covers spread with style:object value', async () => {
      const html = await renderStream(
        '---\nconst p = { style: { fontSize: 14 } };\n---\n<div {...p} />'
      );
      expect(html).toContain('style="font-size:14"');
    });
  });
});
