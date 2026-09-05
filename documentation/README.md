# Sikka Documentation

Sikka (سكّة) is a zero-dependency, runtime-agnostic, Astro-like template engine:

```
template source → parser → AST → compiler → cached render function → HTML
```

Streaming follows the same syntax and rendering semantics, yielding HTML incrementally.

## Contents

| Document                                       | Contents                                                       |
| ---------------------------------------------- | -------------------------------------------------------------- |
| [Getting Started](01-getting-started.md)       | Install, first render, streaming, next steps                   |
| [Template Syntax](02-syntax.md)                | The full `.astro`-like syntax reference                        |
| [Public API](03-api.md)                        | `Sikka` class, options, caching, invalidation, diagnostics     |
| [Precompiling](04-precompile.md)               | The build-time API: `sikka/precompile`, artifacts, emitted ESM |
| [Security: Escaping & Trust](05-security.md)   | Auto-escaping, `RawHtml`, `set:html`, CSP guidance             |
| [Integrations](06-integrations.md)             | The resolver contract; Express and Hono recipes; streaming     |
| [Errors & Troubleshooting](07-errors.md)       | Every error message, what it means, how to fix it              |
| [Migrating from Astro or Eta](08-migrating.md) | What maps 1:1, what differs, what's intentionally absent       |

## The two modes at a glance

- **Source mode** — Sikka compiles template strings at render time. Simple, dynamic, but evaluates code (no strict CSP).
- **Precompiled mode** — a build step emits static ESM modules (`sikka/precompile`), the host loads them, and Sikka only calls their `render`/`stream` exports. No string evaluation; the strict-CSP path.

Both modes use an injected, synchronous **resolver** — Sikka never touches the filesystem or any Node built-in. It runs anywhere JavaScript does.
