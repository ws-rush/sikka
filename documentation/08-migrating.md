# Migrating from Astro or Eta

Sikka is a template engine, not a site framework. If you're coming from Astro or Eta, most of what you know maps directly — this page covers the mapping and the gaps that will actually surprise you.

## From Astro

### Maps 1:1

| Astro                                        | Sikka | Notes                                      |
| -------------------------------------------- | ----- | ------------------------------------------ |
| Frontmatter `---` block                      | Same  | Setup, props, component imports            |
| `{expression}`                               | Same  | Auto-escaped by default                    |
| `<Component />` with props/children          | Same  | Imported in frontmatter, uppercase tags    |
| Named slots, slot fallbacks, slot forwarding | Same  | See [Syntax → Slots](02-syntax.md#slots)   |
| `set:html`, `set:text`, `class:list`         | Same  | Same trust semantics                       |
| `<script>` / `<style>` raw content           | Same  | Emitted verbatim (no bundling, no scoping) |
| `Astro.props`, `Astro.slots`                 | Same  | The whole `Astro` surface — see below      |

### Different

| Astro                                            | In Sikka                                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| File-based routing                               | You choose entry requests: whatever your resolver maps them to                                                    |
| `Astro.params`, `Astro.url`, `Astro.glob`, etc.  | Not available. `Astro` is exactly `props` + `slots`. Route data comes in as props                                 |
| Scoped styles, bundled assets                    | `<style>`/`<script>` emit in place as-is (or are stripped with `aggregateAssets: true` for host-side aggregation) |
| `.mdx`, framework components (`.tsx`, `.vue`, …) | Frontmatter imports accept **only `.sikka` Components**; everything else arrives via props                        |
| `is:inline`                                      | Explicit error — scripts/styles are always inline-verbatim already                                                |
| Frontmatter top-level `await` (any render)       | Streaming renders only                                                                                            |

### Not in Sikka (by design)

`client:*` directives, islands, view transitions, and any client framework integration. Sikka renders HTML; browser behavior belongs in your own `<script>`.

## From Eta

| Eta                                   | Sikka                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `<%= value %>`                        | `{value}` — **Sikka escapes by default.** If you relied on unescaped output, reach for `set:html` or `RawHtml` deliberately |
| `<%~ value %>` (raw)                  | `set:html={value}` or wrap in `RawHtml` — trusted opt-in, never accidental                                                  |
| `<% %>` logic / loops                 | Frontmatter (`---`) — compute there, render the result                                                                      |
| `include('partial')`                  | `import Partial from './Partial.sikka'` + `<Partial />`                                                                     |
| `data` option                         | `props` → `Astro.props`                                                                                                     |
| Layouts via `include` + header/footer | A `Layout.sikka` Component wrapping children via `<slot />`                                                                 |

The mental shift: Eta interpolates inside a single file; Sikka composes Components. Convert each partial/layout into a `.sikka` Component with `Sikka.props` for its data and `<slot>` for its content — the [examples app](../examples/README.md) shows the full pattern (Layout, Header, data-driven pages).
