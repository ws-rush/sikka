import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { Sikka } from '../src/index.js';
import {
  compile,
  emitModule,
  PRECOMPILE_ABI_VERSION,
  type PrecompileArtifact,
} from '../src/precompile.js';

function generatedModules(artifacts: PrecompileArtifact[]): Map<string, string> {
  const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const imports = new Map<string, string>();
  const generate = (id: string): string => {
    const known = imports.get(id);
    if (known) return known;
    const artifact = artifactById.get(id);
    if (!artifact) throw new Error(`Missing artifact: ${id}`);
    const source = emitModule(artifact, {
      runtimeSpecifier: new URL('../src/runtime.ts', import.meta.url).href,
      componentSpecifier: ({ id: componentId }) => generate(componentId),
    });
    const url = `data:text/javascript,${encodeURIComponent(source)}`;
    imports.set(id, url);
    return url;
  };
  for (const artifact of artifacts) generate(artifact.id);
  return imports;
}

async function renderedStream(module: {
  stream: (props: { name: string }) => AsyncGenerator<string>;
}) {
  const chunks: string[] = [];
  for await (const chunk of module.stream({ name: '<Ada>' })) chunks.push(chunk);
  return chunks.join('');
}

describe('sikka/precompile', () => {
  it('compiles entry and shared Component artifacts with canonical edges', () => {
    const requests: [string, string | undefined][] = [];
    const templates = new Map([
      [
        'home',
        {
          id: 'templates/home.sikka',
          source: '---\nimport Card from "./Card.sikka";\n---\n<Card />',
        },
      ],
      [
        'about',
        {
          id: 'templates/about.sikka',
          source: '---\nimport Card from "./Card.sikka";\n---\n<Card />',
        },
      ],
      ['./Card.sikka', { id: 'templates/components/card.sikka', source: '<p>Card</p>' }],
    ]);
    const artifacts = compile(['home', 'about'], {
      resolver(request, importer) {
        requests.push([request, importer]);
        const template = templates.get(request);
        if (!template) throw new Error('not found');
        return template;
      },
    });

    expect(requests).toEqual([
      ['home', undefined],
      ['./Card.sikka', 'templates/home.sikka'],
      ['about', undefined],
      ['./Card.sikka', 'templates/about.sikka'],
    ]);
    expect(artifacts.map(({ id }) => id)).toEqual([
      'templates/components/card.sikka',
      'templates/home.sikka',
      'templates/about.sikka',
    ]);
    expect(artifacts[1].abiVersion).toBe(PRECOMPILE_ABI_VERSION);
    expect(artifacts[1].components).toEqual([
      {
        localName: 'Card',
        specifier: './Card.sikka',
        id: 'templates/components/card.sikka',
      },
    ]);
    expect(artifacts[1].renderString).not.toBe(artifacts[1].streamString);
  });

  it('lets a build host link the complete graph as static ESM', async () => {
    const artifacts = compile('page', {
      resolver(request) {
        const templates: Record<string, { id: string; source: string }> = {
          page: {
            id: 'templates/page.sikka',
            source:
              '---\nimport Card from "./Card.sikka";\n---\n<main>before<Card name={Sikka.props.name}><i>slot</i></Card>after</main>',
          },
          './Card.sikka': {
            id: 'templates/Card.sikka',
            source:
              '---\nimport Label from "./Label.sikka";\n---\n<section><Label name={Sikka.props.name}/><slot /></section>',
          },
          './Label.sikka': { id: 'templates/Label.sikka', source: '<b>{Sikka.props.name}</b>' },
        };
        const template = templates[request];
        if (!template) throw new Error(`Unknown Template: ${request}`);
        return template;
      },
    });
    const modules = generatedModules(artifacts);
    const pageUrl = modules.get('templates/page.sikka') as string;
    const page = await import(pageUrl);
    const source = decodeURIComponent(pageUrl.slice(pageUrl.indexOf(',') + 1));

    expect(source).not.toContain('eval');
    expect(source).not.toContain('new Function');
    expect(Object.keys(page).toSorted()).toEqual(['render', 'stream']);
    expect(page.render({ name: '<Ada>' })).toBe(
      '<main>before<section><b>&lt;Ada&gt;</b><i>slot</i></section>after</main>'
    );
    expect(await renderedStream(page)).toBe(
      '<main>before<section><b>&lt;Ada&gt;</b><i>slot</i></section>after</main>'
    );
    expect(
      new Sikka({ mode: 'precompiled', autoEscape: false, resolver: () => page }).render('page', {
        name: '<Ada>',
      })
    ).toBe('<main>before<section><b><Ada></b><i>slot</i></section>after</main>');

    const sikka = new Sikka({
      mode: 'precompiled',
      resolver(entry) {
        if (entry === 'page') return page;
        throw new Error(`Unknown loaded module: ${entry}`);
      },
    });
    expect(sikka.render('page', { name: '<Ada>' })).toBe(
      '<main>before<section><b>&lt;Ada&gt;</b><i>slot</i></section>after</main>'
    );
    expect(await renderedStream({ stream: () => sikka.stream('page', { name: '<Ada>' }) })).toBe(
      '<main>before<section><b>&lt;Ada&gt;</b><i>slot</i></section>after</main>'
    );

    const configured = new Sikka({
      autoEscape: false,
      autoFilter: true,
      filterFunction: (value) => (typeof value === 'string' ? value.toUpperCase() : value),
      mode: 'precompiled',
      resolver: () => page,
    });
    const configuredHtml = '<main>before<section><b><ADA></b><i>slot</i></section>after</main>';
    expect(configured.render('page', { name: '<Ada>' })).toBe(configuredHtml);
    expect(
      await renderedStream({ stream: () => configured.stream('page', { name: '<Ada>' }) })
    ).toBe(configuredHtml);
  });

  it('uses the Component stream export in generated Streaming renders', async () => {
    const artifacts = compile('page', {
      resolver: (request) =>
        request === 'page'
          ? {
              id: 'page',
              source: '---\nimport Async from "./async.sikka";\n---\nbefore<Async />after',
            }
          : { id: 'async', source: '<i>regular</i>' },
    });
    const page = artifacts.find((artifact) => artifact.id === 'page');
    if (!page) throw new Error('Missing page artifact');
    const asyncComponent = `data:text/javascript,${encodeURIComponent(`
      export function render() { throw new Error('regular export called'); }
      export async function* stream() { yield '<i>streamed</i>'; }
    `)}`;
    const module = await import(
      `data:text/javascript,${encodeURIComponent(
        emitModule(page, {
          runtimeSpecifier: new URL('../src/runtime.ts', import.meta.url).href,
          componentSpecifier: () => asyncComponent,
        })
      )}`
    );

    expect(await renderedStream(module)).toBe('before<i>streamed</i>after');
  });

  it('applies aggregateAssets at precompiled render time', async () => {
    const template = '<script>const x = 1;</script><p>{Sikka.props.name}</p>';
    const [artifact] = compile('page', {
      resolver: () => ({ id: 'page', source: template }),
    });
    const module = await import(generatedModules([artifact]).get('page') as string);
    const options = {
      aggregateAssets: true,
      autoEscape: false,
      autoFilter: true,
      filterFunction: (value: unknown) => (typeof value === 'string' ? value.toUpperCase() : value),
    };
    const source = new Sikka({
      ...options,
      mode: 'source',
      resolver: () => ({ id: 'page', source: template }),
    });
    const precompiled = new Sikka({ ...options, mode: 'precompiled', resolver: () => module });
    const expected = '<p><ADA></p>';

    expect(source.render('page', { name: '<ada>' })).toBe(expected);
    expect(await renderedStream({ stream: (props) => source.stream('page', props) })).toBe(
      expected
    );
    expect(precompiled.render('page', { name: '<ada>' })).toBe(expected);
    expect(await renderedStream({ stream: (props) => precompiled.stream('page', props) })).toBe(
      expected
    );
  });

  it('keeps Component import forms as graph edges and ignores type-only imports', async () => {
    const source = `---
import Default from "./Card.sikka";
import { Named, Original as Aliased } from "./Card.sikka";
import Combined, { AlsoNamed } from "./Card.sikka";
import * as Namespace from "./Card.sikka";
import type { Data } from "./data.ts";
---
<Default /><Named /><Aliased /><Combined /><AlsoNamed /><Namespace />`;
    const resolver = (request: string) => {
      if (request === 'page') return { id: 'templates/page.sikka', source };
      if (request === './Card.sikka') return { id: 'templates/Card.sikka', source: '<i>card</i>' };
      throw new Error(`Unexpected request: ${request}`);
    };
    const artifacts = compile('page', { resolver });
    const page = artifacts.find(({ id }) => id === 'templates/page.sikka') as PrecompileArtifact;
    const names = ['Default', 'Named', 'Aliased', 'Combined', 'AlsoNamed', 'Namespace'];

    expect(page.components.map(({ localName }) => localName)).toEqual(names);
    const sourceSikka = new Sikka({ mode: 'source', resolver });
    expect(sourceSikka.render('page')).toBe('<i>card</i>'.repeat(names.length));
    const generated = await import(
      generatedModules(artifacts).get('templates/page.sikka') as string
    );
    expect(generated.render({})).toBe('<i>card</i>'.repeat(names.length));
  });

  it('rejects application-module imports with the same canonical identity in source and precompile', () => {
    const resolver = (request: string) => {
      if (request === 'page') {
        return {
          id: 'templates/page.sikka',
          source:
            '---\nimport data from "./data.ts";\nconst title = "Page";\n---\n<h1>{title}</h1>',
        };
      }
      throw new Error(`Application module must not resolve: ${request}`);
    };
    const source = new Sikka({ mode: 'source', resolver });
    const diagnostic =
      /Unsupported Frontmatter import.*data\.ts.*canonical Template.*templates\/page\.sikka/;

    expect(() => source.render('page')).toThrow(diagnostic);
    expect(() => source.stream('page')).toThrow(diagnostic);
    expect(() => compile('page', { resolver })).toThrow(diagnostic);
  });

  it('reports graph resolution failures with identity context', () => {
    expect(() =>
      compile('missing', {
        resolver: () => {
          throw new Error('not found');
        },
      })
    ).toThrow(/ResolveError.*missing.*not found/);
    expect(() =>
      compile('page', {
        resolver: (request) => {
          if (request === 'page') {
            return {
              id: 'templates/page.sikka',
              source: '---\nimport Card from "./Card.sikka";\n---\n<Card />',
            };
          }
          throw new Error('not found');
        },
      })
    ).toThrow(/ResolveError.*Card.*templates\/page\.sikka.*not found/);
    expect(() =>
      compile('page', {
        resolver: (request) =>
          request === 'page'
            ? {
                id: 'templates/page.sikka',
                source: '---\nimport Card from "./Card.sikka";\n---\n<Card />',
              }
            : ({ id: '', source: '' } as never),
      })
    ).toThrow(/ResolveError.*Card.*templates\/page\.sikka/);
    expect(() =>
      compile('page', {
        resolver: (request) =>
          request === 'page' || request === './page.sikka'
            ? {
                id: 'templates/page.sikka',
                source: '---\nimport Card from "./Card.sikka";\n---\n<Card />',
              }
            : {
                id: 'templates/Card.sikka',
                source: '---\nimport Page from "./page.sikka";\n---\n<Page />',
              },
      })
    ).toThrow(
      /ResolveError.*templates\/Card\.sikka.*templates\/page\.sikka.*templates\/Card\.sikka/
    );
  });

  it('emits complete static ESM modules and guards host links and ABI', () => {
    const [plain] = compile('page', {
      resolver: () => ({ id: 'page', source: '<p>{Sikka.props.name}</p>' }),
    });
    const source = emitModule(plain);

    expect(source).toContain('from "sikka/runtime";');
    expect(source).toContain('export function render(props, slots = {})');
    expect(source).toContain('export async function* stream(props, slots = {})');
    expect(source).not.toContain('__component_');

    const artifacts = compile('page', {
      resolver: (request) =>
        request === 'page'
          ? { id: 'page', source: '---\nimport Card from "./Card.sikka";\n---\n<Card />' }
          : { id: 'card', source: '<i>card</i>' },
    });
    const linked = artifacts.find(({ id }) => id === 'page');
    if (!linked) throw new Error('Missing page artifact');
    expect(() => emitModule(linked)).toThrow(/componentSpecifier.*card.*imported by.*page/);
    expect(emitModule(linked, { componentSpecifier: () => './Card.sikka.mjs' })).toContain(
      'from "./Card.sikka.mjs";'
    );

    expect(() => emitModule(plain, { runtimeSpecifier: '' })).toThrow(/non-empty runtimeSpecifier/);
    expect(() => emitModule({ ...plain, abiVersion: 99 as never })).toThrow(
      /Unsupported precompile artifact ABI 99.*expected 3/
    );
  });
});
