# Ubiquitous Language

## Templates and composition

| Term                    | Definition                                                                                                                               | Aliases to avoid                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Template**            | An Astro-syntax source document that defines HTML output.                                                                                | View, page, markup file         |
| **Component**           | A reusable **Template** that can be composed into another **Template**.                                                                  | Widget, partial, include        |
| **Template source**     | The text of a **Template**, supplied directly or loaded from a file.                                                                     | Source file, input              |
| **Template resolution** | The mapping of a Template request, optionally relative to an importing Template, to its canonical Template identity and Template source. | Lookup, loading                 |
| **Frontmatter**         | The fenced setup section at the beginning of a **Template**.                                                                             | Script block, preamble          |
| **Props**               | Named input values supplied to a **Template** or **Component**.                                                                          | Parameters, attributes, data    |
| **Slot**                | A named or default insertion point through which a parent supplies child content to a **Component**.                                     | Placeholder, content projection |
| **Fallback content**    | The content a **Slot** renders when its parent supplies no matching slot content.                                                        | Default content                 |

## Rendering and output

| Term                 | Definition                                                                            | Aliases to avoid             |
| -------------------- | ------------------------------------------------------------------------------------- | ---------------------------- |
| **Render**           | The act of evaluating a **Template** with **Props** and slot content to produce HTML. | Execute, compile             |
| **Rendered HTML**    | The HTML string or stream produced by a **Render**.                                   | Response, output             |
| **Expression**       | An embedded JavaScript or TypeScript value source evaluated during a **Render**.      | Interpolation, dynamic value |
| **Directive**        | A reserved template attribute that changes how an element's content is rendered.      | Special attribute, modifier  |
| **Raw HTML**         | Trusted HTML intentionally inserted without HTML escaping.                            | Unescaped text, safe string  |
| **Escaped value**    | An interpolated value encoded so it is safe to include in HTML.                       | Sanitized value              |
| **Streaming render** | A **Render** that produces **Rendered HTML** incrementally as asynchronous chunks.    | Async render, chunked output |

## Relationships

- A **Template** may import and compose zero or more **Components**.
- A **Component** receives **Props** and may expose zero or more **Slots**.
- A parent **Template** supplies slot content to a child **Component**; otherwise its **Fallback content** is rendered.
- A **Render** evaluates a **Template** and produces **Rendered HTML**.
- An **Expression** produces an **Escaped value** by default; only **Raw HTML** is inserted verbatim.
- A **Streaming render** produces the same **Rendered HTML** semantics as a regular **Render**, incrementally.

## Example dialogue

> **Dev:** "When a parent uses a **Component**, are its attributes **Props** or HTML attributes?"
> **Domain expert:** "They are **Props**. The **Component** decides whether to render them as HTML attributes."
>
> **Dev:** "If the parent provides no content for a **Slot**, what appears?"
> **Domain expert:** "The **Slot** renders its **Fallback content**."
>
> **Dev:** "Can an **Expression** insert markup directly?"
> **Domain expert:** "Not by default: it produces an **Escaped value**. Use **Raw HTML** only when that markup is trusted."
>
> **Dev:** "Does a **Streaming render** change the template's result?"
> **Domain expert:** "No. It preserves **Render** semantics while delivering the **Rendered HTML** in chunks."

## Flagged ambiguities

- “render” can mean either the act of producing HTML or the resulting HTML. Use **Render** for the act and **Rendered HTML** for its result.
- “attribute” can describe an HTML attribute or input passed to a **Component**. Use **Props** for component inputs and “HTML attribute” only for emitted markup.
- “raw” is overloaded between source text and intentionally unescaped markup. Use **Template source** for template text and **Raw HTML** for trusted verbatim output.
