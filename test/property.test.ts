import { describe, it } from 'node:test';
import { expect } from './assert.js';
import {
  PORTABLE_RUNS,
  PORTABLE_SEED,
  PortableGenerator,
  runPortableProperty,
} from './portable.js';
import { Sikka } from '../src/index.js';
import { compile, type PrecompileArtifact } from '../src/precompile.js';

const text = new PortableGenerator().string().filter((value) => value.length > 0);
const props = new PortableGenerator().object({
  name: text,
  items: new PortableGenerator().array(text, 5),
});

function templateFor(template: string, components: Record<string, string> = {}) {
  return (request: string) => {
    const templateSource = request === 'page' ? template : components[request];
    if (templateSource === undefined) throw new Error(`Unknown Template: ${request}`);
    return { id: request, source: templateSource };
  };
}

function source(template: string, components?: Record<string, string>): Sikka {
  return new Sikka({ mode: 'source', resolver: templateFor(template, components) });
}

function wrap(artifact: PrecompileArtifact, componentUrl: (id: string) => string): string {
  const components = artifact.components.map((component, index) => ({
    ...component,
    render: `__component_${index}_render`,
    stream: `__component_${index}_stream`,
  }));
  const imports = components
    .map(
      ({ id, render, stream }) =>
        `import { render as ${render}, stream as ${stream} } from ${JSON.stringify(componentUrl(id))};`
    )
    .join('\n');
  const runtime = new URL('../src/runtime.ts', import.meta.url).href;
  return `import { runtime } from ${JSON.stringify(runtime)};
${imports}
export function render(props, slots = {}) {
  const { escape: __escape, classList: __classList, styleObject: __styleObject, filter: __filter, aggregateAssets: __aggregateAssets } = runtime(this);
  const __components = { ${components.map(({ localName, render }) => `${JSON.stringify(localName)}: ${render}`).join(', ')} };
${artifact.renderString}
}
export async function* stream(props, slots = {}) {
  const { escape: __escape, classList: __classList, styleObject: __styleObject, filter: __filter, aggregateAssets: __aggregateAssets } = runtime(this);
  const __components = { ${components.map(({ localName, stream }) => `${JSON.stringify(localName)}: ${stream}`).join(', ')} };
${artifact.streamString}
}`;
}

async function precompiled(template: string, components?: Record<string, string>): Promise<Sikka> {
  const artifacts = compile('page', { resolver: templateFor(template, components) });
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const urls = new Map<string, string>();
  const moduleUrl = (id: string): string => {
    const known = urls.get(id);
    if (known) return known;
    const artifact = byId.get(id);
    if (!artifact) throw new Error(`Missing artifact: ${id}`);
    const url = `data:text/javascript,${encodeURIComponent(wrap(artifact, moduleUrl))}`;
    urls.set(id, url);
    return url;
  };
  const module = await import(moduleUrl('page'));
  return new Sikka({ mode: 'precompiled', resolver: () => module });
}

function escaped(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

describe('Portable properties', () => {
  it('is deterministic and reports replay data', () => {
    const first = new PortableGenerator(PORTABLE_SEED);
    const second = new PortableGenerator(PORTABLE_SEED);
    expect(first.string().sample(first)).toBe(second.string().sample(second));
    expect(PORTABLE_RUNS).toBe(100);
    expect(() =>
      runPortableProperty('portable-failure', text, () => {
        throw new Error('broken');
      })
    ).toThrow(/portable-failure.*seed 0x53494b4b.*run 1.*input/);
  });

  it('portable-deterministic-render', async () => {
    const template = '<p>{Astro.props.value}</p>';
    const sourceSikka = source(template);
    const precompiledSikka = await precompiled(template);
    runPortableProperty('portable-deterministic-render', text, (value) => {
      const input = { value };
      const sourceHtml = sourceSikka.render('page', input);
      expect(sourceSikka.render('page', input)).toBe(sourceHtml);
      expect(precompiledSikka.render('page', input)).toBe(sourceHtml);
    });
  });

  it('portable-null-default-props', async () => {
    const template = '<p>static</p>';
    const sourceSikka = source(template);
    const precompiledSikka = await precompiled(template);
    runPortableProperty('portable-null-default-props', text, () => {
      const sourceHtml = sourceSikka.render('page');
      expect(sourceSikka.render('page', {})).toBe(sourceHtml);
      expect(precompiledSikka.render('page')).toBe(sourceHtml);
      expect(precompiledSikka.render('page', {})).toBe(sourceHtml);
    });
  });

  it('portable-frontmatter-equivalence', async () => {
    const body = '<p>{Astro.props.value}</p>';
    const plain = source(body);
    const fenced = source(`---\n---\n${body}`);
    const precompiledPlain = await precompiled(body);
    const precompiledFenced = await precompiled(`---\n---\n${body}`);
    runPortableProperty('portable-frontmatter-equivalence', text, (value) => {
      const input = { value };
      const html = plain.render('page', input);
      expect(fenced.render('page', input)).toBe(html);
      expect(precompiledPlain.render('page', input)).toBe(html);
      expect(precompiledFenced.render('page', input)).toBe(html);
    });
  });

  it('portable-escaping-list', async () => {
    const template =
      '<h1>{Astro.props.name}</h1><ul>{Astro.props.items.map((item) => <li>{item}</li>)}</ul>';
    const sourceSikka = source(template);
    const precompiledSikka = await precompiled(template);
    runPortableProperty('portable-escaping-list', props, (input) => {
      const expected = `<h1>${escaped(input.name)}</h1><ul>${input.items.map((item) => `<li>${escaped(item)}</li>`).join('')}</ul>`;
      expect(sourceSikka.render('page', input)).toBe(expected);
      expect(precompiledSikka.render('page', input)).toBe(expected);
    });
  });

  it('portable-component-isolation', async () => {
    const template =
      '---\nimport Item from "./item.astro";\n---\n<Item text={Astro.props.left} /><Item text={Astro.props.right} />';
    const components = { './item.astro': '<span>{Astro.props.text}</span>' };
    const sourceSikka = source(template, components);
    const precompiledSikka = await precompiled(template, components);
    const pairs = text.map((left) => ({ left, right: `${left}x` }));
    runPortableProperty('portable-component-isolation', pairs, (input) => {
      const expected = `<span>${escaped(input.left)}</span><span>${escaped(input.right)}</span>`;
      expect(sourceSikka.render('page', input)).toBe(expected);
      expect(precompiledSikka.render('page', input)).toBe(expected);
    });
  });
});
