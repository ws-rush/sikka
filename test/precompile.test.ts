import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { Sikka } from '../src/index.js';
import { compile, PRECOMPILE_ABI_VERSION, type PrecompileArtifact } from '../src/precompile.js';

function wrap(artifact: PrecompileArtifact): string {
  return `import { runtime } from "sikka/runtime";
export function render(props, slots = {}) {
  const { escape: __escape, RawHtml: __RawHtml, components: __components, classList: __classList, styleObject: __styleObject, filter: __filter } = runtime(this);
${artifact.renderString}
}
export async function* stream(props, slots = {}) {
  const { escape: __escape, RawHtml: __RawHtml, components: __components, classList: __classList, styleObject: __styleObject, filter: __filter } = runtime(this);
${artifact.streamString}
}`;
}

async function loadGeneratedModule(artifact: PrecompileArtifact) {
  const runtime = new URL('../src/runtime.ts', import.meta.url).href;
  const source = wrap(artifact).replace('"sikka/runtime"', JSON.stringify(runtime));
  return import(`data:text/javascript,${encodeURIComponent(source)}`);
}

async function renderedStream(
  module: Awaited<ReturnType<typeof loadGeneratedModule>>
): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of module.stream({ name: '<Ada>' })) chunks.push(chunk);
  return chunks.join('');
}

describe('sikka/precompile', () => {
  it('compiles one canonical Template without traversing Component edges', () => {
    const requests: [string, string | undefined][] = [];
    const artifact = compile('page', {
      resolver(request, importer) {
        requests.push([request, importer]);
        return {
          id: 'templates/page.astro',
          source: '---\nimport Card from "./Card.astro";\n---\n<h1>{Astro.props.name}</h1>',
        };
      },
    });

    expect(requests).toEqual([['page', undefined]]);
    expect(artifact.abiVersion).toBe(PRECOMPILE_ABI_VERSION);
    expect(artifact.id).toBe('templates/page.astro');
    expect(artifact.components).toEqual([{ localName: 'Card', specifier: './Card.astro' }]);
    expect(artifact.renderString).not.toBe(artifact.streamString);
  });

  it('runs a host-wrapped static ESM module without source evaluation', async () => {
    const artifact = compile('page', {
      resolver: () => ({ id: 'page', source: '<h1>{Astro.props.name}</h1>' }),
    });
    const source = wrap(artifact);
    const module = await loadGeneratedModule(artifact);

    expect(source).toContain('from "sikka/runtime"');
    expect(source).not.toContain('eval');
    expect(source).not.toContain('new Function');
    expect(Object.keys(module).toSorted()).toEqual(['render', 'stream']);
    expect(module.render({ name: '<Ada>' })).toBe('<h1>&lt;Ada&gt;</h1>');
    expect(await renderedStream(module)).toBe('<h1>&lt;Ada&gt;</h1>');
    expect(module.render.call(new Sikka({ autoEscape: false }), { name: '<Ada>' })).toBe(
      '<h1><Ada></h1>'
    );
  });
});
