# Changelog

All notable changes to this project are documented here. The 1.0 Contract defines the Stable API and Syntax Contract.

## 1.0.0 (unreleased)

### Breaking changes

- Installation and public entry points are npm `sikka`, `sikka/precompile`, and `sikka/runtime`; JSR distribution is removed.
- `Sikka` now requires an explicit `source` or `precompiled` mode with a synchronous resolver. Source resolvers return `{ id, source }`; precompiled resolvers return an already-loaded module with named `render` and `stream` exports.
- Removed implicit and filesystem-oriented loading options, including `views`, `readFile`, and `resolvePath`.
- Removed direct source-string rendering and instance compilation APIs: `renderString`, `streamString`, `compile`, and `compileToString`.
- Removed global Component registration/loading APIs: `loadComponent` and `registerComponent`. Components are Frontmatter `.astro` imports.
- Precompilation is now `compile(entries, { resolver })` from `sikka/precompile`. It returns versioned artifacts; build tools own generated-module wrapping, static linking, and output I/O.
- Generated modules use the versioned `sikka/runtime` ABI and named `render` and `stream` exports; there is no default export.

### Stable commitments after 1.0

The application API, standalone precompile API, generated-runtime ABI, public types, diagnostics categories/context, and documented Supported syntax follow semantic versioning. Breaking changes require a major release; backward-compatible features require a minor release; backward-compatible fixes require a patch release. Intentionally rejected and explicitly unsupported syntax does not gain compatibility status until documented as Supported.
