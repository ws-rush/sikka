export type PortableValue =
  | null
  | boolean
  | number
  | string
  | PortableValue[]
  | { [key: string]: PortableValue };

export type SyntaxContractMode = 'source' | 'precompiled';

export interface SyntaxContractCase {
  id: string;
  template: string;
  components?: { readonly [request: string]: string };
  props: { [key: string]: PortableValue };
  expectedHtml: string;
  modes: readonly SyntaxContractMode[];
  autoEscape?: boolean;
  streaming?: 'same-html';
}

export const syntaxContractCases: readonly SyntaxContractCase[] = [
  {
    id: 'ada-escaping-and-list',
    template: `---
const { name, items } = Astro.props;
---
<h1>Hello, {name}!</h1><ul>{items.map((item) => <li>{item}</li>)}</ul>`,
    props: {
      name: 'Ada & <Lin>',
      items: ['first & <second>', 'third'],
    },
    expectedHtml:
      '<h1>Hello, Ada &amp; &lt;Lin&gt;!</h1><ul><li>first &amp; &lt;second&gt;</li><li>third</li></ul>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'native-attribute-coercion',
    template: `---
const { value } = Astro.props;
---
<input disabled={null} data-x={null} /><input disabled={undefined} data-x={undefined} /><input disabled={false} data-x={false} /><input disabled={0} data-x={0} /><input disabled={""} data-x={""} /><input disabled={true} data-x={true} /><input disabled="yes" data-x={value} />`,
    props: { value: `a&"<'>` },
    expectedHtml:
      '<input /><input /><input data-x="false" /><input data-x="0" /><input disabled data-x /><input disabled data-x="true" /><input disabled data-x="a&amp;&quot;&lt;&#39;&gt;" />',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'custom-element-attribute-coercion',
    template: `---
const { value } = Astro.props;
---
<my-toggle selected={false} enabled={true} count={0} empty={""} label={value} />`,
    props: { value: `<&"'>` },
    expectedHtml:
      '<my-toggle selected="false" enabled="true" count="0" empty label="&lt;&amp;&quot;&#39;&gt;"></my-toggle>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'component-and-tag-classification',
    template: `---
import Box from './box.astro';
const Tag = 'my-toggle';
const div = 'ignored';
---
<Box label="self" /><Box label="child"><b>slot</b></Box><Tag selected={false} /><Tag enabled={true}>tag child</Tag><div>lowercase</div><Unbound x={false}>literal</Unbound>`,
    components: {
      './box.astro': '<section data-label={Astro.props.label}><slot /></section>',
    },
    props: {},
    expectedHtml:
      '<section data-label="self"></section><section data-label="child"><b>slot</b></section><my-toggle selected="false"></my-toggle><my-toggle enabled="true">tag child</my-toggle><div>lowercase</div><Unbound x="false">literal</Unbound>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'attribute-source-order-and-collisions',
    template: `---
const first = { id: "first", title: "first" };
const second = { id: "second", title: null };
const seen = [];
const left = { get id() { seen.push("left"); return "left"; } };
const right = { get id() { seen.push("right"); return "right"; } };
---
<div {...first} id="direct"></div><div id="direct" {...first}></div><div {...first} {...second}></div><div {...left} id={seen.push("direct") && "direct"} {...right} data-order={seen.join(",")}></div>`,
    props: {},
    expectedHtml:
      '<div id="direct" title="first"></div><div id="first" title="first"></div><div id="second"></div><div id="right" data-order="left,direct,right"></div>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'class-direct-before-spread',
    template: `---
const list = new Set(["set", false, ["set-nested"]]);
const spread = { class: "spread", "class:list": ["spread-list", { spreadObject: true, off: false }] };
---
<div class="direct&<" className="direct-name" class:list={["list", ["nested"], { object: true, omitted: false }, list]} {...spread}></div>`,
    props: {},
    expectedHtml:
      '<div class="direct&amp;&lt; direct-name list nested object set set-nested spread spread-list spreadObject"></div>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'class-spread-before-direct',
    template: `---
const spread = { class: "spread", className: "spread-name", "class:list": ["spread-list", { spreadObject: true }] };
---
<div {...spread} class="direct" className="direct-name" class:list={["list", ["nested"], { object: true, omitted: false }]}></div>`,
    props: {},
    expectedHtml:
      '<div class="spread spread-name spread-list spreadObject direct direct-name list nested object"></div>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'class-without-escaping',
    template: '<div class={Astro.props.name} class:list={Astro.props.list}></div>',
    props: { name: 'direct&<', list: ['list&<'] },
    expectedHtml: '<div class="direct&< list&<"></div>',
    modes: ['source', 'precompiled'],
    autoEscape: false,
    streaming: 'same-html',
  },
  {
    id: 'class-all-falsy-omitted',
    template: `---
const spread = { class: "", className: null, "class:list": [false, null, 0, {}] };
---
<div class={false} className={undefined} class:list={[false, [], {}]} {...spread}></div>`,
    props: {},
    expectedHtml: '<div></div>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'style-source-order-and-filtering',
    template: `---
const first = { style: { marginTop: 0, ignored: null, enabled: true, empty: "" } };
const second = { style: 'color:red;content:"<&;' };
---
<div style="display:block;" {...first} style={{ padding: 1 }} {...second} style={{ "--token": 0, hidden: false }} />`,
    props: {},
    expectedHtml:
      '<div style="display:block;margin-top:0;padding:1;color:red;content:&quot;&lt;&amp;;--token:0"></div>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'static-style-strings',
    template: '<div style="margin:0;" style=";padding:1px;;" />',
    props: {},
    expectedHtml: '<div style="margin:0;padding:1px"></div>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'style-without-auto-escaping',
    template: '<div style={Astro.props.value} />',
    props: { value: 'content:"<&' },
    expectedHtml: '<div style="content:"<&"></div>',
    modes: ['source', 'precompiled'],
    autoEscape: false,
    streaming: 'same-html',
  },
  {
    id: 'body-only-template',
    template: '<main>body</main>',
    props: {},
    expectedHtml: '<main>body</main>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'empty-frontmatter',
    template: '---\n---\n<main>body</main>',
    props: {},
    expectedHtml: '<main>body</main>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'frontmatter-local-setup',
    template: `---
const greeting = 'Hello';
function uppercase(value) { return value.toUpperCase(); }
---
{greeting}, {uppercase(Astro.props.name)}!`,
    props: { name: 'Ada' },
    expectedHtml: 'Hello, ADA!',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'root-content',
    template: 'before<div>middle</div>after',
    props: {},
    expectedHtml: 'before<div>middle</div>after',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'fragments-flatten',
    template: '<><span>left</span><Fragment><span>right</span></Fragment></>',
    props: {},
    expectedHtml: '<span>left</span><span>right</span>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'comment-and-declaration',
    template: '<!DOCTYPE html><!-- note --><main>body</main>',
    props: {},
    expectedHtml: '<!DOCTYPE html><!-- note --><main>body</main>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'element-and-asset-normalization',
    template:
      '<br><img src="image.png"><div /><script>const value = "<tag>";</script><style>.x { color: red; }</style>',
    props: {},
    expectedHtml:
      '<br /><img src="image.png" /><div></div><script>const value = "<tag>";</script><style>.x { color: red; }</style>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'whitespace-preserved',
    template: '<div>\n\t<span>body</span>\n</div>',
    props: {},
    expectedHtml: '<div>\n\t<span>body</span>\n</div>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'astro-props',
    template: '<p>{Astro.props.title}</p>',
    props: { title: 'Sikka' },
    expectedHtml: '<p>Sikka</p>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'astro-slots',
    template: '---\nimport Layout from "./layout.astro";\n---\n<Layout><b>content</b></Layout>',
    components: {
      './layout.astro':
        '<section>{Astro.slots.has("default") ? Astro.slots.render("default") : "none"}</section>',
    },
    props: {},
    expectedHtml: '<section><b>content</b></section>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'slot-routing-order-and-fallback',
    template: `---
import Layout from './layout.astro';
---
<Layout label="kept"><i>first</i><b slot="named">third</b><em slot="default">second</em><u slot="named">fourth</u><span slot="unused">hidden</span></Layout>`,
    components: {
      './layout.astro':
        '<section data-label={Astro.props.label}><slot /><slot name="named" /><slot name="missing">fallback</slot></section>',
    },
    props: {},
    expectedHtml:
      '<section data-label="kept"><i>first</i><em>second</em><b>third</b><u>fourth</u>fallback</section>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'slot-presence-suppresses-fallback',
    template: `---
import Empty from './empty.astro';
---
<Empty><Fragment></Fragment><Fragment slot="fragment"></Fragment><Fragment slot="null">{null}</Fragment><Fragment slot="undefined">{undefined}</Fragment><Fragment slot="empty">{""}</Fragment><Fragment slot="whitespace"> </Fragment></Empty>`,
    components: {
      './empty.astro':
        '<slot>default</slot>|<slot name="fragment">fragment</slot>|<slot name="null">null</slot>|<slot name="undefined">undefined</slot>|<slot name="empty">empty</slot>|<slot name="whitespace">whitespace</slot>',
    },
    props: {},
    expectedHtml: '||||| ',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'slot-forward-default-order',
    template: `---
import Middle from './middle.astro';
---
<Middle><i>first</i><b>second</b></Middle>`,
    components: {
      './middle.astro': "---\nimport Child from './child.astro';\n---\n<Child><slot /></Child>",
      './child.astro': '<main><slot>fallback</slot></main>',
    },
    props: {},
    expectedHtml: '<main><i>first</i><b>second</b></main>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'slot-forward-named',
    template: `---
import Middle from './middle.astro';
---
<Middle><i slot="header">first</i><b slot="header">second</b><em slot="aside">third</em></Middle>`,
    components: {
      './middle.astro':
        '---\nimport Child from \'./child.astro\';\n---\n<Child><slot name="header" slot="header" /><slot name="aside" slot="title" /></Child>',
      './child.astro':
        '<main><slot name="header">fallback</slot><slot name="title">fallback</slot></main>',
    },
    props: {},
    expectedHtml: '<main><i>first</i><b>second</b><em>third</em></main>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'slot-forward-absent',
    template: `---
import Middle from './middle.astro';
---
<Middle />`,
    components: {
      './middle.astro':
        '---\nimport Child from \'./child.astro\';\n---\n<Child><slot name="header" slot="title" /></Child>',
      './child.astro': '<main><slot name="title">fallback</slot></main>',
    },
    props: {},
    expectedHtml: '<main>fallback</main>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'slot-forward-dynamic',
    template: `---
import Middle from './middle.astro';
---
<Middle incoming={Astro.props.incoming} outgoing={Astro.props.outgoing}><b slot={Astro.props.incoming}>dynamic</b></Middle>`,
    components: {
      './middle.astro': `---
import Child from './child.astro';
const { incoming, outgoing } = Astro.props;
---
<Child><slot name={incoming} slot={outgoing} /></Child>`,
      './child.astro': '<main><slot name="target">fallback</slot></main>',
    },
    props: { incoming: 'source', outgoing: 'target' },
    expectedHtml: '<main><b>dynamic</b></main>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  expressionCase('expression-null', 'null', ''),
  expressionCase('expression-undefined', 'undefined', ''),
  expressionCase('expression-true', 'true', ''),
  expressionCase('expression-false', 'false', ''),
  expressionCase('expression-zero', '0', '0'),
  expressionCase('expression-negative-zero', '-0', '0'),
  expressionCase('expression-nan', 'NaN', 'NaN'),
  expressionCase('expression-positive-infinity', 'Infinity', 'Infinity'),
  expressionCase('expression-negative-infinity', '-Infinity', '-Infinity'),
  expressionCase('expression-bigint', '100n', '100'),
  expressionCase(
    'expression-array-flattening',
    "['a', [null, true, [false, 'b', , undefined]], 'c']",
    'abc'
  ),
  expressionCase('expression-object', '({ value: 1 })', '[object Object]'),
  {
    id: 'expression-function',
    template: `---
function expressionFunction() {}
---
<p>{expressionFunction}</p>`,
    props: {},
    expectedHtml: '<p>function expressionFunction() {}</p>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  {
    id: 'expression-string-escaping',
    template: '<p>{Astro.props.value}</p>',
    props: { value: '&<>"\'' },
    expectedHtml: '<p>&amp;&lt;&gt;&quot;&#39;</p>',
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  },
  expressionCase('expression-zero-and', "0 && '<span/>'", '0'),
  {
    id: 'expression-coercion-without-escaping',
    template: "<p>{[0, false, null, ['<i>', undefined], 'x']}</p>",
    props: {},
    expectedHtml: '<p>0<i>x</p>',
    modes: ['source', 'precompiled'],
    autoEscape: false,
    streaming: 'same-html',
  },
];

function expressionCase(id: string, expression: string, expected: string): SyntaxContractCase {
  return {
    id,
    template: `<p>{${expression}}</p>`,
    props: {},
    expectedHtml: `<p>${expected}</p>`,
    modes: ['source', 'precompiled'],
    streaming: 'same-html',
  };
}

export function validateSyntaxContractCases(cases: readonly unknown[]): void {
  const ids = new Set<string>();
  for (const value of cases) {
    if (!isSyntaxContractCase(value)) throw new Error('Invalid Syntax Contract case metadata');
    if (ids.has(value.id)) throw new Error(`Duplicate Syntax Contract case ID: ${value.id}`);
    ids.add(value.id);
  }
}

export function assertRenderedHtml(case_: SyntaxContractCase, actual: string): void {
  if (actual !== case_.expectedHtml) {
    throw new Error(`Syntax Contract case ${case_.id} rendered unexpected HTML`);
  }
}

function isSyntaxContractCase(value: unknown): value is SyntaxContractCase {
  if (!value || typeof value !== 'object') return false;
  const case_ = value as Partial<SyntaxContractCase>;
  return (
    typeof case_.id === 'string' &&
    /^[a-z][a-z0-9-]*$/.test(case_.id) &&
    typeof case_.template === 'string' &&
    (case_.components === undefined || isComponents(case_.components)) &&
    isPortableRecord(case_.props) &&
    typeof case_.expectedHtml === 'string' &&
    isModes(case_.modes) &&
    (case_.autoEscape === undefined || typeof case_.autoEscape === 'boolean') &&
    (case_.streaming === undefined || case_.streaming === 'same-html')
  );
}

function isComponents(value: unknown): value is { readonly [request: string]: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((source) => typeof source === 'string')
  );
}

function isModes(value: unknown): value is readonly SyntaxContractMode[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((mode) => mode === 'source' || mode === 'precompiled') &&
    new Set(value).size === value.length
  );
}

function isPortableRecord(value: unknown): value is { [key: string]: PortableValue } {
  return !!value && typeof value === 'object' && !Array.isArray(value) && isPortableValue(value);
}

function isPortableValue(value: unknown): value is PortableValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPortableValue);
  if (!value || typeof value !== 'object' || !isPortableObject(value)) return false;
  return Object.values(value).every(isPortableValue);
}

function isPortableObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
