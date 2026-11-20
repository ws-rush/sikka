import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { collectHtml } from './helpers.js';
import { Sikka } from '../src/index.js';
import { createCache } from '../src/cache.js';
import { SikkaError } from '../src/error.js';
import { escapeHtml, isRawHtml, RawHtml, stringifyHtml } from '../src/escape.js';
import type { PrecompiledModule, RenderFunction, SourceTemplate } from '../src/index.js';
import { bindRuntime, fragmentHtml, runtime } from '../src/runtime.js';
import { resolveSourceTemplate } from '../src/template-resolution.js';

function fakeRender(label: string): RenderFunction {
  const fn = (() => Promise.resolve(label)) as unknown as RenderFunction;
  fn.render = () => Promise.resolve(label);
  fn.renderSync = () => label;
  return fn;
}

describe('Sikka 1.0 application API', () => {
  it('requires an explicit mode and synchronous resolver', () => {
    const Constructor = Sikka as unknown as new (options?: unknown) => Sikka;
    expect(() => new Constructor()).toThrow(/requires mode/);
    expect(() => new Constructor({ mode: 'source' })).toThrow(/Source mode.*resolver/);
    expect(() => new Constructor({ mode: 'precompiled' })).toThrow(/Precompiled mode.*resolver/);
  });

  it('renders and streams source entries through canonical identities', async () => {
    const requests: [string, string | undefined][] = [];
    const sikka = new Sikka({
      cache: true,
      mode: 'source',
      resolver(request, importer) {
        requests.push([request, importer]);
        if (request === 'page')
          return {
            id: 'templates/page.sikka',
            source:
              '---\nimport Card from "./Card.sikka";\n---\nbefore<Card title={Sikka.props.title} />after',
          };
        if (request === './Card.sikka')
          return { id: 'templates/Card.sikka', source: '<b>{Sikka.props.title}</b>' };
        throw new Error('missing Template');
      },
    });

    expect(sikka.render('page', { title: '<Ada>' })).toBe('before<b>&lt;Ada&gt;</b>after');
    expect(await collectHtml(sikka.stream('page', { title: '<Ada>' }))).toBe(
      'before<b>&lt;Ada&gt;</b>after'
    );
    expect(requests).toEqual([
      ['page', undefined],
      ['./Card.sikka', 'templates/page.sikka'],
      ['page', undefined],
      ['./Card.sikka', 'templates/page.sikka'],
    ]);
  });

  it('keeps regular and Streaming caches separate and invalidates both by canonical identity', async () => {
    let source = '<p>first</p>';
    const sikka = new Sikka({
      cache: true,
      mode: 'source',
      resolver: () => ({ id: 'canonical-page', source }),
    });

    expect(sikka.render('first-alias')).toBe('<p>first</p>');
    expect(await collectHtml(sikka.stream('second-alias'))).toBe('<p>first</p>');
    source = '<p>second</p>';
    expect(sikka.render('third-alias')).toBe('<p>first</p>');
    expect(await collectHtml(sikka.stream('fourth-alias'))).toBe('<p>first</p>');

    sikka.invalidate('canonical-page');
    expect(sikka.render('first-alias')).toBe('<p>second</p>');
    expect(await collectHtml(sikka.stream('second-alias'))).toBe('<p>second</p>');
  });

  it('reports source resolution failures with request and canonical identity context', () => {
    const invalid = new Sikka({
      mode: 'source',
      resolver: () => ({ id: 'page', source: null }) as unknown as SourceTemplate,
    });
    expect(() => invalid.render('home')).toThrow(/home.*canonical identity.*page/);
  });

  it('invokes loaded precompiled module exports with its configured receiver', async () => {
    const module: PrecompiledModule = {
      render(props) {
        return `<p>${props.value}</p>`;
      },
      async *stream(props) {
        yield `<p>${props.value}</p>`;
      },
    };
    const sikka = new Sikka({ mode: 'precompiled', resolver: () => module });

    expect(sikka.render('page', { value: 'rendered' })).toBe('<p>rendered</p>');
    expect(await collectHtml(sikka.stream('page', { value: 'streamed' }))).toBe('<p>streamed</p>');
  });

  it('caches precompiled modules until invalidated', () => {
    let calls = 0;
    const module = (value: string): PrecompiledModule => ({
      render: () => `<p>${value}</p>`,
      async *stream() {
        yield `<p>${value}</p>`;
      },
    });
    const sikka = new Sikka({
      mode: 'precompiled',
      resolver: () => module(calls++ ? 'second' : 'first'),
    });

    expect(sikka.render('page')).toBe('<p>first</p>');
    expect(sikka.render('page')).toBe('<p>first</p>');
    sikka.invalidate('page');
    expect(sikka.render('page')).toBe('<p>second</p>');
    expect(calls).toBe(2);
  });

  it('renames the props variable with source-mode varName', () => {
    const sikka = new Sikka({
      mode: 'source',
      varName: 'Page',
      resolver: () => ({ id: 'page', source: '<p>{Page.props.title}</p>' }),
    });

    expect(sikka.render('page', { title: 'renamed' })).toBe('<p>renamed</p>');
  });

  it('does not accept varName in precompiled mode', () => {
    const module: PrecompiledModule = {
      render: () => '<p>ok</p>',
      async *stream() {
        yield '<p>ok</p>';
      },
    };
    // varName is a source-mode compile-time option; generated modules always bind Sikka.
    // @ts-expect-error varName is not a precompiled-mode option
    const sikka = new Sikka({ mode: 'precompiled', resolver: () => module, varName: 'Page' });

    expect(sikka.render('page')).toBe('<p>ok</p>');
  });

  it('has no pre-1.0 instance APIs', () => {
    const sikka = new Sikka({
      mode: 'source',
      resolver: () => ({ id: 'page', source: '' }),
    }) as unknown as Record<string, unknown>;
    for (const method of [
      'renderString',
      'streamString',
      'compile',
      'compileToString',
      'loadComponent',
      'registerComponent',
    ])
      expect(method in sikka).toBe(false);
  });

  it('maintains LRU recency on get() and set() updates, and respects unbounded caches', () => {
    const cache = createCache(2);
    const a1 = fakeRender('a1');
    const a2 = fakeRender('a2');
    const b = fakeRender('b');
    const c = fakeRender('c');

    cache.set('a', a1);
    cache.set('b', b);
    // Reading 'a' moves it to MRU so 'b' is evicted next.
    expect(cache.get('a')).toBe(a1);
    cache.set('c', c);
    expect(cache.get('b')).toBe(undefined);
    expect(cache.get('a')).toBe(a1);
    expect(cache.get('c')).toBe(c);

    // Updating existing key 'a' refreshes its recency without evicting 'c'.
    cache.set('a', a2);
    cache.set('b', b);
    expect(cache.get('c')).toBe(undefined);
    expect(cache.get('a')).toBe(a2);
    expect(cache.get('b')).toBe(b);

    // Unbounded cache does not evict.
    const unbounded = createCache();
    for (let i = 0; i < 10; i++) unbounded.set(`k${i}`, fakeRender(`v${i}`));
    for (let i = 0; i < 10; i++) expect(unbounded.get(`k${i}`)?.renderSync({})).toBe(`v${i}`);
  });

  it('preserves cause on SikkaError', () => {
    const root = new Error('boom');
    const err = new SikkaError('wrapped', { category: 'Resolve', cause: root });
    expect(err.name).toBe('ResolveError');
    expect(err.category).toBe('Resolve');
    expect(err.cause).toBe(root);
  });

  it('handles RawHtml branding, cross-realm objects, and stringifyHtml', () => {
    const brand = Symbol.for('sikka.raw-html');
    const raw = new RawHtml('<b>hi</b>');
    expect(raw[brand]).toBe(true);
    expect(isRawHtml(raw)).toBe(true);

    const crossRealm = { [brand]: true, value: '<i>cross</i>' };
    expect(isRawHtml(crossRealm)).toBe(true);
    expect(escapeHtml(crossRealm)).toBe('<i>cross</i>');
    expect(stringifyHtml(crossRealm)).toBe('<i>cross</i>');
    expect(stringifyHtml(raw)).toBe('<b>hi</b>');

    expect(isRawHtml({ [brand]: false, value: 'no' })).toBe(false);
    expect(isRawHtml({ [brand]: true, value: 123 })).toBe(false);
    expect(isRawHtml(null)).toBe(false);
    expect(isRawHtml('str')).toBe(false);
  });

  it('validates source template resolution diagnostics and whitespace identities', () => {
    expect(() =>
      resolveSourceTemplate('bad', () => {
        throw new Error('disk fail');
      })
    ).toThrow(/ResolveError for "bad": disk fail$/);

    try {
      resolveSourceTemplate(
        'missing',
        () => ({ id: '   ', source: '<p/>' }) as unknown as SourceTemplate,
        'parent.sikka'
      );
      throw new Error('expected throw');
    } catch (err) {
      expect(err instanceof SikkaError).toBe(true);
      const sErr = err as SikkaError;
      expect(sErr.category).toBe('Resolve');
      expect(sErr.request).toBe('missing');
      expect(sErr.importer).toBe('parent.sikka');
      expect(sErr.template).toBe('   ');
      expect(sErr.message.includes('imported by canonical identity "parent.sikka"')).toBe(true);
    }

    try {
      resolveSourceTemplate('null-res', () => null as unknown as SourceTemplate);
      throw new Error('expected throw');
    } catch (err) {
      const sErr = err as SikkaError;
      expect(sErr.category).toBe('Resolve');
      expect(sErr.template).toBe(undefined);
      expect(sErr.message).toBe('ResolveError: invalid result for "null-res"');
    }
  });

  it('covers runtime helpers, bindRuntime cache, classList, styleObject, and fragmentHtml', () => {
    const custom = runtime({ autoEscape: false });
    const receiver = {};
    bindRuntime(receiver, custom);
    expect(runtime(receiver)).toBe(custom);

    const def = runtime(undefined);
    expect(def.filter('x')).toBe('x');
    expect(def.autoFilter).toBe(false);
    expect(def.aggregateAssets).toBe(false);
    expect(def.classList({ a: true, b: true, c: false })).toBe('a b');
    expect(def.classList(null)).toBe('');
    expect(def.styleObject(null)).toBe('');
    expect(def.styleObject({ color: 'red', fontSize: '12px', '--Custom': '1' })).toBe(
      'color:red;font-size:12px;--Custom:1'
    );
    expect(def.styleObject({ toString: () => 'display:block' } as unknown as string)).toBe(
      'display:block'
    );

    expect(
      fragmentHtml('<div class="a" style="color:red"/>', { style: { fontSize: '10px' } })
    ).toBe('<div class="a" style="color:red; font-size:10px" />');
  });

  it('covers Sikka cache options, full invalidation, and source/precompiled error paths', async () => {
    // Custom cache object and cacheSize without cache: true
    const hits: string[] = [];
    const customCache = createCache(2);
    const wrappedCache = {
      get: (k: string) => {
        hits.push(`get:${k}`);
        return customCache.get(k);
      },
      set: (k: string, fn: RenderFunction) => {
        hits.push(`set:${k}`);
        customCache.set(k, fn);
      },
      delete: (k: string) => customCache.delete(k),
      clear: () => customCache.clear(),
    };
    const withCustom = new Sikka({
      mode: 'source',
      cache: wrappedCache,
      resolver: () => ({ id: 'p', source: '<p>ok</p>' }),
    });
    expect(withCustom.render('p')).toBe('<p>ok</p>');
    expect(hits.includes('set:p')).toBe(true);

    let count = 0;
    const withSize = new Sikka({
      mode: 'source',
      cacheSize: 1,
      resolver: (r) => ({ id: r, source: `<p>${++count}</p>` }),
    });
    expect(withSize.render('a')).toBe('<p>1</p>');
    expect(withSize.render('a')).toBe('<p>1</p>');
    withSize.invalidate();
    expect(withSize.render('a')).toBe('<p>3</p>');

    // Source parse error, compile error, and cycle error
    const badParse = new Sikka({
      mode: 'source',
      resolver: () => ({ id: 'bad', source: '<div>' }),
    });
    expect(() => badParse.render('bad')).toThrow(/ParseError in bad: Unclosed tag/);

    const badCompile = new Sikka({
      mode: 'source',
      resolver: () => ({ id: 'frag', source: '<Fragment class="x"/>' }),
    });
    expect(() => badCompile.render('frag')).toThrow(/Fragment/);

    const cycle = new Sikka({
      mode: 'source',
      resolver: (r) =>
        r === 'a.sikka'
          ? { id: 'a.sikka', source: '---\nimport B from "b.sikka";\n---\n<B/>' }
          : { id: 'b.sikka', source: '---\nimport A from "a.sikka";\n---\n<A/>' },
    });
    expect(() => cycle.render('a.sikka')).toThrow(
      /circular component dependency a\.sikka → b\.sikka → a\.sikka/
    );

    // Precompiled errors & full invalidation
    const throwingPre = new Sikka({
      mode: 'precompiled',
      resolver: () => {
        throw new Error('load fail');
      },
    });
    expect(() => throwingPre.render('x')).toThrow(
      /ResolveError for precompiled entry "x": load fail/
    );

    const missingPre = new Sikka({
      mode: 'precompiled',
      resolver: () => undefined as unknown as PrecompiledModule,
    });
    expect(() => missingPre.render('x')).toThrow(/resolver returned no loaded module/);

    const invalidPre = new Sikka({
      mode: 'precompiled',
      resolver: () => ({ render: () => '' }) as unknown as PrecompiledModule,
    });
    expect(() => invalidPre.render('x')).toThrow(/invalid generated module ABI/);

    const badReturnPre = new Sikka({
      mode: 'precompiled',
      resolver: () =>
        ({
          render: () => 123,
          stream: () => 456,
        }) as unknown as PrecompiledModule,
    });
    expect(() => badReturnPre.render('x')).toThrow(/must return HTML synchronously/);
    expect(() => badReturnPre.stream('x')).toThrow(/must return an async iterable/);

    let ver = 1;
    const invPre = new Sikka({
      mode: 'precompiled',
      resolver: () => ({
        render: () => `v${ver}`,
        async *stream() {
          yield `v${ver}`;
        },
      }),
    });
    expect(invPre.render('x')).toBe('v1');
    expect(invPre.render('x')).toBe('v1');
    ver = 2;
    invPre.invalidate();
    expect(invPre.render('x')).toBe('v2');
    expect(await collectHtml(invPre.stream('x'))).toBe('v2');
  });

  it('covers index.ts precompiled caching, per-id invalidation, cache: false, and error metadata', async () => {
    let sourceReads = 0;
    const noCache = new Sikka({
      mode: 'source',
      cache: false,
      cacheSize: 10,
      resolver: (id) => {
        sourceReads++;
        return { id, source: '<p>ok</p>' };
      },
    });
    expect(noCache.render('a')).toBe('<p>ok</p>');
    expect(noCache.render('a')).toBe('<p>ok</p>');
    expect(sourceReads).toBe(2);

    let preReads = 0;
    let ver = 1;
    const pre = new Sikka({
      mode: 'precompiled',
      resolver: (id) => {
        preReads++;
        const v = ver;
        return {
          render: () => `${id}:v${v}`,
          async *stream() {
            yield `${id}:v${v}`;
          },
        };
      },
    });
    expect(pre.render('a')).toBe('a:v1');
    expect(await collectHtml(pre.stream('a'))).toBe('a:v1');
    expect(preReads).toBe(1);

    ver = 2;
    pre.invalidate('b');
    expect(pre.render('a')).toBe('a:v1');
    pre.invalidate('a');
    expect(pre.render('a')).toBe('a:v2');

    const root = new Error('boom');
    const throwingPre = new Sikka({
      mode: 'precompiled',
      resolver: () => {
        throw root;
      },
    });
    try {
      throwingPre.render('bad');
      throw new Error('expected throw');
    } catch (err) {
      const sErr = err as SikkaError;
      expect(sErr.category).toBe('Resolve');
      expect(sErr.request).toBe('bad');
      expect(sErr.cause).toBe(root);
    }

    const missingPre = new Sikka({
      mode: 'precompiled',
      resolver: () => undefined as unknown as PrecompiledModule,
    });
    try {
      missingPre.render('none');
      throw new Error('expected throw');
    } catch (err) {
      const sErr = err as SikkaError;
      expect(sErr.category).toBe('Resolve');
      expect(sErr.request).toBe('none');
    }

    const badAbiPre = new Sikka({
      mode: 'precompiled',
      resolver: () => ({ render: () => 'x' }) as unknown as PrecompiledModule,
    });
    try {
      badAbiPre.render('abi');
      throw new Error('expected throw');
    } catch (err) {
      const sErr = err as SikkaError;
      expect(sErr.category).toBe('Render');
      expect(sErr.request).toBe('abi');
    }

    const parseFail = new Sikka({
      mode: 'source',
      resolver: (id) => ({ id, source: '<div>' }),
    });
    try {
      parseFail.render('broken.sikka');
      throw new Error('expected throw');
    } catch (err) {
      const sErr = err as SikkaError;
      expect(sErr.template).toBe('broken.sikka');
      expect(sErr.message.includes('ParseError in broken.sikka: Unclosed tag <div>')).toBe(true);
    }
  });
});
