# Minimal VitePress integration research

Scope: facts for a later decision; this is not an implementation proposal.

## Findings

- Current VitePress documentation requires Node.js 22+ and installs the current prerelease with `npm add -D vitepress@next`. Sikka declares `"type": "module"` and pins Nub as its package manager (`@nubjs/nub@0.7.1`); the equivalent existing-workflow installation command is `nub add -D vitepress@next`. VitePress only calls for an explicit `vue` dependency when the site customizes with Vue components or APIs, so that command is the smallest documented dependency set for the default-theme setup reported here. [VitePress: installation](https://vitepress.dev/guide/getting-started#installation) · [Sikka package metadata](../package.json)
- For an existing project, VitePress recommends a nested site directory. With the requested root, the site directory is `documentation/`; `documentation/.vitepress/` is VitePress’s reserved configuration location, and Markdown outside it is source. Thus the smallest source layout is `documentation/index.md` plus `documentation/.vitepress/config.js`. [VitePress: file structure](https://vitepress.dev/guide/getting-started#file-structure) · [VitePress: source files](https://vitepress.dev/guide/getting-started#source-files)
- The minimum configuration needed specifically for built-in local search is:

  ```js
  // documentation/.vitepress/config.js
  export default {
    themeConfig: { search: { provider: 'local' } }
  }
  ```

  VitePress says this enables fuzzy full-text search using an in-browser MiniSearch index; it requires neither Algolia credentials nor a search plugin. [VitePress: local search](https://vitepress.dev/reference/default-theme-search#local-search)
- The official script shape is `vitepress dev <root>`, `vitepress build <root>`, and `vitepress preview <root>`. Adapted to this root and Sikka’s `nub run` workflow, the corresponding package scripts would be `docs:dev: vitepress dev documentation`, `docs:build: vitepress build documentation`, and `docs:preview: vitepress preview documentation`; their invocations would be `nub run docs:dev`, `nub run docs:build`, and `nub run docs:preview`. This is a reported command mapping, not a requested package change. [VitePress: up and running](https://vitepress.dev/guide/getting-started#up-and-running) · [Sikka package metadata](../package.json)
- No `srcDir` or `outDir` override is needed for that layout. VitePress treats the CLI root as the project root, stores build output by default at `.vitepress/dist`, and permits those locations to be configured. Consequently, the default static-site output for this root is `documentation/.vitepress/dist/`. [VitePress: file structure](https://vitepress.dev/guide/getting-started#file-structure) · [VitePress: `srcDir` / `outDir`](https://vitepress.dev/reference/site-config#build)

## Non-findings

This research does not choose site content, theme/navigation, deployment target, a non-default output directory, or whether to adopt VitePress.
