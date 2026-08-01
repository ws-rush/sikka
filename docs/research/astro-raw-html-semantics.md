# Astro raw HTML semantics

## Clear answer

Astro’s documented template-level opt-in for inserting a value as raw HTML is `set:html`; it is **not escaped** and must therefore be trusted or manually sanitized. Astro does **not document a public `RawHtml`-style wrapper or component** for making an ordinary expression such as `{value}` render raw. Ordinary template expressions escape HTML; the documented way to change that is to put the value in `set:html` (including on `Fragment` when no wrapper element is wanted).

## `set:html`

- `set:html={string}` injects the string into the element, “similar to setting `el.innerHTML`.” Astro explicitly says its value is **not automatically escaped**, warns that the caller must trust or manually escape it, and identifies XSS as the consequence of failing to do so. The docs contrast `{rawHTMLString}` (escaped) with `set:html={rawHTMLString}` (parsed as HTML). [Astro template directives: `set:html`](https://docs.astro.build/en/reference/directives-reference/#sethtml)
- The same directive may be put on `<Fragment>` to insert HTML without an extra wrapper element. It also accepts `Promise<string>` and `Promise<Response>` values. [Astro template directives: `set:html`](https://docs.astro.build/en/reference/directives-reference/#sethtml)
- Astro’s source implements a private/internal branded HTML-string mechanism (`markHTMLString`/`HTMLString`) used by server rendering. It is an implementation detail, not the documented public template API: [server escape implementation](https://github.com/withastro/astro/blob/main/packages/astro/src/runtime/server/escape.ts); [package export map](https://github.com/withastro/astro/blob/main/packages/astro/package.json). In particular, the package’s public export map does not expose that module as a supported `astro` API.

## Ordinary expressions and a `RawHtml`-like public API

Astro’s own `set:html` example establishes the ordinary-expression rule: `<h1>{rawHTMLString}</h1>` produces escaped markup, while `set:html` produces parsed markup. [Astro template directives: `set:html`](https://docs.astro.build/en/reference/directives-reference/#sethtml)

The official template-directives reference contains no documented `RawHtml` wrapper/component; its raw insertion mechanism is `set:html`. The internal `HTMLString` helper above should not be treated as a public compatibility contract.

## `set:text`

`set:text={string}` inserts text “similar to setting `el.innerText`.” Unlike `set:html`, Astro automatically escapes its value. The docs say it is equivalent to a direct expression such as `<div>{someText}</div>`, so it is not commonly needed. [Astro template directives: `set:text`](https://docs.astro.build/en/reference/directives-reference/#settext)

## Implication for Sikka 1.0

If Sikka follows the documented Astro subset, `set:html` is the Astro-aligned explicit raw-output feature and must carry a trust/XSS warning. A public `RawHtml` value wrapper would be a Sikka-specific extension, not an Astro-documented compatibility requirement.
