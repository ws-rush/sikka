/**
 * Compiler
 *
 * Transforms a TemplateAST into a RenderFunction JS closure.
 *
 * Strategy:
 *   1. Walk the AST and emit a JS function body string
 *   2. Inject frontmatter source so props are in scope
 *   3. Emit __escape(expr) for ExpressionNode values
 *   4. Emit verbatim content for ScriptNode and StyleNode
 *   5. Substitute SlotNode with slot content from the `slots` argument
 *   6. Use new AsyncFunction(...) to support await in frontmatter
 *   7. Recursively resolve component imports via FileReader
 *   8. Detect circular dependencies via an in-progress path set
 */

import { escapeHtml, RawHtml } from './escape.js';
import { parse, VOID_ELEMENTS } from './parser.js';
import type {
  TemplateAST,
  TemplateNode,
  ElementNode,
  AttrNode,
  SpreadAttrNode,
  CompileResult,
  CompileError,
  RenderFunction,
  FileReader,
  ComponentImport,
} from './types.js';

interface CompileOptions {
  /** Resolved component render functions keyed by local name. */
  components?: Record<string, RenderFunction>;
  /** Custom name for the props variable (default: "Astro"). */
  varName?: string;
  /** Whether to automatically escape HTML. Default: true. */
  autoEscape?: boolean;
  /** Whether to automatically filter values. */
  autoFilter?: boolean;
  /** Custom filter function. */
  filterFunction?: (val: unknown) => unknown;
  /** Whether to enable debug mode. */
  debug?: boolean;
}

type ClassListArg = string | Record<string, unknown> | ClassListArg[] | null | undefined | boolean;
type StyleObjectArg =
  | string
  | Record<string, string | number | null | undefined>
  | null
  | undefined;

// ─── Component resolution ─────────────────────────────────────────────────────

type ResolveResult =
  | { ok: true; components: Record<string, RenderFunction> }
  | { ok: false; error: CompileError };

/**
 * Recursively resolve and compile all component imports in an AST.
 */
async function resolveComponents(
  imports: ComponentImport[],
  fileReader: FileReader,
  basePath: string,
  inProgress: Set<string> = new Set()
): Promise<ResolveResult> {
  const components: Record<string, RenderFunction> = {};

  for (const imp of imports) {
    const resolvedPath = resolvePath(basePath, imp.specifier);

    if (inProgress.has(resolvedPath)) {
      const cycle = [...inProgress, resolvedPath];
      return {
        ok: false,
        error: {
          message: `Circular component dependency detected: ${cycle.join(' → ')}`,
          specifier: imp.specifier,
          cycle,
        },
      };
    }

    let source: string;
    try {
      source = await fileReader(resolvedPath);
    } catch {
      return {
        ok: false,
        error: {
          message: `Cannot resolve component: ${imp.specifier}`,
          specifier: imp.specifier,
        },
      };
    }

    const parseResult = parse(source);
    if (!parseResult.ok) {
      return {
        ok: false,
        error: {
          message: `Parse error in component ${imp.specifier}: ${parseResult.error.message}`,
          specifier: imp.specifier,
        },
      };
    }

    const childInProgress = new Set([...inProgress, resolvedPath]);
    const childResult = await resolveComponents(
      parseResult.ast.imports,
      fileReader,
      resolvedPath,
      childInProgress
    );
    if (!childResult.ok) {
      return childResult;
    }

    const compileResult = compileAST(parseResult.ast, { components: childResult.components });
    if (!compileResult.ok) {
      return { ok: false, error: compileResult.error };
    }

    components[imp.localName] = compileResult.fn;
  }

  return { ok: true, components };
}

/**
 * Higher-level compile entry point: resolves component imports then compiles the AST.
 */
export async function compile(
  ast: TemplateAST,
  options?: CompileOptions & { fileReader?: FileReader; basePath?: string }
): Promise<CompileResult> {
  let components = options?.components ?? {};

  if (ast.imports.length > 0) {
    const fileReader = options?.fileReader;
    if (!fileReader) {
      const first = ast.imports[0];
      return {
        ok: false,
        error: {
          message: `Cannot resolve component: ${first.specifier} (no fileReader provided)`,
          specifier: first.specifier,
        },
      };
    }

    const basePath = options?.basePath ?? '';
    const result = await resolveComponents(ast.imports, fileReader, basePath);
    if (!result.ok) {
      return result;
    }
    components = { ...result.components, ...components };
  }

  return compileAST(ast, { ...options, components });
}

