# Template Syntax

Sikka templates are Astro-like: an optional frontmatter block, then HTML-like markup with `{expression}` interpolation. This is the complete syntax reference.

"Astro-like" describes the spelling only — Astro documentation does not define Sikka behavior, and future Astro syntax does not become Sikka syntax unless documented here as supported.

A template is:

```
---
frontmatter (JS/TS setup code)
---
<markup>
```

## Frontmatter

The block between two `---` fences at the very start of the file (no leading whitespace).

```astro
---
const items = [1, 2, 3];
import Card from './Card.astro';
---
```

Rules:

- A body-only Template (no fences) and an empty Frontmatter block are both valid. Except for the single newline after a closing fence, source whitespace is preserved.
- Frontmatter code is inlined into the generated render function, so it runs on every render with `props` in scope. Keep it to template setup — browser behavior belongs in `<script>`.
- `export` prefixes are stripped; `import` statements are removed from the generated body (they are compiled into component bindings).
- `await` is allowed **only for streaming renders** — `render()` fails compilation with a diagnostic.
- Imports: only **non-type `.astro` imports** are supported as components. Default, named, namespace (`* as X`), and `type` imports are recognized; any non-`.astro` specifier is a compile error.

Import forms recognized:

```astro
---
import Card from './Card.astro';              // default
import { Card, Chip as Badge } from './ui.astro';
import * as UI from './ui.astro';
import type { Props } from './types';         // erased, not a component
---
```

## Expressions `{...}`

`{ expr }` evaluates a JS/TS expression and interpolates it (escaped by default — see [Security](05-security.md)).

```astro
<p>{user.name}</p>
<p>{count > 0 ? 'yes' : 'no'}</p>
```

Details:

- Nested braces, string literals (`'`, `"`, backticks including `${...}` interpolation) are balanced correctly.
- Nullish values and booleans render no text; arrays concatenate their rendered values.
- **JSX inside expressions**: markup inside an expression becomes a trusted raw-HTML value, so expressions can return markup:

  ```astro
  {items.map((item) => <li class={item.done ? 'done' : ''}>{item.label}</li>)}
  ```

- Comment-only expressions (`{ /* ... */ }`) emit nothing.
- A bare comment node `<!-- ... -->` is emitted verbatim. Unclosed comments are parse errors.

## Elements

Standard HTML elements parse as you expect, with nesting, self-closing (`<br />`), and HTML5 void elements (`img`, `input`, `br`, `hr`, `meta`, `link`, …) which never expect a closing tag. Void elements emit with ` />`; a self-closing non-void element emits both opening and closing tags. `<!doctype html>` and other declarations are handled, and HTML comments emit verbatim.

### Attributes

```astro
<input type="text" disabled class="a" />
<div id={user.id} data-count={count}>...</div>
```

- Static quoted and unquoted values.
- Boolean attribute (`disabled`) — emitted bare for native elements; `attr="true"` for custom elements (tags containing `-`).
- Expression values `{...}`. `null`/`undefined` omit the attribute; `""` emits the bare attribute name.
- Native boolean attributes (e.g. `checked`, `disabled`, `hidden`) render conditionally on truthiness. Other values — including `false` and `0` — stringify and escape; hyphenated custom-element tags stringify boolean-looking values instead of applying native boolean rules.

### Spread attributes

```astro
<div {...attrs} class="extra" />
```

Spread objects merge with other attributes; later entries win per-key. Within a spread:

- `class`, `className`, `class:list` values are merged into one `class` attribute.
- `style` values (string or object) merge into one `style` attribute.
- `set:html` is supported via spread only on elements (not fragments); `set:text` in a spread is an error; other `foo:bar` directive keys in a spread are errors.
- `null`/`undefined` values delete the attribute.

### `class` and `class:list`

Multiple `class`/`class:list` attributes merge. `class:list` accepts strings, arrays, Sets, or objects (truthy keys win), recursively — flattening nested arrays and Sets, omitting falsy values, and preserving duplicate tokens. An empty result emits no `class` attribute at all:

```astro
<div class:list={['a', { b: cond, c: !cond }]} />
```

### `style`

`style` accepts a string or an object. Object keys are converted from camelCase to kebab-case — except custom properties (`--gap`), which keep their name — and empty/null/boolean values are dropped; string and numeric values, including `0`, remain. An object with a custom `toString` supplies its complete style value:

