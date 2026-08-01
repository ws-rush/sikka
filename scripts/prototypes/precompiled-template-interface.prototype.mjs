/*
 * THROWAWAY PROTOTYPE — not production code or a Sikka API commitment.
 *
 * Question: can standalone compile() follow Frontmatter imports, return a complete
 * artifact graph without output I/O, and let a build tool write strict-CSP modules?
 * Run: node scripts/prototypes/precompiled-template-interface.prototype.mjs
 */

const templateSource = `---
import Card from '../ui/Card.astro';
const { name } = Astro.props;
---
<main><h1>{name}</h1><Card /> </main>`;

const rawRenderString = `let __out = '';
const Astro = { props, slots };
const { name } = Astro.props;
__out += '<main><h1>';
__out += __escape(name);
__out += '</h1>';
__out += __components.Card.call(this, {}, {});
__out += '</main>';
return __out;`;

const artifactGraph = `const artifacts = await compile(['views/Home.astro'], {
  read(id) {
    // Build-tool-owned Template loading.
  },
  resolve(specifier, importer) {
    // '../ui/Card.astro' from 'views/Home.astro' → 'ui/Card.astro'
  },
});

// compile() returns no files and performs no output I/O.
// It follows every Frontmatter Component import recursively.
// artifacts contains one entry for Home and one for Card.`;

const artifact = `{
  id: 'views/Home.astro',
  renderString: ${JSON.stringify(rawRenderString)},
  streamString: '/* distinct generated Streaming render body */',
  components: [{ localName: 'Card', id: 'ui/Card.astro' }],
}`;

const buildToolStep = `for (const artifact of artifacts) {
  const outputId = artifact.id.replace(/\\.astro$/, '.sikka.mjs');
  const moduleSource = wrapSikkaRenderStrings(artifact, {
    outputId,
    outputFor: (id) => id.replace(/\\.astro$/, '.sikka.mjs'),
  });
  await host.write(outputId, moduleSource);
}`;

const generatedByBuildTool = `// views/Home.sikka.mjs
// The build tool generated this wrapper from the Home artifact.
import { render as renderCard } from '../ui/Card.sikka.mjs';
import { escapeHtml } from 'sikka/runtime';

const __components = { Card: renderCard };

export function render(props, slots = {}) {
  const config = this.config;
  const __escape = config.autoEscape === false ? String : escapeHtml;

  ${rawRenderString.replaceAll('\n', '\n  ')}
}

export async function* stream(props, slots = {}) {
  // The wrapper places artifact.streamString here.
  // It uses the same Sikka receiver and yields equivalent Rendered HTML.
}`;

const applicationUse = `import { Sikka } from 'sikka/runtime';
import { render, stream } from './views/Home.sikka.mjs';

const sikka = new Sikka({ autoEscape: true });

render.call(sikka, { name: 'Ada & <Lin>' });
// '<main><h1>Ada &amp; &lt;Lin&gt;</h1>...</main>'

for await (const chunk of stream.call(sikka, { name: 'Ada' })) {
  send(chunk);
}`;

console.log(`
THROWAWAY PROTOTYPE: standalone artifact compiler and build-tool output

State
  Entry Template:          views/Home.astro
  Discovered Component:    ui/Card.astro (from its import; no components directory)
  Compiler I/O:            injected read and resolve only
  Compiler result:         artifacts with raw renderString, streamString, and Component edges
  Output I/O:              build tool only
  Output paths:            views/Home.sikka.mjs and ui/Card.sikka.mjs
  Module exports:          named render and stream functions; no default export
  Standard invocation:     render.call(sikka, props) and stream.call(sikka, props)
  CSP:                     static ESM only; no eval or Function constructor

0. Entry Template source
${templateSource}

1. Standalone compiler use
${artifactGraph}

2. An artifact returned by compile()
${artifact}

3. Build-tool file emission
${buildToolStep}

4. Generated module written by the build tool
${generatedByBuildTool}

5. Application use
${applicationUse}

Confirmed direction
  compile() follows Frontmatter Component imports from the supplied entry Templates.
  It returns artifacts but never writes files. A build tool turns every artifact into
  its matching .sikka.mjs file. The Sikka runtime receives either source Templates
  or generated modules according to its mode; only generated modules run under
  strict CSP.
`);
