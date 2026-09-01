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
path. Source regular and Streaming compilation caches are separate and keyed by
canonical identity. `invalidate(id)` removes both entries and `invalidate()`
clears both caches. `cache: true`, `cache: false`, `cacheSize`, and a supplied
`Cache` retain their usual behavior. Precompiled modules receive runtime
configuration from the `Sikka` instance that invokes them.

## Stable precompile API

`compile(entries, { resolver })` is the sole public build API and is exported
from `sikka/precompile`. It is synchronous, accepts one entry request or a
non-empty list, follows Frontmatter Component imports through the same
`(request, importer?) -> { id, source }` contract as source mode, and never
writes output files or evaluates generated source.

It returns one versioned `PrecompileArtifact` for each canonical Template
identity. Each artifact has its canonical `id`, distinct raw `renderString` and
`streamString` bodies, and direct Frontmatter Component edges (`localName`,
source `specifier`, and target canonical `id`). Build tools own output paths,
module wrapping, import-specifier rewriting, and all output I/O. Regular bodies
call statically linked Component `render` exports; Streaming bodies delegate to
Component `stream` exports. Missing requests, invalid canonical identities, and
cycles fail with graph diagnostics that include the relevant request and
canonical identities. The conventional emitted suffix is `*.sikka.mjs`.

## Generated-runtime ABI

`sikka/runtime` is the versioned generated-code helper ABI. It exports
`RUNTIME_ABI_VERSION` and `runtime(receiver)`. A static generated module imports
only `runtime` from this subpath, calls it with `this`, and binds its returned
`escape`, `RawHtml`, `components`, `classList`, `styleObject`, `filter`, and
`aggregateAssets` helpers before running an artifact body. Thus regular and
Streaming exports receive behavior from their invoking `Sikka` receiver without
rebuilding an artifact.

A generated module has named `render` and `stream` exports and no default
export. `stream` uses its distinct async-generator body. Precompiled rendering
performs no string evaluation and is the strict-CSP path.

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

## HTML attributes

For native HTML tags, `null` and `undefined` omit an attribute. Empty strings
emit the valueless form (`<input disabled>`). Standard boolean attributes are
present only for truthy values; other attributes stringify values, including
`false` and `0`, then escape them unless `autoEscape: false` is set. The standard
boolean set is `allowfullscreen`, `async`, `autofocus`, `autoplay`, `checked`,
`controls`, `default`, `defer`, `disabled`, `formnovalidate`, `hidden`, `inert`,
`ismap`, `itemscope`, `loop`, `multiple`, `muted`, `nomodule`, `novalidate`,
`open`, `playsinline`, `readonly`, `required`, `reversed`, and `selected`.

A hyphenated custom element is an HTML tag, but does not apply native boolean
rules: boolean-looking values stringify. Direct attributes and spread objects
evaluate left-to-right. Later ordinary keys replace earlier ones, while a later
nullish ordinary value removes the key.

`class`, `className`, and direct or spread `class:list` values merge in source
evaluation order into one escaped `class` attribute. `class:list` recursively
flattens arrays and Sets, includes strings and truthy object keys, omits falsy
values, and retains duplicate tokens. No class attribute emits when the combined
value is empty.

`style` strings and objects merge in source order into one `style` attribute,
separated by one semicolon. Object keys use kebab-case except CSS custom
properties, which are unchanged. String and numeric values, including `0`, are
retained; nullish, boolean, and empty-string values are omitted. An object with
a custom `toString` uses that string as its complete style value. The merged
value follows `autoEscape`. Both rules apply equally to direct and spread values,
regular and Streaming renders, source Templates, and Precompiled Templates.

## Template structure and Astro global

The following Template structure is **Supported**:

- A Template has an optional opening Frontmatter fence (`---` on its own line)
  followed by a root body. A body-only Template and empty Frontmatter are both
  valid. Closing-fence and body whitespace is preserved except for the single
  newline immediately following a closing fence.
- Frontmatter is Template setup only: local constants, local helper
  declarations, `Astro.props`, and Component composition. It is not an
  application module or browser-programming surface.
- Root text, elements, and Expressions need no wrapper element. `<>...</>` and
  `<Fragment>...</Fragment>` emit their children without wrapper markup.
- HTML comments and declarations emit verbatim. Void HTML elements emit with a
  trailing ` />`; self-closing non-void elements emit an opening and closing
  tag. `<script>` and `<style>` content emits verbatim between normal opening
  and closing tags.
- `Astro.props` is the supplied Props object in both source and Precompiled
  Templates. `Astro.slots.has(name)` and `Astro.slots.render(name)` retain the
  documented Component Slot presence and rendering behavior.
- Component attributes are Props; immediate children are Slot content. Unslotted
  children and `slot="default"` supply the default Slot, while named children
  supply the matching Slot. A nested Component can forward a received Slot with
  `<slot name="source" slot="target" />`; both names may be dynamic and are
  converted to strings during Render. Forwarded absent content remains absent.
  Content for each Slot preserves source order and unused supplied Slots render
  nothing. Fallback content renders only when its Slot is absent: an empty
  Fragment, nullish Expression, empty string, or whitespace child is present
  and therefore suppresses Fallback content.

The broader Astro Frontmatter module model, client directives, hydration,
framework components, browser behavior, and other `Astro` globals are
**explicitly unsupported** in Sikka 1.0. They do not acquire compatibility
status from Astro documentation or current implementation behavior.

## Portable Syntax Contract cases

The portable corpus is the semantic oracle used by source and precompiled
runners. Its case data and assertion helpers use only runtime-neutral
JavaScript values; no case depends on Node APIs. A case may include a
request-keyed `components` record when its entry composes Components; those
sources are resolved through the same source and precompiled graph paths.

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
