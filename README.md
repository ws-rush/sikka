# astro-template-engine

A runtime-agnostic, Astro-like template engine for rendering HTML. It parses `.astro` syntax, compiles templates to efficient JavaScript functions, and produces clean HTML.

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

## Syntax Features

- **class:list**: `<div class:list={['a', { b: true }]} />` → `<div class="a b" />`
- **style object**: `<div style={{ color: 'red' }} />` → `<div style="color:red" />`
- **Slots fallback**: `<slot>Default content</slot>`
- **Custom varName**: `new Engine({ varName: 'data' })` allows using `data.props` instead of `Astro.props`.
- **Auto Escaping & Filtering**: Control how values are processed via `autoEscape`, `autoFilter`, and `filterFunction`.

## Public API Reference

### `new Engine(options)`

Creates a configured engine instance.

#### `options`

- `views`: Base directory for templates.
- `readFile`: Async function to read file content.
- `resolvePath`: Function to resolve import paths.
- `varName`: Name of the global variable (default: `"Astro"`).
- `debug`: Enable runtime error debugging.
- `cache`: Enable template caching.
- `autoEscape`: Enable HTML escaping (default: `true`).
- `autoFilter`: Enable automatic value filtering.
- `filterFunction`: Custom filter for interpolated values.

### `engine.renderString(template, props?): Promise<string>`

Renders a template string and returns the HTML result.

### `engine.render(name, props?): Promise<string>`

Renders a template file from the `views` directory and returns the HTML result.

### `engine.loadComponent(name, template): void`

Registers a global component.

### `engine.invalidate(key?): void`

Clears specific or all cache entries.

### `html` (Tagged Template Literal)

Marks content as trusted and performs escaping on interpolated values. Returns a `RawHtml` instance.

### `escapeHtml(value): string`

Escapes a value for safe insertion into HTML. Handles strings, numbers, booleans, and `RawHtml`.

### `RawHtml` (Class)

A wrapper for pre-rendered or trusted HTML that should skip escaping.
