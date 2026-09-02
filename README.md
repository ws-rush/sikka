# Sikka (سكّة)

A zero-dependency, runtime-agnostic Template engine with Astro-like syntax.
The [Sikka 1.0 Contract](docs/SIKKA_1.0_CONTRACT.md) is the normative API and
syntax reference.

## Installation

```bash
deno add @rush/sikka
# or
bunx jsr add @rush/sikka
```

## Render source Templates

Sikka requires an explicit mode. In `source` mode, the host synchronously
resolves every entry and Frontmatter Component request to its canonical Template
identity and source. The resolver owns any storage and path resolution.

```ts
import { Sikka } from 'sikka';

const templates = new Map([['home', '<h1>{Astro.props.title}</h1>']]);

const sikka = new Sikka({
  mode: 'source',
  resolver(request) {
    const source = templates.get(request);
    if (source === undefined) throw new Error(`Unknown Template: ${request}`);
    return { id: `templates/${request}.astro`, source };
  },
});

const html = sikka.render('home', { title: 'Hello' });
for await (const chunk of sikka.stream('home', { title: 'Hello' })) {
  // write chunk
}
```

Components are discovered only through `.astro` imports in Frontmatter. The
resolver receives the import specifier and importing canonical identity.
Source Render and Streaming compilation caches are separate and use canonical
identities; `invalidate(id)` clears both, while `invalidate()` clears all.
`cache`, `cacheSize`, and custom `Cache` configuration are supported.

## Precompile Template graphs

Build tools compile source graphs without evaluating generated source or writing
files. `compile` is exported only from `sikka/precompile`.

```ts
import { compile } from 'sikka/precompile';

const artifacts = compile(['home', 'about'], { resolver });
// artifact.id, artifact.renderString, artifact.streamString, artifact.components
```

Each artifact records its canonical identity and direct Component edges. The
host owns output paths, ESM module wrapping, static Component linking, and I/O.
Generated modules conventionally use a `*.sikka.mjs` suffix and export named
`render` and `stream` functions.

## Render precompiled Templates

Load generated modules before Sikka invokes the resolver. Sikka does not import,
compile, or evaluate them.

```ts
const modules = new Map([['home', await import('./generated/home.sikka.mjs')]]);
const sikka = new Sikka({
  mode: 'precompiled',
  resolver(entry) {
    const module = modules.get(entry);
    if (!module) throw new Error(`Unknown loaded Template: ${entry}`);
    return module;
  },
});

const html = sikka.render('home', { title: 'Hello' });
for await (const chunk of sikka.stream('home', { title: 'Hello' })) {
  // write chunk
}
```

Precompiled modules receive runtime configuration from the Sikka instance that
calls them. `sikka/runtime` exports the generated-code ABI helpers; it is not an
application rendering API.

## Streaming

Streaming preserves regular Rendered HTML except for awaited Frontmatter, which
is supported only by `stream`. Pending source content flushes before each
Component boundary and Components stream in source order. Other chunk boundaries
are unspecified.

## Development

```bash
nub install
nub run format
nub run lint
nub run fallow
nub run typecheck
nub run test
nub run test:coverage
```

## License

MIT
