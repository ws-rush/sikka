# Getting Started

## Install

```bash
npm install sikka
```

Sikka has zero dependencies and no Node built-ins — it works in any JavaScript runtime (Node, Deno, browsers, workers, edge runtimes).

## Core idea

You own storage and path resolution; Sikka owns parsing, compiling, caching, and rendering. You hand Sikka a synchronous **resolver** that maps a template request to `{ id, source }` (source mode) or to an already-loaded module (precompiled mode).

## First render (source mode)

```ts
import { Sikka } from 'sikka';

const templates = new Map([
  [
    'home',
    {
      id: 'pages/home.astro',
      source: '---\nimport Card from "./Card.astro";\n---\n<Card title={Astro.props.title} />',
    },
  ],
  ['./Card.astro', { id: 'components/Card.astro', source: '<h1>{Astro.props.title}</h1>' }],
]);

const sikka = new Sikka({
  mode: 'source',
  resolver(request, importer) {
    const template = templates.get(request);
    if (!template) throw new Error(`Unknown Template ${request} from ${importer ?? 'entry'}`);
    return template;
  },
});

const html = sikka.render('home', { title: 'Hello' });
// <h1>Hello</h1>
```

Notes:

- The resolver is called with `(request, importer)` — `importer` is the canonical id of the template containing a frontmatter `import`, or `undefined` for the entry. Use it to resolve relative specifiers.
- Components come **only** from non-type `.astro` imports in frontmatter.
- Every template must return a stable, non-empty canonical `id`. Caching, cycle detection, and invalidation key off it.

## Streaming

```ts
for await (const chunk of sikka.stream('home', { title: 'Hello' })) {
  response.write(chunk);
}
```

Streaming yields the same HTML as `render`, incrementally:

- Static content is buffered and flushed before each component boundary.
- Components render in source order.
- All other chunk boundaries are unspecified — consume the whole stream, don't parse individual chunks.
- Frontmatter `await` is supported **only** in streaming renders; `render()` rejects it.

## A minimal template

```astro
---
const items = Astro.props.items ?? [];
---

<h1 class={Astro.props.title ? 'big' : 'small'}>Hello</h1>
<ul>
  {items.map((item) => <li>{item}</li>)}
</ul>
<slot name="footer">fallback content</slot>
```

See the [Template Syntax reference](02-syntax.md) for everything the parser supports.

## Choosing a mode

| Need                                   | Mode          | Why                                                        |
| -------------------------------------- | ------------- | ---------------------------------------------------------- |
| Dynamic templates, tooling, simplicity | `source`      | Compiles template strings on demand, uses in-memory caches |
| Strict Content-Security-Policy         | `precompiled` | Emits static ESM at build time; no runtime code evaluation |
| Fast cold starts in production         | `precompiled` | No parse/compile at request time                           |

## Next steps

- [Template Syntax](02-syntax.md) — the full syntax reference
- [Public API](03-api.md) — options, caching, invalidation, error handling
- [Precompiling](04-precompile.md) — the build-time API
- [Security](05-security.md) — escaping and trusted content rules
