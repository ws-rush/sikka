# AGENTS.md

use /ponytail always

## Issue Tracker

use github as issues tracker.

## Project

Sikka (سكّة) is a zero-dependency, runtime-agnostic, Astro-like template engine: template source → parser → AST → compiler → cached render function → HTML. Streaming follows the same syntax and rendering semantics, yielding HTML incrementally. Use the terms in [`docs/UBIQUITOUS_LANGUAGE.md`](docs/UBIQUITOUS_LANGUAGE.md).

## Source map

| Area                                                        | Location                        |
| ----------------------------------------------------------- | ------------------------------- |
| Public API, loading, component registry, sync/stream caches | `src/index.ts`                  |
| AST contracts and compiler results                          | `src/types.ts`                  |
| Astro-syntax parser                                         | `src/parser.ts`                 |
| Sync and streaming code generation                          | `src/compiler.ts`               |
| LRU cache and HTML escaping / trusted `RawHtml`             | `src/cache.ts`, `src/escape.ts` |
| Public API, syntax, errors, and property tests              | `test/`                         |

## Invariants

- Keep the core runtime-agnostic: inject file I/O and path resolution; do not add Node built-ins to `src/`.
- Escape every interpolated value unless `autoEscape: false`; only trusted `RawHtml` and `set:html` render verbatim.
- `Astro` exposes props and slots. Keep frontmatter limited to template setup and `.astro` component composition; browser behavior belongs in `<script>`.
- A syntax/AST change updates `src/types.ts`, `src/parser.ts`, `src/compiler.ts`, and focused tests. Preserve sync/stream parity; streaming must flush static content and await/yield component boundaries.
- Keep render hot paths tight: precompute and merge static output at compile time, favor fast paths, and avoid allocations or complex work in loops.

## Validation

After code changes, run:

```bash
nub run format && nub run lint && nub run fallow && nub run typecheck && nub run test && nub run test:coverage
```

Update `README.md` for user-visible behavior and this file when agent guidance changes. For render-performance work, verify equivalent output and benchmark with `nub run build && nub run bench`.
