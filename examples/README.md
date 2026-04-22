# Sikka Examples

Complete examples showing how to integrate [Sikka](https://github.com/ws-rush/sikka) with different web frameworks.

## Getting Started

```bash
# From this directory
npm install

# Run with Express
npm start:express

# Run with Hono
npm start:hono
```

Open [http://localhost:3000](http://localhost:3000).

## What It Demonstrates

| Route         | Feature                                                                                |
| ------------- | -------------------------------------------------------------------------------------- |
| `GET /`       | File-based rendering with `sikka.render()` — Layout & Header imported via frontmatter |
| `GET /about`  | Global component via `sikka.loadComponent()` — Card component                         |
| `GET /users`  | Dynamic data with loops — rendering a list of Cards from props                         |
| `GET /todos`  | Full CRUD with HTML forms and method override (`_method` hidden field)                 |
| `GET /stream` | Streaming response with `sikka.streamString()` — chunks flushed incrementally         |

## Features Used

- **Frontmatter imports**: frontmatter is meant for light setup and `.astro` component imports such as `Layout.astro` and `Header.astro`
- **Global components**: `Card.astro` is registered via `sikka.loadComponent()` at runtime
- **Editor tooling caveat**: some `.astro` editors/language servers may still require `import Card from '../components/Card.astro'` for error-free static analysis, even though the runtime global registration works
- **Slots**: Default slot in Layout, named slot (`actions`) in Header
- **Props**: All components accept and render props
- **Loops**: Dynamic lists with `.map()` in templates
- **Streaming**: Async generator yielding HTML chunks
- **Method override**: `_method` hidden field pattern for PUT/DELETE from HTML forms
- **`class:list`**: Conditional CSS classes on todo items

## Project Structure

```
examples/
├── express.ts           # Express entrypoint
├── hono.ts              # Hono entrypoint
├── data.ts              # Shared data store (todos, users, team)
├── views/               # Page templates (loaded via sikka.render)
│   ├── index.astro
│   ├── about.astro
│   ├── users.astro
│   └── todos.astro
├── components/          # Reusable components
│   ├── Layout.astro     # HTML shell with default slot
│   ├── Header.astro     # Nav with named slot
│   └── Card.astro       # Card component (registered globally)
├── public/              # Static assets
│   └── styles.css
└── package.json
```

## Controller / Template Split

In these examples, the framework entrypoints act as the controller layer:

- fetch or prepare data
- normalize it into render-friendly props
- call `sikka.render()` / `sikka.streamString()`

The `.astro` templates are intended to stay presentation-focused:

- destructure props
- import `.astro` components
- map and conditionally render markup

Avoid putting heavy processing in frontmatter. If work belongs to the server, do it in the entrypoint and pass the result as props. If work belongs to the browser at runtime, use `<script>` tags in the template.

## Framework Entrypoints

Each framework entrypoint (`express.ts`, `hono.ts`) wires up the same shared templates, components, and data to its respective server framework. The Sikka-specific code is identical across all entrypoints — only the HTTP routing and response handling differs.