```astro
<div style={{ color: 'red', paddingTop: 8 }} />
```

## Fragments

`<Fragment>...</Fragment>` (or empty `<>...</>`) emits its children without a wrapper tag.

```astro
<Fragment set:html={content} />
```

Fragments support only `set:html`, `set:text`, and `slot` attributes — anything else (including spreads) is an error.

## Components

Any tag starting with an uppercase letter is a component call:

```astro
---
import Card from './Card.astro';
---
<Card title="Hello" items={list}>
  <p>goes to the default slot</p>
  <p slot="footer">goes to the named footer slot</p>
</Card>
```

- Props are the element's attributes (static, dynamic, and spread).
- Children become the component's slots (see below).
- If the component name is unbound at compile time **and** resolves to a string at runtime, the tag is treated as a dynamic HTML element. Unbound entirely → falls back to a plain HTML element.
- Component graphs must be acyclic; cycles are `Resolve` errors.

## Slots

### In a component: `<slot>`

```astro
<slot />                 <!-- default slot -->
<slot name="header" />   <!-- named slot -->
<slot>{fallback}</slot>  <!-- fallback children when slot not provided -->
<slot name={expr} />     <!-- dynamic slot name -->
```

### At a call site: `slot="name"` attribute

Child content with a `slot` attribute is routed to that named slot (`slot="default"` targets the default slot explicitly). Multiple pieces of content for the same slot retain source order; a supplied slot the component never renders produces no output.

A fallback renders only when its slot is entirely **absent** — an empty Fragment, nullish expression, empty string, or whitespace-only child still counts as supplied and suppresses the fallback.

A `<slot>` **inside** a component's children forwards received slot content to its own child component (slot forwarding), statically or with a dynamic name — e.g. `<slot name="source" slot="target" />` forwards the received `source` slot as the child's `target` slot. Either name may be an expression and is converted to a string.

## Directives

| Directive    | Applies to             | Behavior                                                                                                                                                                            |
| ------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set:html`   | elements, `<Fragment>` | Inserts the value as **verbatim HTML** (no escaping; trusted only). Cannot combine with children or `set:text`. Arrays are concatenated; `RawHtml` values unwrap.                   |
| `set:text`   | elements, `<Fragment>` | Inserts the value **escaped as text**. Cannot combine with children or `set:html`.                                                                                                  |
| `class:list` | elements               | Class-list merge (see above).                                                                                                                                                       |
| `is:raw`     | elements               | The element's entire content is emitted verbatim — the parser does not evaluate expressions inside it. Nested same-tag elements are handled. Not supported on `<Fragment>` or `<>`. |

Unsupported (explicit errors): `is:inline` on any tag, any directive key inside a spread other than the documented ones, and any attribute on `<Fragment>` other than `set:html`/`set:text`/`slot`.

## `<script>` and `<style>`

Parsed as raw content (no expression evaluation inside). Emitted in place, unless `aggregateAssets: true` is set on the runtime — then `<script>`/`<style>` tags are omitted from output entirely (the host aggregates them itself). Attribute values on these tags may not contain a bare `/` before `>` (e.g. a closing `</script>` inside a string).

```astro
<script>
  console.log('runs only if emitted');
</script>
<style>
  h1 { color: red; }
</style>
```

## The `Astro` global

Within a template, `Astro` exposes:

```ts
Astro.props; // the render props
Astro.slots.render(name); // named/default slot content as RawHtml
Astro.slots.has(name); // whether a slot was provided
```

The compiler only emits this binding when the template actually references it, and a slimmer `Astro = { props }` when only `Astro.props` is used. In source mode you can rename the variable with the `varName` option (default `Astro`); generated precompiled modules always bind `Astro`.

## Parse errors

Errors carry a `line` and `column`. The notable ones:

- Unclosed frontmatter fence; unclosed `{` expression; unclosed string literal
- Unclosed tags (`<div>`, `<script>`, `<style>`, `<slot>`, `is:raw` elements)
- Missing `>` after tag names or closing tags; unclosed attribute value quotes
- `InvalidDirective:` / `InvalidFragment:` rejections described above

See [Public API → Diagnostics](03-api.md#diagnostics).
