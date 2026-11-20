import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { extractAssets, Sikka, SikkaError } from '../src/index.js';
import { RawHtml } from '../src/escape.js';
import { compile, emitModule } from '../src/precompile.js';
import { mergeHtmlAttributes } from '../src/html.js';
import { compileViteModule, sikka as sikkaVite } from '../src/vite.js';

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

  it('covers extractAssets without head or with inject: false and mergeHtmlAttributes edge cases', () => {
    const noHead = extractAssets('<style>a{}</style><p>x</p><script>1</script>');
    expect(noHead.html).toBe('<p>x</p>');
    expect(noHead.styles).toEqual(['<style>a{}</style>']);
    expect(noHead.scripts).toEqual(['<script>1</script>']);

    const noInject = extractAssets('<head></head><style>a{}</style>', { inject: false });
    expect(noInject.html).toBe('<head></head>');

    const emptyAssets = extractAssets('<head></head><p>hi</p>');
    expect(emptyAssets.html).toBe('<head></head><p>hi</p>');

    expect(
      mergeHtmlAttributes('plain text', [{ id: 'x' }], {
        classList: () => '',
        styleObject: () => '',
      })
    ).toBe('plain text');
    expect(
      mergeHtmlAttributes(new RawHtml('<span>ok</span>'), [], {
        classList: () => '',
        styleObject: () => '',
      })
    ).toBe('<span>ok</span>');
    expect(mergeHtmlAttributes(null, [], { classList: () => '', styleObject: () => '' })).toBe('');
    expect(
      mergeHtmlAttributes(
        '<div a=1 b="2" disabled>hi</div>',
        [null, { b: false, c: '3&4', d: true }],
        {
          classList: () => '',
          styleObject: () => '',
        }
      )
    ).toBe('<div a="1" disabled c="3&amp;4" d>hi</div>');
    expect(() =>
      mergeHtmlAttributes('<div/>', [{ 'set:html': 'x' }], {
        classList: () => '',
        styleObject: () => '',
      })
    ).toThrow(/InvalidDirective/);
    expect(() =>
      mergeHtmlAttributes('<div/>', [{ 'x:y': 'x' }], {
        classList: () => '',
        styleObject: () => '',
      })
    ).toThrow(/InvalidDirective/);
  });

  it('covers vite plugin name, parse errors, and compile errors', () => {
    const plugin = sikkaVite();
    expect(plugin.name).toBe('sikka');

    try {
      compileViteModule('<div>', 'broken.sikka');
      throw new Error('expected throw');
    } catch (err) {
      const sErr = err as SikkaError;
      expect(sErr.category).toBe('Parse');
      expect(sErr.template).toBe('broken.sikka');
      expect(sErr.message.includes('Unclosed tag')).toBe(true);
    }

    try {
      compileViteModule('<Fragment class="x"/>', 'bad-frag.sikka');
      throw new Error('expected throw');
    } catch (err) {
      const sErr = err as SikkaError;
      expect(sErr.category).toBe('Compile');
      expect(sErr.template).toBe('bad-frag.sikka');
      expect(sErr.message.includes('Fragment')).toBe(true);
    }
  });

  it('covers html.ts extractAssets and mergeHtmlAttributes edge cases', () => {
    const emptyAssets = extractAssets('<head></head><p>hi</p>');
    expect(emptyAssets).toEqual({ html: '<head></head><p>hi</p>', styles: [], scripts: [] });

    const styleOnly = extractAssets('<style data-a=">" data-b=\'>\'>body{}</style><head></head>');
    expect(styleOnly.styles).toEqual(['<style data-a=">" data-b=\'>\'>body{}</style>']);
    expect(styleOnly.scripts).toEqual([]);
    expect(styleOnly.html).toBe('<head><style data-a=">" data-b=\'>\'>body{}</style></head>');

    const scriptOnly = extractAssets('<script data-a=">" data-b=\'>\'>x()</script><head></head>');
    expect(scriptOnly.styles).toEqual([]);
    expect(scriptOnly.scripts).toEqual(['<script data-a=">" data-b=\'>\'>x()</script>']);
    expect(scriptOnly.html).toBe('<head><script data-a=">" data-b=\'>\'>x()</script></head>');

    const helpers = {
      classList: (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v ?? '')),
      styleObject: (v: unknown) =>
        v && typeof v === 'object'
          ? Object.entries(v as Record<string, unknown>)
              .map(([k, val]) => `${k}:${val}`)
              .join(';')
          : '',
    };

    expect(
      mergeHtmlAttributes(
        '  <?xml version="1.0"?><?xml-stylesheet?><div id="a">hi</div>',
        [],
        helpers
      )
    ).toBe('<div id="a">hi</div>');
    expect(mergeHtmlAttributes(123, [{ id: 'x' }], helpers)).toBe('123');
    expect(
      mergeHtmlAttributes('<div class></div>', [{ class: ' b ' }, null, 'ignored'], helpers)
    ).toBe('<div class="b"></div>');
    expect(mergeHtmlAttributes('<div></div>', [{ style: ' color:red ' }], helpers)).toBe(
      '<div style="color:red"></div>'
    );
    expect(mergeHtmlAttributes('<div style=" "></div>', [{ style: 'color:red' }], helpers)).toBe(
      '<div style="color:red"></div>'
    );
    expect(
      mergeHtmlAttributes('<div style="color:red;"></div>', [{ style: ' margin:0 ' }], helpers)
    ).toBe('<div style="color:red; margin:0"></div>');
    expect(mergeHtmlAttributes('<div></div>', [{ className: 'cn' }], helpers)).toBe(
      '<div class="cn"></div>'
    );
    expect(
      mergeHtmlAttributes('<img src="a" alt=\'b\' data-n=1 disabled / >', [{ alt: 'c' }], helpers)
    ).toBe('<img src="a" alt="c" data-n="1" disabled />');

    expect(() => mergeHtmlAttributes('<div></div>', [{ 'set:html': 'x' }], helpers)).toThrow(
      /spread set:html is not supported/
    );
    expect(() => mergeHtmlAttributes('<div></div>', [{ 'set:text': 'x' }], helpers)).toThrow(
      /spread set:text is not supported/
    );
  });
});