function resolvePath(basePath: string, specifier: string): string {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return specifier;
  }
  const lastSlash = basePath.lastIndexOf('/');
  const baseDir = lastSlash >= 0 ? basePath.slice(0, lastSlash) : '';
  const joined = baseDir ? `${baseDir}/${specifier}` : specifier;
  return normalisePath(joined);
}

function normalisePath(path: string): string {
  const parts = path.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  const prefix = path.startsWith('/') ? '/' : '';
  return prefix + resolved.join('/');
}

async function __dummyAsync() {}
__dummyAsync();
const AsyncFunction = __dummyAsync.constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

/**
 * Compile a TemplateAST into a RenderFunction.
 */
export function compileAST(ast: TemplateAST, options?: CompileOptions): CompileResult {
  try {
    const components = options?.components ?? {};
    const body = buildFunctionBody(ast, components, options);

    const asyncFn = new AsyncFunction(
      'props',
      'slots',
      '__escape',
      '__RawHtml',
      '__components',
      '__classList',
      '__styleObject',
      '__filter',
      body
    );

    const classListHelper = (arg: ClassListArg): string => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Set) return Array.from(arg).join(' ');
      if (Array.isArray(arg)) return arg.map(classListHelper).filter(Boolean).join(' ');
      if (arg && typeof arg === 'object') {
        return Object.entries(arg)
          .filter(([_, v]) => v)
          .map(([k]) => k)
          .join(' ');
      }
      return '';
    };

    const styleObjectHelper = (arg: StyleObjectArg): string => {
      if (typeof arg === 'string') return arg;
      if (arg && typeof arg === 'object') {
        if (typeof arg.toString === 'function' && arg.toString !== Object.prototype.toString) {
          return arg.toString();
        }
        return Object.entries(arg)
          .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`)
          .join(';');
      }
      return '';
    };

    const filterHelper = options?.autoFilter
      ? options.filterFunction || ((v: unknown) => v)
      : (v: unknown) => v;

    const renderFn: RenderFunction = (
      props: Record<string, unknown>,
      slots?: Record<string, string>
    ): string => {
      return asyncFn(
        props,
        slots ?? {},
        escapeHtml,
        RawHtml,
        components,
        classListHelper,
        styleObjectHelper,
        filterHelper
      ).catch((err: unknown) => {
        if (options?.debug) {
          throw new Error(`Runtime Error: ${err instanceof Error ? err.message : String(err)}`);
        }
        throw err;
      }) as unknown as string;
    };

    return { ok: true, fn: renderFn };
  } catch (err) {
    return {
      ok: false,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }
}

function buildFunctionBody(
  ast: TemplateAST,
  components: Record<string, RenderFunction>,
  options?: CompileOptions
): string {
  const lines: string[] = [];
  const varName = options?.varName || 'Astro';

  lines.push('let __out = "";');
  lines.push('');
  lines.push(
    `const ${varName} = { props, slots: { ...slots, render: async (name) => slots[name] || "" } };`
  );
  lines.push('with (props) {');
  lines.push('');

  for (const imp of ast.imports) {
    lines.push(`const ${imp.localName} = __components[${JSON.stringify(imp.localName)}];`);
  }

  if (ast.frontmatter.source.trim()) {
    lines.push('// --- frontmatter ---');
    const cleanFM = ast.frontmatter.source
      .replace(/^\s*import\s+.*from\s+['"].*['"];?\s*$/gm, '')
      .replace(/^\s*export\s+/gm, '')
      .replace(
        /:\s*(string|number|boolean|any|object|unknown|never|void|undefined|null)(\[\])?/g,
        ''
      )
      .replace(/^\s*(interface|type)\s+.*$/gm, '');
    lines.push(cleanFM);
    lines.push('');
  }

  lines.push('// --- template body ---');
  for (const node of ast.body) {
    for (const l of emitNode(node, components, options)) {
      lines.push(l);
    }
  }

  lines.push('');
  lines.push('} // end with(props)');
  lines.push('');
  lines.push('return __out;');

  return lines.join('\n');
}

function emitNode(
  node: TemplateNode,
  components: Record<string, RenderFunction>,
  options?: CompileOptions
): string[] {
  switch (node.type) {
    case 'text':
      return emitText(node.value);

    case 'expression': {
      const source = transformExpression(node.source);
      if (/^\s*(\/\*[\s\S]*\*\/|\/\/.*)\s*$/.test(source)) {
        return [];
      }
      let expr = `__filter(await (${source}))`;
      if (options?.autoEscape !== false) {
        expr = `__escape(${expr})`;
      }
      return [`__out += ${expr};`];
    }

    case 'element':
      return emitElement(node, components, options);

    case 'slot': {
      const slotName = node.name || 'default';
      const slotNameKey = JSON.stringify(slotName);
      const lines: string[] = [];

      lines.push(`if (slots[${slotNameKey}] !== undefined) {`);
      lines.push(`  __out += slots[${slotNameKey}];`);
      lines.push(
        `} else if (slots[${JSON.stringify('')}] !== undefined && ${JSON.stringify(slotName)} === "default") {`
      );
      lines.push(`  __out += slots[${JSON.stringify('')}];`);
      if (node.children.length > 0) {
        lines.push(`} else {`);
        for (const child of node.children) {
          lines.push(...emitNode(child, components, options).map((l) => '  ' + l));
        }
      }
      lines.push(`}`);
      return lines;
    }

    case 'script': {
      const lines: string[] = [`__out += "<script";`];
      for (const attr of node.attrs) {
        lines.push(...emitAttr(attr));
      }
      lines.push(`__out += ">" + ${JSON.stringify(node.content)} + "</script>";`);
      return lines;
    }

    case 'style': {
      const lines: string[] = [`__out += "<style";`];
      for (const attr of node.attrs) {
        lines.push(...emitAttr(attr));
      }
      lines.push(`__out += ">" + ${JSON.stringify(node.content)} + "</style>";`);
      return lines;
    }

    case 'raw':
      return [`__out += ${JSON.stringify(node.html)};`];

    default:
      throw new Error(`Unknown node type: ${(node as { type: string }).type}`);
  }
}

function emitText(value: string): string[] {
  if (!value) return [];
  return [`__out += ${JSON.stringify(value)};`];
}

function emitElement(
  node: ElementNode,
  components: Record<string, RenderFunction>,
  options?: CompileOptions
): string[] {
  const lines: string[] = [];

  if (!node.tag || node.tag === 'Fragment') {
    let setHtml: AttrNode | undefined;
    let setText: AttrNode | undefined;

    for (const attr of node.attrs) {
      if (!('type' in attr)) {
        if (attr.name === 'set:html') setHtml = attr;
        if (attr.name === 'set:text') setText = attr;
      }
    }

    if (setHtml) {
      if (typeof setHtml.value === 'string') {
        lines.push(`__out += ${JSON.stringify(setHtml.value)};`);
      } else if (setHtml.value !== true) {
        lines.push(
          `{ const __h = await (${transformExpression(setHtml.value.source)}); __out += [].concat(__h).join(""); }`
        );
      }
    } else if (setText) {
      if (typeof setText.value === 'string') {
        lines.push(`__out += __escape(${JSON.stringify(setText.value)});`);
      } else if (setText.value !== true) {
        lines.push(`__out += __escape(await ${transformExpression(setText.value.source)});`);
      }
    } else {
      for (const child of node.children) {
        lines.push(...emitNode(child, components, options));
      }
    }
    return lines;
  }

  const isCapitalized = /^[A-Z]/.test(node.tag);
  if (node.tag in components || isCapitalized) {
    return emitComponentCall(node, components, options);
  }

  let setHtml: AttrNode | undefined;
  let setText: AttrNode | undefined;

  const standardAttrs: (AttrNode | SpreadAttrNode)[] = [];
  for (const attr of node.attrs) {
    if (!('type' in attr)) {
      if (attr.name === 'set:html') {
        setHtml = attr;
        continue;
      }
      if (attr.name === 'set:text') {
        setText = attr;
        continue;
      }
    }
    standardAttrs.push(attr);
  }

  lines.push(`__out += ${JSON.stringify('<' + node.tag)};`);

  lines.push(`{`);
  lines.push(`  const __attrs = {};`);
  lines.push(`  const __classes = [];`);
  lines.push(`  const __styles = [];`);
  for (const attr of standardAttrs) {
    if ('type' in attr) {
      lines.push(`  {`);
      lines.push(`    const __s = await (${transformExpression(attr.expression)});`);
      lines.push(`    for (const __k in __s) {`);
      lines.push(`      if (__k === "class" || __k === "className" || __k === "class:list") {`);
      lines.push(
        `        __classes.push(__k === "class:list" ? __classList(__s[__k]) : __s[__k]);`
      );
      lines.push(`      } else if (__k === "style") {`);
      lines.push(`        const __v = __s[__k];`);
      lines.push(`        if (typeof __v === "string") __styles.push(__v);`);
      lines.push(`        else __styles.push(__styleObject(__v));`);
      lines.push(`      } else {`);
      lines.push(`        __attrs[__k] = __s[__k];`);
      lines.push(`      }`);
      lines.push(`    }`);
      lines.push(`  }`);
    } else {
      if (attr.name === 'class' || attr.name === 'className' || attr.name === 'class:list') {
        if (attr.value === true) lines.push(`  __classes.push("");`);
        else if (typeof attr.value === 'string')
          lines.push(`  __classes.push(${JSON.stringify(attr.value)});`);
        else
          lines.push(`  __classes.push(__classList(${transformExpression(attr.value.source)}));`);
      } else if (attr.name === 'style') {
        if (attr.value === true) lines.push(`  __styles.push("");`);
        else if (typeof attr.value === 'string')
          lines.push(`  __styles.push(${JSON.stringify(attr.value)});`);
        else
          lines.push(`  __styles.push(__styleObject(${transformExpression(attr.value.source)}));`);
      } else {
        if (attr.value === true) lines.push(`  __attrs[${JSON.stringify(attr.name)}] = true;`);
        else if (typeof attr.value === 'string')
          lines.push(
            `  __attrs[${JSON.stringify(attr.name)}] = new __RawHtml(${JSON.stringify(attr.value)});`
          );
        else
          lines.push(
            `  __attrs[${JSON.stringify(attr.name)}] = await (${transformExpression(attr.value.source)});`
          );
      }
    }
  }

  lines.push(`  for (const __k in __attrs) {`);
  lines.push(`    const __v = __attrs[__k];`);
  lines.push(`    if (__v === true) __out += " " + __escape(__k);`);
  lines.push(
    `    else if (__v !== false && __v != null) __out += " " + __escape(__k) + '="' + __escape(__v) + '"';`
  );
  lines.push(`  }`);
  lines.push(`  const __finalCls = __classes.filter(Boolean).join(' ');`);
  lines.push(`  if (__finalCls) __out += ' class="' + __escape(__finalCls) + '"';`);
  lines.push(
    `  const __finalSty = __styles.map(s => typeof s === "string" ? s.trim().replace(/;$/, "") : s).filter(Boolean).join(';');`
  );
  lines.push(`  if (__finalSty) __out += ' style="' + __escape(__finalSty) + '"';`);
  lines.push(`}`);

  const isVoid = VOID_ELEMENTS.has(node.tag) || node.tag.startsWith('!');
  if (isVoid) {
    if (node.tag.startsWith('!')) lines.push(`__out += ">";`);
    else lines.push(`__out += " />";`);
    return lines;
  }

  lines.push(`__out += ">";`);

  if (setHtml) {
    if (setText) throw new Error('Cannot use both set:html and set:text');
    if (node.children.length > 0) throw new Error('Cannot use set:html with children');
    if (typeof setHtml.value === 'string') {
      lines.push(`__out += ${JSON.stringify(setHtml.value)};`);
    } else if (setHtml.value !== true) {
      lines.push(
        `{ const __h = await (${transformExpression(setHtml.value.source)}); __out += [].concat(__h).join(""); }`
      );
    }
  } else if (setText) {
    if (node.children.length > 0) throw new Error('Cannot use set:text with children');
    if (typeof setText.value === 'string') {
      lines.push(`__out += __escape(${JSON.stringify(setText.value)});`);
    } else if (setText.value !== true) {
      lines.push(`__out += __escape(await ${transformExpression(setText.value.source)});`);
    }
  } else {
    for (const child of node.children) {
      lines.push(...emitNode(child, components, options));
    }
  }

  if (!isVoid) {
    lines.push(`__out += ${JSON.stringify('</' + node.tag + '>')};`);
  }

  return lines;
}

function emitAttr(attr: AttrNode | SpreadAttrNode): string[] {
  if ('type' in attr) {
    return [
      `{`,
      `  const __spread = await (${transformExpression(attr.expression)});`,
      `  for (const __k in __spread) {`,
      `    const __val = __spread[__k];`,
      `    if (__k === "class:list") {`,
      `      __out += " class=\\"" + __escape(__classList(__val)) + "\\"";`,
      `    } else if (__k === "style" && typeof __val === "object") {`,
      `      __out += " style=\\"" + __escape(__styleObject(__val)) + "\\"";`,
      `    } else if (__val === true) {`,
      `      __out += " " + __escape(__k);`,
      `    } else if (__val !== false && __val != null) {`,
      `      __out += " " + __escape(__k) + '="' + __escape(__val) + '"';`,
      `    }`,
      `  }`,
      `}`,
    ];
  }

  if (attr.value === true) {
    return [`__out += ${JSON.stringify(' ' + attr.name)};`];
  }

  if (typeof attr.value === 'string') {
    return [`__out += ${JSON.stringify(' ' + attr.name + '="' + attr.value + '"')};`];
  }

  const source = transformExpression(attr.value.source);

  if (attr.name === 'class:list') {
    return [`__out += " class=\\"" + __escape(__classList(${source})) + "\\"";`];
  }

  if (attr.name === 'style') {
    return [`__out += " style=\\"" + __escape(__styleObject(${source})) + "\\"";`];
  }

  return [`__out += " " + ${JSON.stringify(attr.name)} + '="' + __escape(${source}) + '"';`];
}

function emitComponentCall(
  node: ElementNode,
  components: Record<string, RenderFunction>,
  options?: CompileOptions
): string[] {
  const lines: string[] = [];
  const localName = node.tag;

  const propParts: string[] = [];
  for (const attr of node.attrs) {
    if ('type' in attr) {
      propParts.push(`...(${transformExpression(attr.expression)})`);
    } else {
      if (attr.value === true) {
        propParts.push(`${JSON.stringify(attr.name)}: true`);
      } else if (typeof attr.value === 'string') {
        propParts.push(`${JSON.stringify(attr.name)}: ${JSON.stringify(attr.value)}`);
      } else {
        const source = transformExpression(attr.value.source);
        if (attr.name === 'class:list') {
          propParts.push(`"class:list": (${source})`);
        } else {
          propParts.push(`${JSON.stringify(attr.name)}: (${source})`);
        }
      }
    }
  }

  const propsExpr = `{${propParts.join(', ')}}`;

  lines.push(`{`);
  lines.push(`  let __component = __components[${JSON.stringify(localName)}];`);
  lines.push(
    `  try { if (!__component && typeof ${localName} !== 'undefined') __component = ${localName}; } catch (e) {}`
  );
  lines.push(`  if (typeof __component === 'function') {`);
  lines.push(`    const __childSlots = {};`);

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    let slotName: string;
    if (child.type === 'element') {
      const slotAttr = child.attrs.find((a): a is AttrNode => !('type' in a) && a.name === 'slot');
      if (slotAttr) {
        if (typeof slotAttr.value === 'string') {
          slotName = JSON.stringify(slotAttr.value);
        } else if (slotAttr.value !== true) {
          slotName = transformExpression(slotAttr.value.source);
        } else {
          slotName = JSON.stringify('');
        }
        child.attrs = child.attrs.filter((a) => a !== slotAttr);
      } else {
        slotName = JSON.stringify('');
      }
    } else {
      slotName = JSON.stringify('');
    }

    const varName = `__slot_${i}`;
    lines.push(`  let ${varName} = "";`);
    const childLines = emitNode(child, components, options);
    for (const l of childLines) {
      lines.push('  ' + l.replace(/__out\b/g, varName));
    }

    lines.push(`  {`);
    lines.push(`    const __sname = ${slotName};`);
    lines.push(`    if (!__childSlots[__sname]) __childSlots[__sname] = "";`);
    lines.push(`    __childSlots[__sname] += ${varName};`);
    lines.push(`    if (__sname === "") {`);
    lines.push(`      if (!__childSlots["default"]) __childSlots["default"] = "";`);
    lines.push(`      __childSlots["default"] += ${varName};`);
    lines.push(`    }`);
    lines.push(`  }`);
  }

  lines.push(`    __out += await __component(${propsExpr}, __childSlots);`);
  lines.push(`  } else if (typeof __component === 'string') {`);
  lines.push(`    __out += "<" + __component;`);
  for (const attr of node.attrs) {
    lines.push(...emitAttr(attr).map((l) => '    ' + l));
  }
  lines.push(`    __out += ">";`);
  for (const child of node.children) {
    lines.push(...emitNode(child, components, options).map((l) => '    ' + l));
  }
  lines.push(`    __out += "</" + __component + ">";`);
  lines.push(`  } else {`);
  lines.push(`    __out += "<${localName}";`);
  for (const attr of node.attrs) {
    lines.push(...emitAttr(attr).map((l) => '    ' + l));
  }
  if (node.selfClosing) {
    lines.push(`    __out += " />";`);
  } else {
    lines.push(`    __out += ">";`);
    for (const child of node.children) {
      lines.push(...emitNode(child, components, options).map((l) => '    ' + l));
    }
    lines.push(`    __out += "</${localName}>";`);
  }
  lines.push(`  }`);
  lines.push(`}`);

  return lines;
}

function transformExpression(source: string): string {
  return source;
}
