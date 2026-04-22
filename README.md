# Sikka (سكّة)

> A vibecoded, zero-dependency, runtime-agnostic template engine with Astro-like syntax.

> [!WARNING]
> This project is currently under **heavy development**. APIs and internal behaviors are subject to significant changes as we optimize for performance and expand Astro syntax support.

## Features

- **Astro-like syntax**: Use familiar `.astro` components, frontmatter, and JSX-like template bodies.
- **Runtime-agnostic**: Works in Node.js, Bun, Deno, and the browser. No dependencies on Node.js built-ins.
- **Fast**: Templates are compiled once and cached for high performance.
- **Secure**: Automatic HTML escaping for all interpolated values to protect against XSS.
- **Component-driven**: Built-in support for component composition and slots.
- **Typed**: Written in TypeScript with full type support for props and slots.

## Installation

```bash
npm install sikka
```

## Quick Start

### Basic Rendering

Render a template string directly with props:

```javascript
import { Sikka } from 'sikka';

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

### Compiling and File Resolution

To load templates from the file system, provide `views`, `readFile`, and `resolvePath` in the options:

```javascript
import { Sikka } from 'sikka';
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
import { Sikka } from 'sikka';

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

## Performance

Sikka is built for extreme performance. In benchmarks like the "friends" test (nested loops, many attributes), it is currently the **fastest JavaScript template engine**, outperforming even Pug and Eta.

| Sikka           | "friends" Benchmark |
| :--------------- | :------------------ |
| **Sikka (Ours)** | **197ms**           |
| Pug              | 209ms               |
| Eta              | 214ms               |

_Results based on 2000 runs. Higher is slower._

It achieves this through:

- **Zero-allocation caching**: Large templates are compiled once and stored in a high-speed cache.
- **Compile-time static merging**: Adjacent static HTML parts and attributes are folded into single continuous strings.
- **Fast-path escaper**: Optimized HTML escaping using type-dispatching and regex-skipping.
- **Expression inlining**: JSX within loops is transformed into direct string concatenations to avoid function call overhead.

## Core Principles

- **Runtime-agnostic core**: No dependency on Node.js built-ins. File I/O and path resolution are injected via interfaces.
- **Security by default**: Every interpolated value is HTML-escaped automatically.
- **Compile-then-cache**: Templates are compiled once to a JavaScript closure and cached for subsequent renders.

## Syntax Features

- **Frontmatter**: Use `---` fences at the top of the file for component logic and imports. Supports `await` and types.
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

- `views`: Base directory for templates.
- `readFile`: Sync function to read file content from disk.
- `resolvePath`: Sync/Async function to resolve import paths.
- `varName`: Name of the global variable (default: `"Astro"`).
- `debug`: Enable runtime error debugging.
- `cache`: Enable template caching.
- `autoEscape`: Enable HTML escaping (default: `true`).
- `autoFilter`: Enable automatic value filtering.
- `filterFunction`: Custom filter for interpolated values.

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

## TypeScript: Global Components

Components registered via `sikka.loadComponent()` are available everywhere at runtime, but TypeScript doesn't know about them — you'll get `Cannot find name 'Card'` errors in `.astro` templates. Fix this by adding a declaration file:

```typescript
declare function Card(props: { title: string; description: string; href: string }): void;
```

Place this file anywhere in your project. TypeScript picks it up automatically. Add one `declare function` per globally-registered component with its expected props. This is purely a type hint — it has no effect on runtime behavior.

## License

MIT
