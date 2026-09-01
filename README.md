# Sikka (سكّة)

> A vibecoded, zero-dependency, runtime-agnostic template engine with Astro-like syntax.

> [!WARNING]
> This project is currently under **heavy development**. APIs and internal behaviors are subject to significant changes as we optimize for performance and expand Astro syntax support.

The [Sikka 1.0 Contract](docs/SIKKA_1.0_CONTRACT.md) defines the normative 1.0 target.

## Features

- **Astro-like syntax**: Use familiar `.astro` components, frontmatter, and JSX-like template bodies.
- **Runtime-agnostic**: Works in Node.js, Bun, Deno, and the browser. No dependencies on Node.js built-ins.
- **Fast**: Templates are compiled once and cached for high performance.
- **Secure**: Automatic HTML escaping for all interpolated values to protect against XSS.
- **Component-driven**: Built-in support for component composition and slots.
- **Typed**: Written in TypeScript with full type support for props and slots.

## Development

The project uses the latest TypeScript compiler, [oxlint](https://oxc.rs/docs/guide/usage/linter), and [oxfmt](https://oxc.rs/docs/guide/usage/formatter) for strict, fast validation:

```bash
nub install
nub run format
nub run lint
nub run fallow
nub run typecheck
nub run test
nub run test:coverage
```

Configuration lives in `.oxlintrc.json` and `.oxfmtrc.json`.

## Installation

```bash
deno add @rush/sikka
# or
nubx jsr add @rush/sikka
# or
nubx jsr add @rush/sikka
# or
bunx jsr add @rush/sikka
```

Import in your code:

```typescript
import { Sikka } from '@rush/sikka';
```

## Quick Start

### Basic Rendering

Render a template string directly with props:

```javascript
import { Sikka } from '@rush/sikka';

const sikka = new Sikka();

const template = `
---
const { name } = Astro.props;
---
<h1>Hello, {name}!</h1>
`;

const html = await sikka.renderString(template, { name: 'World' });
console.log(html); // <h1>Hello, World!</h1>
```

### Named Source Templates

Use explicit source mode to render a named Template through a synchronous resolver.
The resolver returns the Template source and its canonical identity, which Sikka uses
for caches and diagnostics.

```typescript
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

The resolver is synchronous. Frontmatter Component imports call it with the import
specifier and the importing Template's canonical identity, so the host owns all
Component resolution. Source mode uses no Components directory or global registration;
only actual Frontmatter imports compose Components. Its regular and Streaming
compilation caches are separate, use the canonical identity, and are both cleared
by `invalidate(id)` (or entirely by `invalidate()`). Hosts using asynchronous storage
must preload and cache Template source before calling `render` or `stream`; Sikka does
not own filesystem, path, or asynchronous loading behavior.

### Precompile Template graphs

Build tools can compile one or more named Template entries and their Frontmatter
Component graphs without constructing `Sikka` or performing output I/O. Each
canonical Template produces one versioned artifact. Its Component edges record
the local binding, source specifier, and target canonical identity; the host
owns ESM wrapping, static Component linking, and file writes.

```ts
import { compile } from 'sikka/precompile';

const artifacts = compile(['home', 'about'], { resolver });
// artifact.id, artifact.renderString, artifact.streamString, artifact.components
```

A wrapped module imports generated helpers from `sikka/runtime`, static-links
Component `render` and `stream` exports separately, calls `runtime(this)`, and
exposes named `render` and `stream` exports. The receiver supplies runtime
behavior; generated Templates do not evaluate source strings.

### Named Precompiled Templates

Load generated modules in the host, then resolve them synchronously by entry key.
Sikka never dynamically imports, compiles, or evaluates a precompiled Template;
the resolver must return an already-loaded module with named `render` and `stream`
exports.

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

The configured `Sikka` instance is the receiver for both exports, so generated
modules use its runtime behavior (`autoEscape`, filtering, and `aggregateAssets`)
instead of build-time configuration. Hosts that lazy-load artifacts do so before
adding them to their resolver.

### Compiling and File Resolution

To load templates from the file system, provide `views`, `readFile`, and `resolvePath` in the options:

```javascript
import { Sikka } from '@rush/sikka';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const sikka = new Sikka({
  views: path.join(process.cwd(), 'templates'),
  readFile: (p) => readFile(p, 'utf-8'),
  resolvePath: (base, specifier) => path.resolve(path.dirname(base), specifier),
});

const html = await sikka.render('index.astro', { title: 'Home' });
```

### Component System

You can register components globally using `loadComponent`:

```javascript
sikka.loadComponent('Header', '<header><h1>{Astro.props.title}</h1></header>');

const template = `
<Header title="My Website" />
<main><slot /></main>
`;

const html = await sikka.renderString(template);
```

## Streaming

For HTTP frameworks (Hono, Express, etc.), the engine supports streaming HTML to the client incrementally. Static content is flushed immediately, while component calls are awaited and yielded as single opaque chunks.

```javascript
import { Sikka } from '@rush/sikka';

const sikka = new Sikka();

// Stream a template string
const gen = sikka.streamString(template, { name: 'World' });
for await (const chunk of gen) {
  res.write(chunk); // Send each chunk to the client immediately
}

// Stream a template file
const gen = sikka.stream('page.astro', { title: 'Home' });
for await (const chunk of gen) {
  res.write(chunk);
}
```

Streaming supports:

- **Async frontmatter**: `await` expressions in frontmatter are fully supported
- **Static flushing**: Static HTML is yielded immediately without waiting for dynamic content
- **Component boundaries**: Component calls are awaited and yielded as single chunks
- **Independent caching**: Streaming functions are cached separately from sync functions
- **Shared compilation**: Sync and streaming rendering share AST emission logic, so syntax behavior remains aligned

## Testing

Tests use Node.js's built-in `node:test` runner, so no test framework runtime is required:

```bash
nub run test
nub run test:coverage
```

## Performance

Sikka includes a reproducible comparison suite for the precompiled render phase. It measures Sikka alongside EJS, Eta, Handlebars, LiquidJS, Pug, Dust.js, and igo-dust using identical static HTML, escaped interpolation, conditional-attribute, and nested-loop workloads.

```bash
npm ci --prefix benchmark
nub run build && nub run bench
```

The runner verifies that every engine produces identical HTML before timing it, prints each scenario in descending ops/sec order (with Tinybench's relative margin of error), and reports an overall score. The overall score is the geometric mean of an engine's speed relative to the fastest engine in each scenario, so workloads receive equal weight. It intentionally excludes compilation and file I/O; templates are precompiled once before measurement. Results are machine- and runtime-specific, so use the current local run rather than checked-in numbers when deciding on optimization work.

For quicker local feedback, reduce the duration while preserving the same workloads:

```bash
SIKKA_BENCH_TIME=200 SIKKA_BENCH_WARMUP_TIME=50 nub run bench
```

It achieves strong performance through:

- **Zero-allocation caching**: Large templates are compiled once and stored in a high-speed cache.
- **Compile-time static merging**: Adjacent static HTML parts and attributes are folded into single continuous strings.
- **Fast-path escaper**: Optimized HTML escaping using type-dispatching and regex-skipping.
- **Expression inlining**: JSX within loops is transformed into direct string concatenations to avoid function call overhead.

## Core Principles

- **Runtime-agnostic core**: No dependency on Node.js built-ins. File I/O and path resolution are injected via interfaces.
- **Security by default**: Every interpolated value is HTML-escaped automatically.
- **Compile-then-cache**: Templates are compiled once to a JavaScript closure and cached for subsequent renders.

## Syntax Features

- **Frontmatter**: Use `---` fences at the top of the file for light template setup only, such as prop destructuring, small constants, and `.astro` component imports.
- **JSX-like Body**: Standard HTML tags mixed with JavaScript expressions in curly braces `{...}`.
- **Component Composition**: Import `.astro` files in the frontmatter and use them as tags (e.g., `<MyComponent />`).
- **Slots**:
  - Default: `<slot />`
  - Named: `<slot name="header" />`
  - Fallback content: `<slot>Default content</slot>`
- **Conditional Rendering**: `{condition && <p>Visible</p>}` or `{condition ? <A /> : <B />}`.
- **Loops**: `{items.map(item => <li>{item}</li>)}`.
- **Special Tags**: `<script>` and `<style>` tags are preserved verbatim in the output.
- **`class:list`**: `<div class:list={['a', { b: true }]} />` → `<div class="a b" />`
- **`style` objects**: `<div style={{ color: 'red' }} />` → `<div style="color:red" />`
- **Auto Escaping**: Control how values are processed via `autoEscape` and `autoFilter` options.

## Public API Reference

### `new Sikka(options)`

Creates a configured engine instance.

#### `options`

- `mode: 'source'`: Render named source Templates through a synchronous `resolver`.
- `mode: 'precompiled'`: Render named already-loaded generated modules through a synchronous `resolver`.
- `views`: Base directory for legacy file templates.
- `readFile`: Sync function to read legacy file content from disk.
- `resolvePath`: Sync/Async function to resolve legacy import paths.
- `varName`: Name of the global variable (default: `"Astro"`).
- `debug`: Enable runtime error debugging.
- `cache`: Enable template caching, or provide a custom `Cache`.
- `cacheSize`: Bound the compilation cache with LRU eviction.
- `autoEscape`: Enable HTML escaping (default: `true`).
- `autoFilter`: Enable automatic value filtering.
- `filterFunction`: Custom filter for interpolated values.
- `aggregateAssets`: Omit `<script>` and `<style>` output.

### `sikka.renderString(template, props?): string`

Renders a template string and returns the HTML result.

### `sikka.render(name, props?): string`

Renders a template file from the `views` directory and returns the HTML result.

### `sikka.streamString(template, props?): AsyncGenerator<string>`

Streams a template string, yielding HTML chunks as they are produced. Static content is yielded immediately; component calls are awaited and yielded as single opaque chunks.

### `sikka.stream(name, props?): AsyncGenerator<string>`

Streams a template file from the `views` directory, yielding HTML chunks as they are produced.

### `sikka.compile(template, config?): RenderFunction`

Compiles a template string into a render function.

### `sikka.compileToString(template, config?): string`

Compiles a template string into its JavaScript source body.

### `sikka.loadComponent(name, template): void`

Registers a global component.

### `sikka.invalidate(key?): void`

Clears specific or all cache entries.

## Frontmatter Scope and Intended Usage

Sikka frontmatter is intentionally best treated as a **small template setup area**, not as a general application-logic layer.

Use frontmatter for:

- destructuring `Astro.props`
- defining small local constants
- simple conditional helpers
- importing other `.astro` components
- lightweight template-local preparation

Avoid using frontmatter for:

- heavy business logic
- data fetching orchestration
- database access
- large transformations or normalization pipelines
- application service wiring
- browser runtime behavior

### Important limitation: imports in frontmatter

In Sikka, frontmatter imports are intended for **`.astro` component composition**. Do not rely on frontmatter as a general-purpose module-loading system for arbitrary runtime logic.

Recommended rule of thumb:

- if the work prepares data for rendering, do it in your **controller / route handler / server function** and pass the result as props
- if the code must run in the **browser at runtime**, put it in a `<script>` tag
- if you need reusable UI composition, import another **`.astro` component**

Example:

```ts
// controller / route handler
const users = await userService.list();
const cards = users.map((user) => ({
  title: user.name,
  description: user.email,
  href: `/users/${user.id}`,
}));

const html = await sikka.render('users.astro', { cards });
```

```astro
---
const { cards } = Astro.props;
import Card from '../components/Card.astro';
---
{cards.map((card) => <Card {...card} />)}
```

For browser runtime imports or client-side behavior, use normal browser mechanisms inside `<script>` tags.

## TypeScript and Editor Tooling: Global Components

Components registered via `sikka.loadComponent()` are available everywhere at runtime, but editor tooling for `.astro` files may still report `Cannot find name 'Card'` (or similar) for component tags that are not explicitly imported.

This happens because `loadComponent()` is a runtime registration mechanism, while most `.astro` language tooling performs static analysis and usually only recognizes:

- components imported in frontmatter
- local variables in scope
- framework-specific built-in globals

A declaration file can still help plain TypeScript understand a global symbol:

```typescript
declare function Card(props: { title: string; description: string; href: string }): void;
```

However, some editors and `.astro` language servers will still flag `<Card />` in templates even when that declaration exists, because component-tag resolution is handled by the `.astro` tooling layer, not by plain TypeScript alone.

### Recommendation

If you want the best editor experience, explicitly import globally-registered components in templates as well:

```astro
---
import Card from '../components/Card.astro';
---
```

You can still keep `sikka.loadComponent('Card', template)` for runtime global registration. The import is mainly for static tooling and autocomplete.

## License

MIT
