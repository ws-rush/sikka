# Changelog

All notable changes to this project are documented here. The 1.0 Contract defines the Stable API and Syntax Contract.

## 0.2.0 (2026-09-02)

### Breaking changes

- Installation and public entry points are npm `sikka`, `sikka/precompile`, and `sikka/runtime`; JSR distribution is removed.
- `Sikka` now requires an explicit `source` or `precompiled` mode with a synchronous resolver. Source resolvers return `{ id, source }`; precompiled resolvers return an already-loaded module with named `render` and `stream` exports.
- Removed implicit and filesystem-oriented loading options, including `views`, `readFile`, and `resolvePath`.
- Removed direct source-string rendering and instance compilation APIs: `renderString`, `streamString`, `compile`, and `compileToString`.
- Removed global Component registration/loading APIs: `loadComponent` and `registerComponent`. Components are Frontmatter `.astro` imports.
- Precompilation is now `compile(entries, { resolver })` from `sikka/precompile`. It returns versioned artifacts; build tools own generated-module wrapping, static linking, and output I/O.
- Generated modules use the versioned `sikka/runtime` ABI and named `render` and `stream` exports; there is no default export.

### Added

- `emitModule(artifact, { runtimeSpecifier?, componentSpecifier? })` from `sikka/precompile` generates the complete static ESM module for one artifact, so hosts no longer hand-write the generated-module wrapper. Hosts still own output paths, import specifiers, and I/O.

### Features

- feat: add named source resolver ([8906a99](https://github.com/ws-rush/sikka/commit/8906a99))
- feat: resolve source components from imports ([27924ff](https://github.com/ws-rush/sikka/commit/27924ff))
- feat: forward component slots ([878be58](https://github.com/ws-rush/sikka/commit/878be58))
- feat: make slot presence control fallback ([47b1ea2](https://github.com/ws-rush/sikka/commit/47b1ea2))
- feat: merge class attribute values ([5b1bc1d](https://github.com/ws-rush/sikka/commit/5b1bc1d))
- feat: precompile component graphs ([308ee8c](https://github.com/ws-rush/sikka/commit/308ee8c))
- feat: precompile one template artifact ([6cd81a3](https://github.com/ws-rush/sikka/commit/6cd81a3))
- feat: render named precompiled templates ([4eaeaca](https://github.com/ws-rush/sikka/commit/4eaeaca))
- feat: retain configured precompiled rendering ([0febcff](https://github.com/ws-rush/sikka/commit/0febcff))
- feat: restrict frontmatter await to streaming ([f8e680d](https://github.com/ws-rush/sikka/commit/f8e680d))
- feat: add structured Sikka diagnostics ([af50532](https://github.com/ws-rush/sikka/commit/af50532))

### Bug Fixes

- fix: conform expression coercion and escaping ([3967cef](https://github.com/ws-rush/sikka/commit/3967cef))
- fix: conform HTML attribute coercion ([3984c7c](https://github.com/ws-rush/sikka/commit/3984c7c))
- fix: diagnose invalid directives and fragments ([aef4fe9](https://github.com/ws-rush/sikka/commit/aef4fe9))
- fix: merge style values in source order ([f65b2ae](https://github.com/ws-rush/sikka/commit/f65b2ae))
- fix: preserve streaming component parity ([96c5ccd](https://github.com/ws-rush/sikka/commit/96c5ccd))
- fix(api): restrict varName to source mode ([8561f39](https://github.com/ws-rush/sikka/commit/8561f39))

### Performance

- perf: optimize template rendering hot paths ([d404ec5](https://github.com/ws-rush/sikka/commit/d404ec5))
- perf: optimize compiler and runtime performance ([c44031b](https://github.com/ws-rush/sikka/commit/c44031b))
- perf(compiler): hoist per-render lookups and reconcile resolver validation ([68f352c](https://github.com/ws-rush/sikka/commit/68f352c))

### Stable commitments after 1.0

The application API, standalone precompile API, generated-runtime ABI, public types, diagnostics categories/context, and documented Supported syntax follow semantic versioning. Breaking changes require a major release; backward-compatible features require a minor release; backward-compatible fixes require a patch release. Intentionally rejected and explicitly unsupported syntax does not gain compatibility status until documented as Supported.
