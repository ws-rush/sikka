# astro-template-engine

> [!WARNING]
> This project is currently under **heavy development**. APIs and internal behaviors are subject to significant changes as we optimize for performance and expand Astro syntax support.

A vibecoded, zero-dependency JS template engine with an Astro-like template syntax. Parses `.astro` templates, compiles them to efficient JavaScript functions, and spits out clean HTML.

## Features

- **Astro-like syntax**: Use familiar `.astro` components, frontmatter, and JSX-like template bodies.
- **Runtime-agnostic**: Works in Node.js, Bun, Deno, and the browser. No dependencies on Node.js built-ins.
- **Fast**: Templates are compiled once and cached for high performance.
- **Secure**: Automatic HTML escaping for all interpolated values to protect against XSS.
- **Component-driven**: Built-in support for component composition and slots.
- **Typed**: Written in TypeScript with full type support for props and slots.

## Installation

```bash
npm install astro-template-engine
```

## Quick Start

### Basic Rendering

Render a template string directly with props:

```javascript
import { Engine } from 'astro-template-engine';

const engine = new Engine();

const template = `
---
const { name } = Astro.props;
---
<h1>Hello, {name}!</h1>
`;

const html = await engine.renderString(template, { name: 'World' });
console.log(html); // <h1>Hello, World!</h1>
```

### Compiling and File Resolution

To load templates from the file system, provide `views`, `readFile`, and `resolvePath` in the options:

```javascript
import { Engine } from 'astro-template-engine';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const engine = new Engine({
  views: path.join(process.cwd(), 'templates'),
  readFile: (p) => readFile(p, 'utf-8'),
  resolvePath: (base, specifier) => path.resolve(path.dirname(base), specifier),
});

const html = await engine.render('index.astro', { title: 'Home' });
```

### Component System

You can register components globally using `loadComponent`:

```javascript
engine.loadComponent('Header', '<header><h1>{Astro.props.title}</h1></header>');

const template = `
<Header title="My Website" />
<main><slot /></main>
`;

const html = await engine.renderString(template);
```

## Performance

`astro-template-engine` is built for extreme performance. In benchmarks like the "friends" test (nested loops, many attributes), it is currently the **fastest JavaScript template engine**, outperforming even Pug and Eta.

| Engine           | "friends" Benchmark |
| :--------------- | :------------------ |
| **Astro (Ours)** | **197ms**           |
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

### `new Engine(options)`

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

### `engine.renderString(template, props?): string`

Renders a template string and returns the HTML result.

### `engine.render(name, props?): string`

Renders a template file from the `views` directory and returns the HTML result.

### `engine.compile(template, config?): RenderFunction`

Compiles a template string into a render function.

### `engine.compileToString(template, config?): string`

Compiles a template string into its JavaScript source body.

### `engine.loadComponent(name, template): void`

Registers a global component.

### `engine.invalidate(key?): void`

Clears specific or all cache entries.

## TODO

- [ ] **Streaming Support**: Implementation of an asynchronous streaming API for large-scale data rendering.
