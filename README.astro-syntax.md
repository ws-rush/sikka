# Astro Syntax Reference

## 1. File Structure

### Component Script (Frontmatter)

```astro
---
// 1. TypeScript interface declarations for Props
export interface Props { title: string; }
// 2. Exporting standard types
export type User = { id: string };
// 3. Hoisting functions vs const functions
function hoisted() { return "A"; }
const notHoisted = () => "B";
// 4. Exporting layout props
export const layoutProps = { theme: "dark" };
// 5. Using Node process
const apiKey = process.env.SECRET_KEY;
// 6. Declaring global variables
declare global { var customVar: number; }
// 7. Reading file system (Node APIs)
import fs from 'node:fs';
const file = fs.readFileSync('data.json', 'utf8');
// 8. Throwing errors intentionally
if (!data) throw new Error("404");
// 9. Mutating globalThis
globalThis.cachedData = data;
---
```

### Component Template

```astro
<!-- 1. Unmatched quotes inside JS expressions -->
<div data={ x ? 'a"b' : "c'd" }></div>
<!-- 2. Multiline attributes -->
<div class="
  text-red
"></div>
<!-- 3. Dynamic tags capitalized -->
---
const Tag = "section";
---
<Tag></Tag>
<!-- 4. Dynamic tags lowercase (fails natively as HTML) -->
<!-- <tag></tag> -->
<!-- 5. JSX vs HTML comments (HTML-style comments will be included in browser DOM, while JS ones will be skipped) -->
{/* JS */} <!-- HTML -->
<!-- 6. Self-closing standard HTML -->
<div />
<!-- 7. DOCTYPE injection -->
<!DOCTYPE html>
<!-- 8. Whitespace preservation -->
<span>A</span> <span>B</span>
<!-- 9. Case-sensitive attributes -->
<svg viewBox="0 0 10 10"></svg>
<!-- 10. HTML entities in attributes -->
<div data-id="&amp;"></div>
<!-- 11. Non-standard attributes -->
<div mycustomattr="1"></div>
<!-- 12. Unescaped < or > in text -->
<span> 1 < 2 </span>
<!-- 13. Unquoted attributes -->
<div data-id={id}></div>
<!-- 14. Overlapping tags (invalid HTML, parsed linearly) -->
<b><i></b></i>
<!-- 15. Trailing slashes on components -->
<Header/>
```

---

## 2. Dynamic Expressions

### Strings & Numbers

```astro
<!-- 1. null / undefined / true / false (render nothing) -->
<div>{null} {undefined} {true} {false}</div>
<!-- 2. 0 (renders 0) -->
<div>{0}</div>
<!-- 3. NaN / Infinity -->
<div>{NaN} {Infinity} {-Infinity} {-0}</div>
<!-- 4. BigInt -->
<div>{100n}</div>
<!-- 5. Escaping <, >, &, "' -->
<div>{"<"} {">"} {"&"} {"\"'"}</div>
<!-- 6. IIFE returning string -->
<div>{(() => "A")()}</div>
<!-- 7. String interpolation with HTML tags inside -->
<div>{`<b>${val}</b>`}</div> <!-- Escaped automatically -->
<!-- 8. Objects -->
<div>{{ a: 1 }}</div> <!-- [object Object] -->
<!-- 9. Functions -->
<div>{() => {}}</div> <!-- Function code -->
```

### Template Literals & Logic

```astro
<!-- 1. Nested and escaped braces -->
<div>{ { a: 1 }.a } { "{" }</div>
<!-- 2. String fallback -->
<div>{ false || "x" }</div>
<!-- 3. Ternary components -->
<div>{ x ? <A/> : <B/> }</div>
<!-- 4. Nullish coalescing -->
<div>{ a ?? b }</div>
<!-- 5. Nested template literals -->
<div>{ `a ${`b`} c` }</div>
<!-- 6. 0 && element -->
<div>{ 0 && <A/> }</div> <!-- Renders 0 -->
<!-- 7. Complex conditional && and || -->
<div>{ a && b || c }</div>
<!-- 8. Calling functions returning components -->
<div>{ renderHeader() }</div>
<!-- 9. Switch statements via IIFE -->
<div>{ (() => { switch(x) { case 1: return <A/>; } })() }</div>
<!-- 10. try/catch in IIFE -->
<div>{ (() => { try { return x(); } catch { return "e"; } })() }</div>
<!-- 11. Bitwise operators -->
<div>{ a & b }</div>
<!-- 12. Object spread in logic -->
<div>{ { ...obj }.key }</div>
```

### Arrays (Mapping)

