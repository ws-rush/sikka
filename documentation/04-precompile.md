# Precompiling

The build-time API lives in the subpath export **`sikka/precompile`**: `compile`, `emitModule`, `PRECOMPILE_ABI_VERSION`, and related types. It is fully synchronous, never touches storage, and never evaluates generated source — a build host owns output paths and I/O.

## Pipeline

```
entry requests ──▶ compile() ──▶ PrecompileArtifact[] ──▶ emitModule() ──▶ ESM source (*.sikka.mjs)
```

At runtime the host imports those modules and serves them through `new Sikka({ mode: 'precompiled', resolver })`.

## `compile`

```ts
import { compile } from 'sikka/precompile';

const artifacts = compile(['home', 'about'], { resolver });
```

- `compile(entries: string | readonly string[], options: { resolver: SourceResolver }): PrecompileArtifact[]`
- Uses the same `SourceResolver` contract as source mode (`(request, importer?) => { id, source }`).
- Walks each entry plus its frontmatter-imported component graph, deduplicating by canonical `id`, and returns one artifact per identity.
- Throws `SikkaError` on: empty entries list, resolver failures, parse errors, compile errors, or circular component dependencies (message includes the cycle path).

### `PrecompileArtifact`

```ts
interface PrecompileArtifact {
  abiVersion: 3; // PRECOMPILE_ABI_VERSION
  id: string; // canonical template identity
  renderString: string; // function body for the sync render export
  streamString: string; // function body for the streaming export
  components: { localName: string; specifier: string; id: string }[]; // direct component edges
}
```

`renderString`/`streamString` are **function bodies, not modules** — pass the artifact to `emitModule` to get runnable ESM.

## `emitModule`

```ts
import { emitModule } from 'sikka/precompile';

const moduleSource = emitModule(artifact, {
  componentSpecifier: ({ id }) => outputSpecifierFor(id), // required when the artifact has components
  runtimeSpecifier: 'sikka/runtime', // optional override
});
```

- Throws if `abiVersion` mismatches, `runtimeSpecifier` is empty, or a `componentSpecifier` is missing for a component edge.
- Emits a module with **named `render` and `stream` exports** (no default export):

```ts
import { runtime } from 'sikka/runtime';
import { render as __component_0_render, stream as __component_0_stream } from './Card.sikka.mjs';

export function render(props, slots = {}) {
  const {
    escape,
    expression,
    RawHtml,
    classList,
    styleObject,
    filter,
    autoFilter,
    aggregateAssets,
  } = runtime(this);
  const __components = { Card: __component_0_render };
  /* renderString body */
}
export async function* stream(props, slots = {}) {
  const {
    escape,
    expression,
    RawHtml,
    classList,
    styleObject,
    filter,
    autoFilter,
    aggregateAssets,
  } = runtime(this);
  const __components = { Card: __component_0_stream };
  /* streamString body */
}
```

The sync body statically links each component's `render` export; the streaming body links its `stream` export. The conventional output filename is `*.sikka.mjs`.

## The runtime ABI: `sikka/runtime`

Emitted modules pull their helpers from `runtime(this)` (`src/runtime.ts`), where `this` is the invoking `Sikka` instance (or any receiver implementing `RuntimeReceiver`). This is the **generated-code ABI** (`RUNTIME_ABI_VERSION = 3`):

| Helper            | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `escape(v)`       | Escape for HTML (or plain stringify when `autoEscape: false`) |
| `expression(v)`   | Interpolation pipeline: filter (if `autoFilter`) then escape  |
| `RawHtml`         | Trusted verbatim-HTML wrapper                                 |
| `classList(v)`    | `class:list` merge (string/array/Set/object)                  |
| `styleObject(v)`  | `style` object → CSS string                                   |
| `filter(v)`       | The configured `filterFunction` (or identity)                 |
| `autoFilter`      | Whether filtering is active                                   |
| `aggregateAssets` | Whether to omit `<script>`/`<style>` output                   |
| `components`      | Component render functions for receiver-driven modules        |

Because options are read from the receiver at call time, one emitted artifact serves any runtime configuration — you never rebuild to change `autoEscape` or `filterFunction`. `bindRuntime` (internal) attaches one stable helper set per `Sikka` instance.

## Runtime options for generated modules

Options on the rendering `Sikka` instance apply: `autoEscape`, `autoFilter`, `filterFunction`, `aggregateAssets`, plus caching. `varName` does **not** apply — generated modules always bind `Astro`.

## Why precompile?

- **Strict CSP**: no `new Function` at runtime; generated code is ordinary ESM.
- **Cold starts**: no parse/compile at request time.
- **Auditability**: emitted modules are reviewable, diffable source files.

See [Getting Started](01-getting-started.md) for the runtime side.
