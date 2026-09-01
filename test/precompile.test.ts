import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { Sikka } from '../src/index.js';
import { compile, PRECOMPILE_ABI_VERSION, type PrecompileArtifact } from '../src/precompile.js';

function wrap(artifact: PrecompileArtifact, componentUrl: (id: string) => string): string {
  const components = artifact.components.map((component, index) => ({
    ...component,
    render: `__component_${index}_render`,
    stream: `__component_${index}_stream`,
  }));
  const links = components
    .map(
      ({ id, render, stream }) =>
        `import { render as ${render}, stream as ${stream} } from ${JSON.stringify(componentUrl(id))};`
    )
    .join('\n');
  const regularComponents = components.map(
    ({ localName, render }) => `${JSON.stringify(localName)}: ${render}`
  );
  const streamingComponents = components.map(
    ({ localName, stream }) => `${JSON.stringify(localName)}: ${stream}`
  );
  const runtime = new URL('../src/runtime.ts', import.meta.url).href;
  return `import { runtime } from ${JSON.stringify(runtime)};
${links}
export function render(props, slots = {}) {
  const { escape: __escape, classList: __classList, styleObject: __styleObject, filter: __filter, aggregateAssets: __aggregateAssets } = runtime(this);
  const __components = { ${regularComponents.join(', ')} };
${artifact.renderString}
}
export async function* stream(props, slots = {}) {
  const { escape: __escape, classList: __classList, styleObject: __styleObject, filter: __filter, aggregateAssets: __aggregateAssets } = runtime(this);
  const __components = { ${streamingComponents.join(', ')} };
${artifact.streamString}
}`;
}

function generatedModules(artifacts: PrecompileArtifact[]): Map<string, string> {
  const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const imports = new Map<string, string>();
  const generate = (id: string): string => {
    const known = imports.get(id);
    if (known) return known;
    const artifact = artifactById.get(id);
    if (!artifact) throw new Error(`Missing artifact: ${id}`);
    const source = wrap(artifact, generate);
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
          id: 'templates/home.astro',
          source: '---\nimport Card from "./Card.astro";\n---\n<Card />',
        },
      ],
      [
        'about',
        {
          id: 'templates/about.astro',
          source: '---\nimport Card from "./Card.astro";\n---\n<Card />',
        },
      ],
      ['./Card.astro', { id: 'templates/components/card.astro', source: '<p>Card</p>' }],
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
      ['./Card.astro', 'templates/home.astro'],
      ['about', undefined],
      ['./Card.astro', 'templates/about.astro'],
    ]);
    expect(artifacts.map(({ id }) => id)).toEqual([
      'templates/components/card.astro',
      'templates/home.astro',
      'templates/about.astro',
    ]);
    expect(artifacts[1].abiVersion).toBe(PRECOMPILE_ABI_VERSION);
    expect(artifacts[1].components).toEqual([
      {
        localName: 'Card',
        specifier: './Card.astro',
        id: 'templates/components/card.astro',
      },
    ]);
    expect(artifacts[1].renderString).not.toBe(artifacts[1].streamString);
  });

  it('lets a build host link the complete graph as static ESM', async () => {
    const artifacts = compile('page', {
      resolver(request) {
        const templates: Record<string, { id: string; source: string }> = {
          page: {
            id: 'templates/page.astro',
            source:
              '---\nimport Card from "./Card.astro";\n---\n<main>before<Card name={Astro.props.name}><i>slot</i></Card>after</main>',
          },
          './Card.astro': {
            id: 'templates/Card.astro',
            source:
              '---\nimport Label from "./Label.astro";\n---\n<section><Label name={Astro.props.name}/><slot /></section>',
          },
          './Label.astro': { id: 'templates/Label.astro', source: '<b>{Astro.props.name}</b>' },
        };
        const template = templates[request];
        if (!template) throw new Error(`Unknown Template: ${request}`);
        return template;
      },
    });
    const modules = generatedModules(artifacts);
    const pageUrl = modules.get('templates/page.astro') as string;
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
    expect(page.render.call(new Sikka({ autoEscape: false }), { name: '<Ada>' })).toBe(
      '<main>before<section><b><Ada></b><i>slot</i></section>after</main>'
    );

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

  it('applies aggregateAssets at precompiled render time', async () => {
    const template = '<script>const x = 1;</script><p>{Astro.props.name}</p>';
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
import Default from "./Card.astro";
import { Named, Original as Aliased } from "./Card.astro";
import Combined, { AlsoNamed } from "./Card.astro";
import * as Namespace from "./Card.astro";
import type { Data } from "./data.ts";
---
<Default /><Named /><Aliased /><Combined /><AlsoNamed /><Namespace />`;
    const resolver = (request: string) => {
      if (request === 'page') return { id: 'templates/page.astro', source };
      if (request === './Card.astro') return { id: 'templates/Card.astro', source: '<i>card</i>' };
      throw new Error(`Unexpected request: ${request}`);
    };
    const artifacts = compile('page', { resolver });
    const page = artifacts.find(({ id }) => id === 'templates/page.astro') as PrecompileArtifact;
    const names = ['Default', 'Named', 'Aliased', 'Combined', 'AlsoNamed', 'Namespace'];

    expect(page.components.map(({ localName }) => localName)).toEqual(names);
    const sourceSikka = new Sikka({ mode: 'source', resolver });
    expect(sourceSikka.render('page')).toBe('<i>card</i>'.repeat(names.length));
    const generated = await import(
      generatedModules(artifacts).get('templates/page.astro') as string
    );
    expect(generated.render({})).toBe('<i>card</i>'.repeat(names.length));
  });

  it('rejects application-module imports with the same canonical identity in source and precompile', () => {
    const resolver = (request: string) => {
      if (request === 'page') {
        return {
          id: 'templates/page.astro',
          source:
            '---\nimport data from "./data.ts";\nconst title = "Page";\n---\n<h1>{title}</h1>',
        };
      }
      throw new Error(`Application module must not resolve: ${request}`);
    };
    const source = new Sikka({ mode: 'source', resolver });
    const diagnostic =
      /Unsupported Frontmatter import.*data\.ts.*canonical Template.*templates\/page\.astro/;

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
              id: 'templates/page.astro',
              source: '---\nimport Card from "./Card.astro";\n---\n<Card />',
            };
          }
          throw new Error('not found');
        },
      })
    ).toThrow(/ResolveError.*Card.*templates\/page\.astro.*not found/);
    expect(() =>
      compile('page', {
        resolver: (request) =>
          request === 'page'
            ? {
                id: 'templates/page.astro',
                source: '---\nimport Card from "./Card.astro";\n---\n<Card />',
              }
            : ({ id: '', source: '' } as never),
      })
    ).toThrow(/ResolveError.*Card.*templates\/page\.astro/);
    expect(() =>
      compile('page', {
        resolver: (request) =>
          request === 'page' || request === './page.astro'
            ? {
                id: 'templates/page.astro',
                source: '---\nimport Card from "./Card.astro";\n---\n<Card />',
              }
            : {
                id: 'templates/Card.astro',
                source: '---\nimport Page from "./page.astro";\n---\n<Page />',
              },
      })
    ).toThrow(
      /ResolveError.*templates\/Card\.astro.*templates\/page\.astro.*templates\/Card\.astro/
    );
  });
});
