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
  const { escape: __escape, RawHtml: __RawHtml, classList: __classList, styleObject: __styleObject, filter: __filter } = runtime(this);
  const __components = { ${regularComponents.join(', ')} };
${artifact.renderString}
}
export async function* stream(props, slots = {}) {
  const { escape: __escape, RawHtml: __RawHtml, classList: __classList, styleObject: __styleObject, filter: __filter } = runtime(this);
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
