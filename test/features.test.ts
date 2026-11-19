import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { extractAssets, Sikka, SikkaError } from '../src/index.js';
import { compile, emitModule } from '../src/precompile.js';
import { sikka as sikkaVite } from '../src/vite.js';

describe('Fragment set:html with attributes', () => {
  it('strips XML declarations, merges classes, and updates attributes safely on any root element', () => {
    const raw =
      '<?xml version="1.0" encoding="utf-8"?>\n<svg class="icon" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';

    const engine = new Sikka({
      mode: 'source',
      resolver: () => ({
        id: 'page',
        source:
          '<a><Fragment set:html={Sikka.props.icon} class="h-8 w-8" aria-hidden aria-label={\'Logo & "Brand"\'} viewBox={null} /></a>',
      }),
    });
    const html = engine.render('page', { icon: raw });
    expect(html).toBe(
      '<a><svg class="icon h-8 w-8" aria-hidden aria-label="Logo &amp; &quot;Brand&quot;"><path d="M0 0h24v24H0z"/></svg></a>'
    );
  });

  it('merges attributes onto arbitrary HTML root elements, handles class:list/style/spread, and preserves self-closing tags', async () => {
    const template =
      '<Fragment set:html={Sikka.props.card} class="active" class:list={["rounded", true && "shadow"]} style={{ color: "red" }} {...Sikka.props.extra} />';
    const props = {
      card: '<div class="card" data-expr="a>b" style="margin:0">Hi</div>',
      extra: { id: 'main', class: 'extra' },
    };

    const sourceEngine = new Sikka({
      mode: 'source',
      resolver: () => ({ id: 'page', source: template }),
    });
    const expected =
      '<div class="card active rounded shadow extra" data-expr="a&gt;b" style="margin:0; color:red" id="main">Hi</div>';
    expect(sourceEngine.render('page', props)).toBe(expected);

    let streamed = '';
    for await (const chunk of sourceEngine.stream('page', props)) streamed += chunk;
    expect(streamed).toBe(expected);

    const [artifact] = compile('page', { resolver: () => ({ id: 'page', source: template }) });
    const modSource = emitModule(artifact, {
      runtimeSpecifier: new URL('../dist/esm/runtime.js', import.meta.url).href,
    });
    const mod = await import(
      `data:text/javascript;base64,${Buffer.from(modSource).toString('base64')}`
    );
    const precompiledEngine = new Sikka({ mode: 'precompiled', resolver: () => mod });
    expect(precompiledEngine.render('page', props)).toBe(expected);
  });

  it('preserves self-closing tags and rejects attributes on Fragment without set:html', () => {
    const engine = new Sikka({
      mode: 'source',
      resolver: (id) => ({
        id,
        source:
          id === 'self'
            ? '<Fragment set:html="<svg viewBox=\'0 0 10 10\' />" class="size-4" />'
            : '<Fragment class="nope"><span>hi</span></Fragment>',
      }),
    });
    expect(engine.render('self')).toBe('<svg viewBox="0 0 10 10" class="size-4" />');
    expect(() => engine.render('bad')).toThrow(/InvalidFragment/);
  });
});

describe('extractAssets', () => {
  it('extracts, deduplicates, and injects <style> and <script> into </head> for render and stream output', async () => {
    const templates = new Map([
      [
        'page',
        {
          id: 'page.sikka',
          source:
            '---\nimport Card from "./Card.sikka";\n---\n<html><head><title>App</title></head><body><!-- <style>.ignored{}</style> --><Card /><Card /></body></html>',
        },
      ],
      [
        './Card.sikka',
        {
          id: 'Card.sikka',
          source:
            '<style>.card{color:red}</style><div class="card">Hi</div><script>console.log(1)</script>',
        },
      ],
    ]);

    const sourceEngine = new Sikka({
      mode: 'source',
      resolver: (req) => {
        const tpl = templates.get(req);
        if (!tpl) throw new Error(`Missing ${req}`);
        return tpl;
      },
    });

    const rendered = sourceEngine.render('page');
    const sourceResult = extractAssets(rendered);
    expect(sourceResult.styles).toEqual(['<style>.card{color:red}</style>']);
    expect(sourceResult.scripts).toEqual(['<script>console.log(1)</script>']);
    expect(sourceResult.html).toBe(
      '<html><head><title>App</title><style>.card{color:red}</style><script>console.log(1)</script></head><body><!-- <style>.ignored{}</style> --><div class="card">Hi</div><div class="card">Hi</div></body></html>'
    );

    const noInject = extractAssets(rendered, { inject: false });
    expect(noInject.html).toBe(
      '<html><head><title>App</title></head><body><!-- <style>.ignored{}</style> --><div class="card">Hi</div><div class="card">Hi</div></body></html>'
    );

    let streamed = '';
    for await (const chunk of sourceEngine.stream('page')) {
      streamed += chunk;
    }
    expect(extractAssets(streamed)).toEqual(sourceResult);

    const artifacts = compile('page', {
      resolver: (req) => {
        const tpl = templates.get(req);
        if (!tpl) throw new Error(`Missing ${req}`);
        return tpl;
      },
    });
    const modules = new Map<string, string>();
    for (const artifact of artifacts) {
      const code = emitModule(artifact, {
        runtimeSpecifier: new URL('../src/runtime.ts', import.meta.url).href,
        componentSpecifier: (c) =>
          `data:text/javascript,${encodeURIComponent(modules.get(c.id) ?? '')}`,
      });
      modules.set(artifact.id, code);
    }
    const pageModule = await import(
      `data:text/javascript,${encodeURIComponent(modules.get('page.sikka') ?? '')}`
    );
    const precompiledEngine = new Sikka({
      mode: 'precompiled',
      resolver: () => pageModule,
    });
    const precompiledResult = extractAssets(precompiledEngine.render('page'));
    expect(precompiledResult).toEqual(sourceResult);
  });
});

describe('sikka/vite', () => {
  it('transforms .sikka modules to static ESM and ignores other files', () => {
    const plugin = sikkaVite();
    expect(plugin.transform('export const x = 1;', '/app/src/main.ts')).toBe(null);

    const transformed = plugin.transform(
      '---\nimport Hero from "./Hero.sikka";\n---\n<Hero title={Sikka.props.title} />',
      '/app/src/home.sikka?ssr'
    );
    expect(transformed).not.toBe(null);
    expect(transformed?.code).toContain('import { runtime } from "sikka/runtime";');
    expect(transformed?.code).toContain('from "./Hero.sikka";');
    expect(transformed?.code).toContain('export function render(props, slots = {})');
    expect(transformed?.code).toContain('export async function* stream(props, slots = {})');
  });

  it('throws SikkaError on invalid template syntax', () => {
    const plugin = sikkaVite();
    assert.throws(() => plugin.transform('<div>{unclosed', '/app/src/bad.sikka'), SikkaError);
  });
});