```astro
<!-- 1. Nested arrays -->
<div>{ [['a'], ['b']] }</div>
<!-- 2. Arrays with null/undef/bools -->
<div>{ [true, null, 'a'] }</div>
<!-- 3. Returning fragments -->
<div>{ arr.map(i => <><p>{i}</p></>) }</div>
<!-- 4. Returning nested arrays of elements -->
<div>{ arr.map(i => [<p>{i.A}</p>, <b>{i.B}</b>]) }</div>
<!-- 5. Multiple root elements -->
<div>{ arr.map(i => [<h1>1</h1>, <h2>2</h2>]) }</div>
<!-- 6. Filter map chains -->
<div>{ arr.filter(i => i).map(i => <p>{i}</p>) }</div>
<!-- 7. Sparse arrays -->
<div>{ [1, , 3] }</div>
<!-- 8. Array index usage -->
<div>{ arr.map((i, idx) => <p data-idx={idx}>{i}</p>) }</div>
<!-- 9. Mapping over Sets -->
<div>{ [...new Set([1])].map(i => i) }</div>
<!-- 10. Returning conditional elements -->
<div>{ arr.map(i => i ? <A/> : null) }</div>
<!-- 11. Mixed numbers and strings -->
<div>{ [1, "a", 2, "b"] }</div>
```

---

## 3. Element and Component Rendering

### Fragments

```astro
<!-- 1. set:html on Fragment -->
<Fragment set:html="<b>3</b>" />
<!-- 2. set:text on Fragment -->
<Fragment set:text="4" />
<!-- 3. slot on Fragment -->
<Fragment slot="head"></Fragment>
<!-- 4. Nested Fragments -->
<><></></>
<!-- 5. Only JS -->
<>{val}</>
<!-- 6. Fragments around SVG tags -->
<svg><><path/></></svg>
<!-- 7. Fragments with table rows -->
<table><tbody><><tr></tr></></tbody></table>
<!-- 8. Attributes on <> (Compile Error) -->
<!-- < id="1"></> -->
<!-- 9. Directives on <> (Compile Error) -->
<!-- < client:load></> -->
<!-- 10. Fragment inside <head> -->
<head><><title>7</title></></head>
<!-- 11. Fragment inside <script> (Fails) -->
<script>/* <></> */</script>
<!-- 12. Mixed native tags and components -->
<><div/><Header/></>
```

### Props Spreading

```astro
<!-- 1. Overriding spread -->
<div {...props} id="x"></div>
<!-- 2. Spread overridden -->
<div id="x" {...props}></div>
<!-- 3. Spreading null / booleans -->
<div {...null} {...true}></div>
<!-- 4. Spreading arrays (indexes become keys) -->
<div {...['a']}></div> <!-- data-0="a" -->
<!-- 5. Conditional spreading -->
<div {...(x ? props : {})}></div>
<!-- 6. Component spreading -->
<Header {...props} />
<!-- 7. Spreading class:list -->
<div {...{ 'class:list': ['a'] }}></div>
<!-- 8. Spreading set:html -->
<div {...{ 'set:html': '<b>b</b>' }}></div>
<!-- 9. Spreading style object -->
<div {...{ style: { color: 'red' } }}></div>
<!-- 10. Rest props spreading -->
---
const { a, ...rest } = Astro.props;
---
<div {...rest}></div>
<!-- 11. Spreading object with getters -->
<div {...{ get a() { return 1; } }}></div>
```

---

## 4. Built-in Directives

### `class:list`

```astro
<!-- 1. Object with bool keys -->
<div class:list={{ a: true }} />
<!-- 2. Set object -->
<div class:list={new Set(['a'])} />
<!-- 3. Null/undef/false/0 in array -->
<div class:list={['a', null, false, 0]} />
<!-- 4. Deeply nested arrays -->
<div class:list={['a', [['b']]]} />
<!-- 5. Duplicate classes -->
<div class:list={['a', 'a']} />
<!-- 6. Falsy top-level -->
<div class:list={false} />
<!-- 7. Combining with class -->
<div class="x" class:list={['y']} />
<!-- 8. Combining with className -->
<div className="x" class:list={['y']} />
<!-- 9. Dynamic string templates -->
<div class:list={[`bg-${color}`]} />
<!-- 10. Truthy non-booleans in object -->
<div class:list={{ a: 1, b: "yes" }} />
<!-- 11. Mutating array inline -->
<div class:list={arr.push('a') && arr} />
```

### `style` Object

```astro
<!-- 1. CamelCase properties -->
<div style={{ backgroundColor: "blue" }} />
<!-- 2. CSS variables -->
<div style={{ "--custom": "10px" }} />
<!-- 3. Numeric values (no auto px) -->
<div style={{ zIndex: 99 }} />
<!-- 4. Null/undef values -->
<div style={{ color: null }} />
<!-- 5. Combined with style string -->
<div style="margin:0" style={{ padding: 0 }} />
<!-- 6. Quotes in values -->
<div style={{ fontFamily: '"Inter"' }} />
<!-- 7. !important -->
<div style={{ color: "red !important" }} />
<!-- 8. Vendor prefixes -->
<div style={{ WebkitTransform: "none" }} />
<!-- 9. Dynamic keys -->
<div style={{ [key]: "red" }} />
<!-- 10. Spreading styles -->
<div style={{ ...base, color: "red" }} />
<!-- 11. Object toString -->
<div style={{ toString: () => "color:red" }} />
```

