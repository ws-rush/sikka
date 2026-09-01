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
  props: { [key: string]: PortableValue };
  expectedHtml: string;
  modes: readonly SyntaxContractMode[];
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
    modes: ['source'],
    streaming: 'same-html',
  },
];

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
    isPortableRecord(case_.props) &&
    typeof case_.expectedHtml === 'string' &&
    isModes(case_.modes) &&
    (case_.streaming === undefined || case_.streaming === 'same-html')
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
