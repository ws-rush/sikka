# Errors & Troubleshooting

Every failure Sikka raises is a `SikkaError` with a machine-readable `category` — `Parse`, `Resolve`, `Compile`, or `Render` — and an `error.name` of `<category>Error`. Parse and Compile errors carry `line`/`column`; a `construct` hint names the rejected syntax when applicable. The contextual fields are stable API; exact message prose is not. See [Public API → Diagnostics](03-api.md).

## Quick reference

| You see                                                                                   | Meaning                                                                                       | Fix                                                                                     |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `Unclosed frontmatter fence`                                                              | The opening `---` has no matching close                                                       | Close the fence with a line reading `---`                                               |
| `Unclosed expression {`                                                                   | A `{...}` interpolation never ends                                                            | Match the closing `}`                                                                   |
| `Unclosed tag <div>` (any tag)                                                            | An element, `<script>`, `<style>`, or `<slot>` never closes                                   | Close the tag; check `is:raw` elements too                                              |
| `Expected attribute name` / missing `>`                                                   | Malformed opening tag                                                                         | Check for stray characters after the tag name                                           |
| `Frontmatter await is only supported during Streaming renders`                            | `render()` hit a template using `await` in frontmatter                                        | Use `stream()`, or move the async work into the host and pass results as props          |
| `Unsupported Frontmatter import`                                                          | Only `.astro` Component imports are allowed in frontmatter                                    | Import Components; import data/JS from your server code and pass via props              |
| `InvalidDirective: cannot use set:html with children` (also `set:text`, or both together) | Directive + children conflict                                                                 | Use the directive **or** children, never both; never `set:html` and `set:text` together |
| `InvalidDirective: spread set:html/set:text is not supported`                             | The directive came through `{...spread}`                                                      | Pass `set:html` as a plain attribute                                                    |
| `InvalidDirective: is:inline is not supported`                                            | `is:inline` is rejected everywhere                                                            | Remove it — `<script>`/`<style>` already emit verbatim                                  |
| `InvalidFragment: ...`                                                                    | `<Fragment>`/`<>` only allows `set:html`, `set:text`, `slot` — no spreads or other attributes | Move the logic onto a real element                                                      |
| `ResolveError for "x" imported by ...`                                                    | Your resolver threw or returned nothing for a request                                         | Check the request path/entry name; log it inside the resolver                           |
| Component graph cycle (`Resolve`)                                                         | A component (transitively) imports itself                                                     | Break the cycle — graphs must be acyclic                                                |
| `Invalid Component <X>`                                                                   | A bound component tag resolved to neither a Component nor a string                            | Export `render`/`stream` (or a string) from the imported module                         |
| `Runtime Error: ...`                                                                      | User code in the template threw at render time                                                | The wrapped message names your own error — fix the template code                        |
| `PrecompiledError ... invalid generated module ABI`                                       | A precompiled module doesn't export `render`/`stream` correctly                               | Regenerate artifacts with matching `sikka/precompile` and `sikka/runtime` versions      |

## Frontmatter `await`

`await` compiles only into streaming renderers. `stream()` supports it; `render()` throws at first render of such a template. If you must render sync, hoist the async work into the host and pass the result as a prop:

```astro
---
const data = await load(); // stream() only
---
```

## Stale output after editing a template

Source mode caches by the resolver-returned `id`. In dev, either call `sikka.invalidate(id)` on file change or lower `cacheSize`. See [Caching behavior](03-api.md#caching-behavior).

## Debugging the resolver

Wrap your resolver and log `(request, importer)` pairs — most `ResolveError`s are entry names or relative specifiers that don't match what the resolver expects. Remember `importer` is `undefined` for entry requests.
