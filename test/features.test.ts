import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { Sikka, SikkaError, inlineSvg } from '../src/index.js';
import { compile, emitModule } from '../src/precompile.js';
import { sikka as sikkaVite } from '../src/vite.js';

describe('inlineSvg', () => {
  it('strips XML declarations, merges classes, and updates attributes safely', () => {
    const raw =
      '<?xml version="1.0" encoding="utf-8"?>\n<svg class="icon" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';
    const result = inlineSvg(raw, {
      class: 'h-8 w-8',
      'aria-hidden': true,
      'aria-label': 'Logo & "Brand"',
      viewBox: null,
    });

    const engine = new Sikka({
      mode: 'source',
      resolver: () => ({ id: 'page', source: '<a>{Sikka.props.icon}</a>' }),
    });
    const html = engine.render('page', { icon: result });
    expect(html).toBe(
      '<a><svg class="icon h-8 w-8" aria-hidden aria-label="Logo &amp; &quot;Brand&quot;"><path d="M0 0h24v24H0z"/></svg></a>'
    );
  });

  it('preserves self-closing svg tags', () => {
    const result = inlineSvg('<svg viewBox="0 0 10 10" />', { class: 'size-4' });
    expect(result.value).toBe('<svg viewBox="0 0 10 10" class="size-4" />');
  });
});

describe('renderWithAssets', () => {
  it('collects, deduplicates, and injects <style> and <script> into </head> in source and precompiled modes', async () => {
    const templates = new Map([
      [
        'page',
        {
          id: 'page.sikka',
          source:
            '---\nimport Card from "./Card.sikka";\n---\n<html><head><title>App</title></head><body><Card /><Card /></body></html>',
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

    const sourceResult = sourceEngine.renderWithAssets('page');
    expect(sourceResult.styles).toEqual(['<style>.card{color:red}</style>']);
    expect(sourceResult.scripts).toEqual(['<script>console.log(1)</script>']);
    expect(sourceResult.html).toBe(
      '<html><head><title>App</title><style>.card{color:red}</style><script>console.log(1)</script></head><body><div class="card">Hi</div><div class="card">Hi</div></body></html>'
    );

    const noInject = sourceEngine.renderWithAssets('page', {}, { inject: false });
    expect(noInject.html).toBe(
      '<html><head><title>App</title></head><body><div class="card">Hi</div><div class="card">Hi</div></body></html>'
    );

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
    const precompiledResult = precompiledEngine.renderWithAssets('page');
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