### `set:html` and `set:text`

```astro
<!-- 1. set:html null / set:text undef -->
<div set:html={null} set:text={undefined} />
<!-- 2. set:html + set:text (Error) -->
<!-- <div set:html="a" set:text="b" /> -->
<!-- 3. set:html + children (Error) -->
<!-- <div set:html="a">b</div> -->
<!-- 4. set:html on Fragment -->
<Fragment set:html="4" />
<!-- 5. set:html with script tags -->
<div set:html={"<script>alert()</script>"} />
<!-- 6. set:html with style tags -->
<div set:html={"<style>body{}</style>"} />
<!-- 7. set:html with Arrays / boolean / Object -->
<div set:html={['a','b']} />
<div set:html={true} />
<div set:html={{}} />
<!-- 8. set:html on template -->
<template set:html="5" />
<!-- 9. set:html bypassing XSS -->
<div set:html={userProvidedUnsafeString} />
```

### `is:raw` and `is:inline`

```astro
<!-- 1. is:inline on script -->
<script is:inline>console.log(1);</script>
<!-- 2. is:inline on style -->
<style is:inline>body{}</style>
<!-- 3. is:raw on div -->
<div is:raw>{val}</div>
<!-- 4. is:raw on markdown -->
<Code is:raw>{code}</Code>
<!-- 5. is:raw with HTML tags -->
<div is:raw><p>text</p></div>
<!-- 6. is:raw with components -->
<div is:raw><Header/></div>
<!-- 7. is:raw on Fragment (Error) -->
<!-- <Fragment is:raw></Fragment> -->
<!-- 8. Nested is:raw -->
<div is:raw><span is:raw></span></div>
<!-- 9. is:inline style with import -->
<style is:inline>@import 'a.css';</style>
<!-- 10. is:raw rendering verbatim text -->
<div is:raw> verbatim </div>
```

---

## 5. Slots

### Default and Named Slots

```astro
<!-- 1. Dynamic slot name -->
<slot name={name}/>
<!-- 2. Passing named -->
<Comp><div slot="x">B</div></Comp>
<!-- 3. Dynamic slot assign -->
<Comp><div slot={name}>C</div></Comp>
<!-- 4. Multiple to same named -->
<Comp><div slot="x">1</div><div slot="x">2</div></Comp>
<!-- 5. slot on Component -->
<Comp><Header slot="x"/></Comp>
<!-- 6. slot on Fragment -->
<Comp><Fragment slot="x">D</Fragment></Comp>
<!-- 7. JSX passed -->
<Comp><div slot="x">{val}</div></Comp>
<!-- 8. Out of order -->
<Comp>1<div slot="x">2</div>3</Comp>
<!-- 9. Unused slots passed (discarded) -->
<Comp><div slot="unknown"></div></Comp>
<!-- 10. Slot forwarding -->
<slot name="x" slot="y"/>
<!-- 11. Names with spaces / hyphens / numbers -->
<slot name="a b"/>
<slot name="a-b"/>
<slot name="1"/>
```

### Fallback Content

```astro
<!-- 1. Component fallback -->
<slot><Header/></slot>
<!-- 2. Fragment overriding -->
<Comp><></Comp>
<!-- 3. Conditional overriding -->
<Comp>{x && <div></div>}</Comp>
<!-- 4. Null / Undefined overriding -->
<Comp>{null}</Comp>
<!-- 5. Fallback with slot -->
<slot name="a"><slot name="b"/></slot>
<!-- 6. Mixed text and element -->
<slot>Text <b>Bold</b></slot>
<!-- 7. Empty string / Whitespace overriding -->
<Comp>{""}</Comp>
<Comp> </Comp>
<!-- 8. Multiple roots fallback -->
<slot><h1>1</h1><h2>2</h2></slot>
<!-- 9. Nested fallbacks -->
<slot><slot>A</slot></slot>
<!-- 10. Loop fallback -->
<slot>{arr.map(i => <p>{i}</p>)}</slot>
<!-- 11. Throwing error fallback -->
<slot>{(() => { throw "err"; })()}</slot>
```

---

## 6. The `Astro` Global

### `Astro.props`

```astro
---
// 1. Default destructuring
const { a = 1 } = Astro.props;
// 2. Rest props
const { a, ...rest } = Astro.props;
// 3. Access undefined
const b = Astro.props.unknown;
// 4. Implicit boolean
const isTrue = Astro.props.active; // <Comp active />
// 5. Symbols as prop keys
const s = Astro.props[Symbol.for('key')];
// 6. Dashed names
const data = Astro.props['data-val'];
// 7. Overriding locally
Astro.props.a = 2; // mutating
// 8. class vs className
const cls = Astro.props.class;
// 9. Components
const Icon = Astro.props.icon;
// 10. Zod validation
const validated = schema.parse(Astro.props);
// 11. Dynamic accessing
const val = Astro.props[dynamicKey];
---
```
