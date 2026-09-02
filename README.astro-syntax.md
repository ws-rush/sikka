# Sikka Template syntax

This is Sikka's self-contained 1.0 syntax guide. “Astro-like” describes the spelling only: Astro documentation does not define Sikka behavior. The [1.0 Contract](docs/SIKKA_1.0_CONTRACT.md) is normative.

Each item is **Supported**, **Intentionally rejected** (a `SikkaError` diagnostic identifies the construct), or **Explicitly unsupported** (outside the compatibility contract).

## Supported Template structure

A Template may start with an optional opening `---` Frontmatter fence and a root body. A body-only Template and empty Frontmatter are valid. Except for the single newline after a closing fence, source whitespace is preserved. Root text, elements, and Expressions need no wrapper.

```astro
---
import Card from './Card.astro';
const { title, items } = Astro.props;
---
<h1>{title}</h1>
{items.map((item) => <Card {...item} />)}
```

Frontmatter is Template setup: local constants and helper declarations, `Astro.props`, and `.astro` Component composition. Type-only imports create no Component edge; every other import must be an `.astro` Component import. Components receive tag attributes as Props and their immediate children as Slots.

`Astro.props` is the Props object passed to `render` or `stream`. `Astro.slots.has(name)` tests whether a Slot was supplied, and `Astro.slots.render(name)` renders its content. These are the only `Astro` global behavior in the contract.

HTML comments and declarations emit verbatim. Void elements emit with ` />`; self-closing non-void elements emit opening and closing tags. `<script>` and `<style>` contents emit verbatim between their normal tags.

## Supported expressions, Components, Fragments, and Slots

Expressions use `{...}` and are evaluated during Render. They can use the Template's Frontmatter locals and Props. By default, expression values are HTML-escaped; nullish values and booleans render no text, while arrays concatenate their rendered values.

An imported Component is used as a tag. Its unslotted children and `slot="default"` content form the default Slot; children with `slot="name"` form named Slots. Multiple pieces of Slot content retain source order. Unused supplied Slots produce no output.

```astro
---
import Layout from './Layout.astro';
---
<Layout>
  <h1>Default Slot</h1>
  <meta slot="head" name="description" content="Example" />
</Layout>
```

`<slot />` renders a Component's default Slot and `<slot name="head" />` a named Slot. Fallback children render only when the Slot is absent; an empty Fragment, nullish Expression, empty string, or whitespace child still counts as supplied. A Slot can forward received content with `<slot name="source" slot="target" />`; either name may be an expression and is converted to a string.

`<>...</>` and `<Fragment>...</Fragment>` emit their children without wrapper markup. A Fragment permits only `slot`, `set:html`, and `set:text`.

## Supported attributes

Direct attributes and object spreads evaluate left to right. Later ordinary keys replace earlier keys; a later nullish ordinary value removes one. On native HTML tags, `null` and `undefined` omit an attribute, empty strings emit the valueless form, and standard boolean attributes appear only when truthy. Other values, including `false` and `0`, stringify and escape. Hyphenated custom elements stringify boolean-looking values instead of applying native boolean rules.

`class`, `className`, and direct or spread `class:list` merge in source order into one escaped `class` attribute. `class:list` recursively flattens arrays and Sets, keeps strings and truthy object keys, omits falsy values, and preserves duplicate tokens. No class attribute is emitted for an empty result.

```astro
<div id="first" {...props} id="last" class="base" class:list={['active', { hidden: false }]} />
```

Style strings and objects merge in source order into one escaped `style` attribute, separated by one semicolon. Object keys are kebab-cased except custom properties. String and numeric values, including `0`, remain; nullish, boolean, and empty-string values do not. An object with a custom `toString` supplies its complete style value.

```astro
<div style="margin:0" style={{ backgroundColor: 'navy', '--gap': 0 }} />
```

## Escaping and raw output

**Default behavior:** Sikka escapes interpolated text and attribute values. That is encoding, not sanitization.

- With default `autoEscape`, `set:text={value}` inserts escaped text.
- `set:html={value}` inserts verbatim HTML.
- `<div {...{ 'set:html': value }} />` has the same verbatim behavior.
- `is:raw` on an element emits its child Template source verbatim instead of evaluating it.
- `autoEscape: false` turns off automatic escaping for the entire `Sikka` instance.
- Generated Template code can use its `RawHtml` runtime helper for a trusted value.

```astro
<div set:text={comment} />
<div set:html={trustedMarkup} />
<pre is:raw>{exampleExpression}</pre>
```

`set:html`, spread `set:html`, `RawHtml`, `is:raw` Template content, `autoEscape: false`, and Template source itself are trust boundaries. In particular, `set:html` is not a sanitizer. Only pass data and Template source your application has chosen to trust; validating, sanitizing, and authorizing content are application responsibilities.

## Intentionally rejected syntax

These constructs fail rather than silently acquiring Astro behavior:

- A non-type Frontmatter import that is not an `.astro` Component import.
- A `set:html` or `set:text` Directive combined with child content or with each other.
- Spread `set:text` and unsupported Directive keys.
- Fragment attributes or spreads other than `slot`, `set:html`, and `set:text`; `is:raw` on a Fragment is rejected.
- `is:inline`.
- Missing source requests, empty or invalid canonical identities, and Component cycles.
- Awaited Frontmatter passed to regular `render`; use `stream` instead.

The public diagnostic category is `Parse`, `Resolve`, `Compile`, or `Render`. Its contextual fields are Stable; exact prose is not.

## Explicitly unsupported syntax and behavior

Sikka does not implement the broader Astro module model. The following have no compatibility promise: arbitrary Frontmatter imports or application-service work, client directives, hydration, framework Components, browser behavior, other `Astro` globals, and behavior taken only from Astro documentation. Keep application data loading outside Frontmatter and pass its result as Props.

`is:inline` is intentionally rejected, as above. Future Astro behavior does not become Sikka syntax unless Sikka documents it as Supported.

## Streaming

Streaming has the same output semantics as regular Render except for awaited Frontmatter, which is Streaming-only. It flushes pending source content before each Component, renders Components in source order, and delegates to their Streaming Render. Other chunk boundaries are unspecified.
