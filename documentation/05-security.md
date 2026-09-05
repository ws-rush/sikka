# Security: Escaping & Trust

Sikka's security model is small and explicit: **escape by default; trust is opt-in and always visible in the template.** Sikka never sanitizes data and never decides trust for you.

## Default behavior (`autoEscape: true`, the default)

Escaped on interpolation (all of these use the same `escapeHtml` path):

- `{expression}` values
- Attribute values (`id={x}`, `href={url}`, spread values)
- `set:text` values
- `class` / `class:list` / `style` computed values

`escapeHtml` semantics (`src/escape.ts`):

- Strings: escapes `& < > " '`.
- `null` / `undefined` / `boolean` → empty string.
- Arrays: each element escaped (or unwrapped if `RawHtml`) and concatenated.
- Other values: `String(value)`, then escaped.
- `RawHtml` instances (or cross-realm branded objects carrying `Symbol.for('sikka.raw-html')`) pass through verbatim.

## Trusted opt-ins

Each of these bypasses escaping. Only use them with content your application has explicitly decided to trust (e.g. your own templates, sanitized HTML):

| Mechanism           | Scope                | Effect                                                                                                                                                         |
| ------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set:html={value}`  | one element/fragment | Value rendered verbatim. Arrays concatenate; `RawHtml` unwraps. Not sanitization.                                                                              |
| `RawHtml`           | expression value     | A value wrapped as trusted (a generated-runtime helper, **not** an application API). Markup returned from JSX-in-expression is wrapped this way automatically. |
| `is:raw`            | one element          | Child template source emitted verbatim — expressions inside are not evaluated at all.                                                                          |
| `autoEscape: false` | global               | Disables automatic escaping for the entire runtime. Everything renders verbatim.                                                                               |

`{...{ 'set:html': value }}` via spread also inserts verbatim HTML — trust rules apply identically.

## Source-mode trust boundary

Source mode compiles template source with `new Function` and executes frontmatter code. **Every template is executed as application code.** Never feed user-supplied templates to a source-mode runtime. This also means source mode is incompatible with a strict Content-Security-Policy — use [precompiled mode](04-precompile.md), where no string evaluation happens at render time.

## XSS checklist

1. Interpolating untrusted data? Default escaping covers it.
2. Rendering untrusted HTML on purpose? Sanitize **before** it reaches `set:html`/`RawHtml` — Sikka will not do it for you.
3. Attribute injection: covered by attribute-value escaping, including spread attributes.
4. `autoEscape: false` means **you** are the escaper for every interpolation in that runtime.
5. Browser behavior belongs in `<script>` tags (verbatim by design), not in frontmatter — and remember frontmatter runs server-side on every render.
