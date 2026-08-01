# Eta `compile` API research

**Scope.** Eta 4.6.0, current official Eta source and docs (checked 2026-03-09). Eta’s former `eta-dev/eta` URL currently serves this source; npm names `bgub/eta` as the repository.[^npm]

## What Eta actually provides

`eta.compile(str, options?)` has the TypeScript signature
`(this: Eta, str: string, options?: Partial<Options>) => TemplateFunction`.[^compile]
`TemplateFunction` is `(this: Eta, data?: object, options?: Partial<Options>) => string`.[^type]
That return type is intentionally sync-shaped, but `options.async: true` selects `AsyncFunction`; callers then receive/await a Promise (as `renderAsync` does).[^compile][^render] The only per-compile `Options` fields are `async` and `filepath`; `async` chooses the generated-function constructor and `filepath` supplies include/layout resolution context.[^options][^compile]

Configuration instead belongs to an `Eta` instance (`new Eta(config)`), is merged with defaults, and can later be replaced/derived with `configure`/`withConfig`.[^internal] Compilation reads that instance configuration for parsing/code generation; the generated body also uses `this.config` for escaping, filtering, custom tags, and its helpers. Therefore a bare `const fn = eta.compile(t); fn(props, eta.config)` is not Eta’s supported call: `fn` must retain/bind the Eta receiver (normal `eta.render` uses `templateFn.call(this, data, options)`).[^generate][^render]

Interpolations are XML-escaped by default; raw `<%~ ... %>` is not escaped. `autoEscape`, `escapeFunction`, `autoFilter`, and `filterFunction` control this.[^syntax][^config] Includes are runtime helpers: `include` calls sync `render`, `includeAsync` calls `renderAsync`, merging current data with overrides. Layouts similarly render through `include`/`includeAsync`, pass accumulated `body` and named blocks, and may nest.[^generate][^partials][^layouts]

Eta has separate sync/async named-template stores. `loadTemplate` precompiles into one; file rendering recompiles on a miss and stores it only when `config.cache` is true. Filesystem path resolution has its own `cacheFilepaths` flag.[^internal][^render][^file]

Eta creates template functions with `Function` or `AsyncFunction`.[^compile] Thus runtime compilation requires a CSP that permits dynamic evaluation (normally `unsafe-eval`); strict CSP cannot compile arbitrary runtime strings. Precompile/build-time generation could avoid that *at runtime*, but Eta’s compiled output still expects Eta instance methods/configuration. This is also why Eta treats templates as trusted executable code and does not sandbox them.[^compile][^security]

## Comparison: proposed Sikka shape

Current Sikka exposes an **instance** `compile(str, config?)`, not static `Sikka.compile` or `Sikka.config`.[^sikka-index] It returns a richer async callable: `(props, slots?) => Promise<string>`, plus `renderSync` and `render`; its second argument is slots, not configuration.[^sikka-types] `config || this.options` is selected at compilation, so a proposed `compiled(props, Sikka.config)` would be misinterpreted as slots and cannot provide Eta-style per-call options.[^sikka-index]

Sikka escapes interpolations by default, permits `autoEscape: false`, trusted `RawHtml`, and `set:html`; dynamic attributes are escaped regardless.[^sikka-compiler][^sikka-escape] This is broadly compatible with Eta’s escaped/default vs explicit-raw model, but not its `<%~>` syntax or configurable escape function. Sikka’s async callable is a Promise wrapper around synchronous rendering; independent streaming is an `AsyncGenerator`, whereas Eta async compilation enables `await` in template JS.[^sikka-types][^sikka-compiler]

Sikka resolves Astro frontmatter component imports at compile time, closes over component functions, and supports slots; it has no Eta-style runtime include/layout/block API.[^sikka-compiler] Its LRU/cache injection caches Sikka compile paths, but a direct `compile` with override config deliberately bypasses the cache; this differs from Eta’s named/file cache.[^sikka-index] Finally, Sikka also uses `new Function` (and `AsyncFunction` for streaming), so the proposed runtime API does not satisfy strict CSP without a precompiled/no-eval architecture.[^sikka-compiler]

[^npm]: https://www.npmjs.com/package/eta
[^compile]: https://github.com/eta-dev/eta/blob/main/src/compile.ts
[^type]: https://github.com/eta-dev/eta/blob/main/src/compile.ts#L5-L9
[^options]: https://github.com/eta-dev/eta/blob/main/src/config.ts#L5-L10
[^render]: https://github.com/eta-dev/eta/blob/main/src/render.ts
[^internal]: https://github.com/eta-dev/eta/blob/main/src/internal.ts
[^generate]: https://github.com/eta-dev/eta/blob/main/src/compile-string.ts
[^syntax]: https://github.com/eta-dev/eta-docs/blob/main/content/docs/4.x.x/syntax/template-syntax.md
[^config]: https://github.com/eta-dev/eta-docs/blob/main/content/docs/4.x.x/api/configuration.md
[^partials]: https://github.com/eta-dev/eta-docs/blob/main/content/docs/4.x.x/syntax/template-syntax.md#partials
[^layouts]: https://github.com/eta-dev/eta-docs/blob/main/content/docs/4.x.x/syntax/layouts-and-blocks.md
[^file]: https://github.com/eta-dev/eta/blob/main/src/file-handling.ts
[^security]: https://github.com/eta-dev/eta-docs/blob/main/content/docs/4.x.x/intro/security.md
[^sikka-index]: https://github.com/ws-rush/sikka/blob/prototype/precompiled-template-interface/src/index.ts
[^sikka-types]: https://github.com/ws-rush/sikka/blob/prototype/precompiled-template-interface/src/types.ts
[^sikka-compiler]: https://github.com/ws-rush/sikka/blob/prototype/precompiled-template-interface/src/compiler.ts
[^sikka-escape]: https://github.com/ws-rush/sikka/blob/prototype/precompiled-template-interface/src/escape.ts
