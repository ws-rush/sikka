# Sikka 1.0 Contract

This is the single normative contract for Sikka 1.0. It defines the 1.0 target;
it does not declare the current prerelease API stable.

## Scope and compatibility

Sikka 1.0 is the npm package `sikka`, a Template engine for JavaScript and
TypeScript server-rendered websites. The Stable API is the application API,
`precompile` API, generated-runtime ABI, public types, and Syntax Contract in
this document. Semantic versioning applies to them after 1.0.

Sikka supports only the self-contained subset classified here. It is
Astro-aligned only where this contract says so; future Astro behavior does not
enter Sikka automatically.

## Stable application API

Applications import `Sikka` from `sikka` and choose one explicit mode:

- `source`: `resolver(request, importer?)` synchronously returns `{ id, source
}`. `id` is the canonical Template identity used for components, caches, and
  diagnostics. Hosts with asynchronous storage preload source before rendering.
- `precompiled`: `resolver(entry)` synchronously returns an already-loaded
  generated module. Sikka does not dynamically import modules; host-owned lazy
  loading finishes before resolver invocation.

Both modes expose `render(entry, props)` for a synchronous Render and
`stream(entry, props)` for a Streaming render. Components are discovered only
from Frontmatter imports. Global Component registration and instance
compilation are not part of the Stable API.

Source mode dynamically compiles Template source and is not the strict-CSP
path. Precompiled modules receive runtime configuration from the `Sikka`
instance that invokes them.

## Stable precompile API

`compile(entries, { resolver })` is the sole public build API and is exported
from `sikka/precompile`. It is synchronous, follows Frontmatter Component
imports recursively, and never writes output files. Its resolver uses the same
`(request, importer?) -> { id, source }` contract as source mode.

Each returned artifact has its canonical `id`, distinct raw `renderString` and
`streamString` bodies, and Component edges (`localName` and canonical target
`id`). Build tools own output paths, module wrapping, import-specifier
rewriting, and all output I/O. The conventional emitted suffix is
`*.sikka.mjs`.

## Generated-runtime ABI

A generated module has named `render` and `stream` exports and no default
export. It statically imports Component artifacts and shared helpers only from
`sikka/runtime`; that public subpath is the versioned generated-code helper
ABI. Generated functions run with the invoking `Sikka` instance as `this`.

`stream` has a distinct async-generator body. It preserves source order,
flushes static HTML, awaits and yields Component boundaries, and produces the
same final Rendered HTML as `render`. Precompiled rendering performs no string
evaluation and is the strict-CSP path.

## Syntax Contract classifications

Every documented construct has exactly one classification:

- **Supported**: its documented Rendered HTML and applicable Streaming behavior
  are Stable.
- **Intentionally rejected**: it fails with a diagnostic category and useful
  context.
- **Explicitly unsupported**: it is outside Sikka's contract and has no
  compatibility promise.

Diagnostic categories and relevant construct or canonical Template identity are
Stable. Exact diagnostic message wording is not Stable API.

## Portable Syntax Contract cases

The portable corpus is the semantic oracle used by source and precompiled
runners. Its case data and assertion helpers use only runtime-neutral
JavaScript values; no case depends on Node APIs.

Every case requires:

| Field          | Contract                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`           | A non-empty lowercase hyphenated stable ID, unique in the manifest.                                                            |
| `template`     | Template source.                                                                                                               |
| `props`        | JSON-compatible Props.                                                                                                         |
| `expectedHtml` | Exact expected Rendered HTML.                                                                                                  |
| `modes`        | A non-empty, duplicate-free list of applicable `source` and/or `precompiled` modes.                                            |
| `streaming`    | Omitted when no Streaming behavior is contractual; `same-html` requires final Streaming Rendered HTML to equal `expectedHtml`. |

Invalid metadata or duplicate IDs invalidate the manifest. The initial sentinel
is `ada-escaping-and-list`: it escapes Ada's Props and renders ordered list
items. Source regular and Streaming renders must both equal its exact expected
Rendered HTML.

## Release evidence policy

Node.js 24 and Playwright Chromium are release-evidence targets, not Supported
Runtime or runtime-version promises. A release candidate must execute the
portable corpus against the exact candidate in the selected Node target and
applicable precompiled service-worker target. This evidence does not imply
support for other runtimes, future Astro behavior, or a security-response SLA.
