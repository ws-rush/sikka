# Public API

Everything here is exported from the package root `sikka`, except the precompile API (see [Precompiling](04-precompile.md)).

## Table of exports

| Export                                        | Kind      | Purpose                                    |
| --------------------------------------------- | --------- | ------------------------------------------ |
| `Sikka`                                       | class     | The runtime: render/stream templates       |
| `SikkaError`                                  | class     | Every public failure; carries a diagnostic |
| `Cache`                                       | interface | Custom cache contract                      |
| `SourceResolver`, `SourceTemplate`            | types     | Source-mode resolver contract              |
| `PrecompiledResolver`, `PrecompiledModule`    | types     | Precompiled-mode resolver contract         |
| `SourceModeOptions`, `PrecompiledModeOptions` | types     | Option bags for each mode                  |
| `SikkaDiagnostic`, `SikkaDiagnosticCategory`  | types     | Diagnostic shape                           |

## `Sikka`

```ts
const sikka = new Sikka(options: SourceModeOptions | PrecompiledModeOptions);
```

### Methods

| Method                                                  | Behavior                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `render(entry: string, props?): string`                 | Renders synchronously to a full HTML string.                                                                                      |
| `stream(entry: string, props?): AsyncGenerator<string>` | Streams HTML chunks incrementally. Yields the same total output as `render`.                                                      |
| `invalidate(id?: string): void`                         | With `id`: clears that template from both compile caches, the loaded-module maps, and the entry memo. Without: clears everything. |

### Constructor options (shared)

| Option            | Type                        | Default     | Notes                                                                                                                  |
| ----------------- | --------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `mode`            | `'source' \| 'precompiled'` | required    | Missing/invalid mode throws.                                                                                           |
| `resolver`        | function (required)         | —           | Must be synchronous. Shape depends on mode (below).                                                                    |
| `cache`           | `boolean \| Cache`          | `undefined` | `true` → internal cache; `false`/omitted → none (unless `cacheSize` set); a `Cache` object → use it as the sync cache. |
| `cacheSize`       | `number`                    | unlimited   | LRU capacity for the internal caches.                                                                                  |
| `autoEscape`      | `boolean`                   | `true`      | Escape interpolated values and attribute values. See [Security](05-security.md).                                       |
| `autoFilter`      | `boolean`                   | `false`     | Pass every interpolated value through `filterFunction` first.                                                          |
| `filterFunction`  | `(val: unknown) => unknown` | identity    | Used when `autoFilter` is on.                                                                                          |
| `aggregateAssets` | `boolean`                   | `false`     | Omit `<script>`/`<style>` tags from output (host aggregates them itself).                                              |
| `debug`           | `boolean`                   | `false`     | Wrap runtime failures in a `SikkaError` with template context.                                                         |

Source-mode-only:

| Option    | Type     | Default | Notes                                                            |
| --------- | -------- | ------- | ---------------------------------------------------------------- |
| `varName` | `string` | `Astro` | Name of the props variable in generated code (source mode only). |

### Caching behavior

- **Two caches**: sync and streaming compilations are cached separately. Passing a custom `Cache` object supplies only the sync cache; the stream cache follows `cache`/`cacheSize`.
- Cache keys are the resolver-returned canonical `id` (source mode) or entry key (precompiled mode: loaded modules and bound render functions are memoized per entry, plus a one-entry fast path for the last-rendered entry).
- The built-in cache is a Map-backed LRU: `get` promotes to most-recently-used; insertion past `cacheSize` evicts the least-recently-used entry.

## Source mode

```ts
new Sikka({
  mode: 'source',
  resolver: (request: string, importer?: string) => SourceTemplate,
  // ...shared options
});
```

`SourceTemplate`:

```ts
interface SourceTemplate {
  id: string; // canonical, non-empty identity — cache key & diagnostics
  source: string; // template source
}
```

The resolver throws on unknown requests; Sikka wraps the throw in a `Resolve` `SikkaError` with `request`/`importer` context.

Rendering flow per entry (uncached): resolve → parse → collect frontmatter component imports → recursively resolve and compile each component (cycle detection along the ancestor chain) → compile → cache by `id` → invoke.

⚠️ Source mode dynamically evaluates template source (`new Function`). Treat every template as trusted application code; it is not suitable for a strict CSP. Use [precompiled mode](04-precompile.md) for that.

## Precompiled mode

```ts
new Sikka({
  mode: 'precompiled',
  resolver: (entry: string) => PrecompiledModule,
  // ...shared options
});
```

`PrecompiledModule` is an already-imported generated module with named exports:

```ts
interface PrecompiledModule {
  render(props, slots?): string;
  stream(props, slots?): AsyncGenerator<string>;
}
```

Sikka does not import or evaluate anything here — the host loads modules ahead of time. Failures: a missing module, an invalid module ABI, a non-string `render` return, or a non-async-iterable `stream` return each raise a descriptive `SikkaError`/`Error`.

Runtime options (`autoEscape`, `autoFilter`, `filterFunction`, `aggregateAssets`) are honored by generated modules through the runtime helper binding — see [Precompiling](04-precompile.md).

## Cache interface

Supply your own cache via `cache: yourCache`:

```ts
interface Cache {
  get(key: string): RenderFunction | undefined;
  set(key: string, fn: RenderFunction): void;
  delete(key: string): void;
  clear(): void;
}
```

Useful for cache persistence across instances or cross-request memoization in a server.

## Diagnostics

All public failures are `SikkaError` instances (`src/error.ts`):

```ts
class SikkaError extends Error {
  name: string; // e.g. "ParseError" — derived from category
  category: 'Parse' | 'Resolve' | 'Compile' | 'Render';
  template?: string; // canonical template id
  request?: string; // unresolved request that failed
  importer?: string; // importing template id
  construct?: string; // rejected syntax construct, e.g. 'directive', 'Frontmatter import'
  cause?: unknown; // underlying error
}
```

Parse errors additionally carry `line` and `column` (available on the diagnostic before wrapping).

Guarantees:

- `category` is **stable API** — safe for programmatic handling.
- Human-readable `message` wording is **not** stable; don't match on it.
- Common failure categories:
  - `Parse` — malformed template (with line/column).
  - `Resolve` — resolver threw/returned garbage, or a circular component dependency.
  - `Compile` — unsupported constructs (non-`.astro` imports, frontmatter `await` in sync mode, invalid directive combinations).
  - `Render` — runtime failures inside generated code (with `debug: true`, wrapped with template context; precompiled ABI violations).
