import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { collectHtml } from './helpers.js';
import { Sikka } from '../src/index.js';
import type { PrecompiledModule, SourceTemplate } from '../src/index.js';

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
            id: 'templates/page.astro',
            source:
              '---\nimport Card from "./Card.astro";\n---\nbefore<Card title={Astro.props.title} />after',
          };
        if (request === './Card.astro')
          return { id: 'templates/Card.astro', source: '<b>{Astro.props.title}</b>' };
        throw new Error('missing Template');
      },
    });

    expect(sikka.render('page', { title: '<Ada>' })).toBe('before<b>&lt;Ada&gt;</b>after');
    expect(await collectHtml(sikka.stream('page', { title: '<Ada>' }))).toBe(
      'before<b>&lt;Ada&gt;</b>after'
    );
    expect(requests).toEqual([
      ['page', undefined],
      ['./Card.astro', 'templates/page.astro'],
      ['page', undefined],
      ['./Card.astro', 'templates/page.astro'],
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
    // varName is a source-mode compile-time option; generated modules always bind Astro.
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
});
