# Sikka (سكّة)

Sikka is a zero-dependency Template engine. [The syntax guide](documentation/02-syntax.md) is a concise, self-contained guide.

## Install

```bash
npm install sikka
```

## Render Template source

Choose `source` explicitly. Its synchronous resolver owns storage, paths, and canonical Template identities. It receives an entry request or a Frontmatter Component specifier plus the importing identity.

```ts
import { Sikka } from 'sikka';

const templates = new Map([
  [
    'home',
    {
      id: 'pages/home.sikka',
      source: '---\nimport Card from "./Card.sikka";\n---\n<Card title={Sikka.props.title} />',
    },
  ],
  ['./Card.sikka', { id: 'components/Card.sikka', source: '<h1>{Sikka.props.title}</h1>' }],
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
for await (const chunk of sikka.stream('home', { title: 'Hello' })) {
  // write(chunk)
}
```

Components come only from non-type `.sikka` imports in Frontmatter. Source regular and Streaming compilation caches are separate and use the canonical `id`; `invalidate(id)` clears both for that identity and `invalidate()` clears both caches. `cache: true`, `cache: false`, `cacheSize`, or a custom `Cache` control caching.

Source mode dynamically evaluates Template source. Treat every Template as trusted application code; it is not suitable for a strict Content Security Policy.

## Precompile Template graphs

`compile` is the standalone synchronous build API, exported only from `sikka/precompile`. It follows the same resolver contract, returns one artifact per canonical identity, and never writes files or evaluates generated source.

```ts
import { compile, emitModule } from 'sikka/precompile';

const artifacts = compile(['home', 'about'], { resolver });
const moduleSource = emitModule(artifacts[0], {
  componentSpecifier: ({ id }) => outputSpecifierFor(id),
});
```

An artifact's `components` are its direct Frontmatter edges: `{ localName, specifier, id }`. `emitModule` owns ESM wrapping, runtime-helper binding, and static Component links. A build tool supplies `componentSpecifier` to map each edge to its generated module, and may override `runtimeSpecifier` from its default of `sikka/runtime`. The build tool still owns output paths and I/O; the conventional emitted filename is `*.sikka.mjs`.

The emitted module has named `render` and `stream` exports and no default export. It statically links Component `render` exports into the regular body and `stream` exports into the Streaming body. `sikka/runtime` remains the generated-code ABI, while `emitModule` keeps its helper wiring inside Sikka.

## Render precompiled Templates

Load generated modules before rendering. In `precompiled` mode the synchronous resolver returns an already-loaded module; Sikka does not import, compile, or evaluate it. Precompiled rendering performs no string evaluation and is the strict-CSP path.

```ts
const modules = new Map([['home', await import('./generated/home.sikka.mjs')]]);
const sikka = new Sikka({
  mode: 'precompiled',
  resolver(entry) {
    const module = modules.get(entry);
    if (!module) throw new Error(`Unknown loaded Template ${entry}`);
    return module;
  },
});

sikka.render('home', { title: 'Hello' });
```

Runtime options belong to the invoking `Sikka` instance in either mode: `autoEscape` (default `true`), `autoFilter`, `filterFunction`, `aggregateAssets`, `cache`, `cacheSize`, and `debug`. `varName` (default `Sikka`) renames the props variable during source-mode compilation only; generated modules always bind `Sikka`.

## Escaping and trust

With default escaping, interpolated values, HTML attribute values, and `set:text` values are escaped. `set:html`, including `{...{ 'set:html': value }}`, inserts verbatim HTML; it is not sanitization. `is:raw` emits its child Template source verbatim rather than evaluating it. `autoEscape: false` disables automatic escaping globally. `RawHtml` is a generated-runtime helper for trusted verbatim values, not an application rendering API.

Only use `set:html`, `RawHtml`, `autoEscape: false`, and trusted Template source with content your application has decided to trust. Sikka does not sanitize data or make that decision for you.

## Streaming and diagnostics

Streaming produces the same Rendered HTML as regular rendering except that awaited Frontmatter is Streaming-only; regular `render` rejects it. Pending source content flushes before each Component, which renders in source order. Other chunk boundaries are not Stable.

Public failures are `SikkaError` instances. Their stable `category` is `Parse`, `Resolve`, `Compile`, or `Render`; context can include `template`, `request`, `importer`, `construct`, `cause`, and parse `line`/`column`. Message wording is not Stable.

## Release evidence

Node.js 24 and bundled Chromium are release-evidence targets only, not runtime or version support promises. This project makes no security-response or service-level commitment.

## Development

```bash
nub install
nub run format && nub run lint && nub run fallow && nub run typecheck && nub run test && nub run test:coverage
```

## License

MIT
