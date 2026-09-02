/**
 * Compiler
 */

import { escapeHtml, RawHtml, stringifyHtml } from './escape.js';
import { SikkaError } from './error.js';
import { VOID_ELEMENTS } from './parser.js';
import type {
  TemplateAST,
  TemplateNode,
  ElementNode,
  AttrNode,
  SpreadAttrNode,
  CompileResult,
  CompileError,
  RenderFunction,
  StreamingCompileResult,
  ComponentImport,
  ExpressionNode,
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
  /** Whether to aggregate <script> and <style> tags. */
  aggregateAssets?: boolean;
  /** Generated bodies call statically linked Component exports directly. */
  precompiled?: boolean;
  /** Source Streaming renders use Streaming Component functions. */
  streamComponents?: boolean;
  /** Canonical Template identity included in debug Render failures. */
  templateId?: string;
}

type ClassListArg =
  | string
  | Record<string, unknown>
  | ClassListArg[]
  | Set<ClassListArg>
  | null
  | undefined
  | boolean;
type StyleObjectArg = string | Record<string, unknown> | null | undefined;
const STREAMING_TARGET = '__buf';
const NATIVE_BOOLEAN_ATTRIBUTES = new Set([
  'allowfullscreen',
  'async',
  'autofocus',
  'autoplay',
  'checked',
  'controls',
  'default',
  'defer',
  'disabled',
  'formnovalidate',
  'hidden',
  'inert',
  'ismap',
  'itemscope',
  'loop',
  'multiple',
  'muted',
  'nomodule',
  'novalidate',
  'open',
  'playsinline',
  'readonly',
  'required',
  'reversed',
  'selected',
]);

interface RuntimeHelpers {
  escapeHelper: (val: unknown) => string;
  classListHelper: (arg: ClassListArg) => string;
  styleObjectHelper: (arg: StyleObjectArg) => string;
  filterHelper: (val: unknown) => unknown;
}

// fallow-ignore-next-line complexity
function createRuntimeHelpers(options?: CompileOptions): RuntimeHelpers {
  return {
    escapeHelper: expressionEscapeHelper(options),
    classListHelper,
    styleObjectHelper,
    filterHelper: options?.autoFilter
      ? options.filterFunction || ((value: unknown) => value)
      : (value: unknown) => value,
  };
}

function expressionEscapeHelper(options?: CompileOptions): typeof escapeHtml {
  return options?.autoEscape === false ? stringifyHtml : escapeHtml;
}

function classListHelper(arg: ClassListArg): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Set || Array.isArray(arg))
    return Array.from(arg, classListHelper).filter(Boolean).join(' ');
  return classListObject(arg);
}

function classListObject(arg: ClassListArg): string {
  if (!arg || typeof arg !== 'object') return '';
  return Object.entries(arg)
    .filter(([_, value]) => value)
    .map(([key]) => key)
    .join(' ');
}

function styleObjectHelper(arg: StyleObjectArg): string {
  if (typeof arg === 'string') return arg;
  if (!arg || typeof arg !== 'object') return '';
  return stringifiedStyleObject(arg);
}

function stringifiedStyleObject(arg: Record<string, unknown>): string {
  if (typeof arg.toString === 'function' && arg.toString !== Object.prototype.toString) {
    return String(arg.toString());
  }
  return Object.entries(arg)
    .filter(([, value]) => value != null && typeof value !== 'boolean' && value !== '')
    .map(([key, value]) => `${key.replace(/[A-Z]/g, toKebabCase)}:${value}`)
    .join(';');
}

function toKebabCase(match: string): string {
  return '-' + match.toLowerCase();
}

export const compile = compileSync;

/** Returns a diagnostic when regular rendering cannot execute Frontmatter await. */
export function unsupportedFrontmatterAwait(ast: TemplateAST): CompileError | undefined {
  return ast.frontmatter.hasAwait
    ? {
        message:
          'Sikka Frontmatter await is only supported during Streaming renders; use stream() instead',
        category: 'Compile',
        construct: 'Frontmatter await',
      }
    : undefined;
}

/** Returns a diagnostic for a Frontmatter import that is not a Component. */
export function unsupportedFrontmatterImport(
  imports: ComponentImport[],
  templateId?: string
): CompileError | undefined {
  const invalid = imports.find((item) => !item.isComponent);
  if (!invalid) return undefined;
  const context = templateId ? ` in canonical Template ${JSON.stringify(templateId)}` : '';
  return {
    message: `Unsupported Frontmatter import ${JSON.stringify(invalid.specifier)}${context}: only .astro Component imports are supported`,
    category: 'Compile',
    template: templateId,
    request: invalid.specifier,
    construct: 'Frontmatter import',
    specifier: invalid.specifier,
  };
}

/** Compiles an AST after its Component graph has been resolved by the host. */
function compileSync(ast: TemplateAST, options?: CompileOptions): CompileResult {
  const awaitError = unsupportedFrontmatterAwait(ast);
  if (awaitError) return { ok: false, error: awaitError };
  const importError = unsupportedFrontmatterImport(ast.imports, options?.templateId);
  if (importError) return { ok: false, error: importError };
  return compileAST(ast, options);
}

/**
 * Compile a TemplateAST into a RenderFunction.
 */
type GeneratedSyncFunction = (
  props: Record<string, unknown>,
  slots: Record<string, string>,
  escape: typeof escapeHtml,
  rawHtml: typeof RawHtml,
  components: Record<string, RenderFunction>,
  classList: RuntimeHelpers['classListHelper'],
  styleObject: RuntimeHelpers['styleObjectHelper'],
  filter: RuntimeHelpers['filterHelper']
) => string;

function compileAST(ast: TemplateAST, options?: CompileOptions): CompileResult {
  try {
    return compileASTUnsafe(ast, options);
  } catch (err) {
    return compileFailure(err);
  }
}

function compileFailure(error: unknown): { ok: false; error: CompileError } {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    error: { message, category: 'Compile', cause: error, construct: rejectedConstruct(message) },
  };
}

function rejectedConstruct(message: string): string | undefined {
  if (message.startsWith('InvalidDirective:')) return 'directive';
  if (message.startsWith('InvalidFragment:')) return 'Fragment';
  return undefined;
}

function compileASTUnsafe(ast: TemplateAST, options?: CompileOptions): CompileResult {
  validateDirectives(ast);
  const components = options?.components ?? {};
  const source = buildFunctionBody(ast, components, options, '__out', 'return __out;');
  const renderFn = createRenderFunction(
    createSyncFunction(source),
    components,
    createRuntimeHelpers(options),
    options?.debug,
    options?.templateId
  );
  return { ok: true, fn: renderFn, source };
}

function createSyncFunction(source: string): GeneratedSyncFunction {
  return new Function(
    'props',
    'slots',
    '__escape',
    '__RawHtml',
    '__components',
    '__classList',
    '__styleObject',
    '__filter',
    source
  ) as GeneratedSyncFunction;
}

function createRenderFunction(
  syncFn: GeneratedSyncFunction,
  components: Record<string, RenderFunction>,
  helpers: RuntimeHelpers,
  debug: boolean | undefined,
  template: string | undefined
): RenderFunction {
  const renderFn = (async (
    props: Record<string, unknown>,
    slots?: Record<string, string>
  ): Promise<string> => renderFn.renderSync(props, slots)) as RenderFunction;

  renderFn.render = async function (
    props: Record<string, unknown>,
    slots?: Record<string, string | AsyncIterable<string>>
  ): Promise<string> {
    const syncSlots: Record<string, string> = {};
    for (const [key, value] of Object.entries(slots ?? {})) {
      if (typeof value === 'string') syncSlots[key] = value;
    }
    return renderFn.renderSync(props, syncSlots);
  };

  renderFn.renderSync = (props, slots): string =>
    executeSyncFunction(syncFn, props, slots ?? {}, components, helpers, debug, template);
  return renderFn;
}

function executeSyncFunction(
  syncFn: GeneratedSyncFunction,
  props: Record<string, unknown>,
  slots: Record<string, string>,
  components: Record<string, RenderFunction>,
  helpers: RuntimeHelpers,
  debug: boolean | undefined,
  template: string | undefined
): string {
  try {
    return syncFn(
      props,
      slots,
      helpers.escapeHelper,
      RawHtml,
      components,
      helpers.classListHelper,
      helpers.styleObjectHelper,
      helpers.filterHelper
    );
  } catch (err: unknown) {
    if (debug) {
      throw new SikkaError(`Runtime Error: ${err instanceof Error ? err.message : String(err)}`, {
        category: 'Render',
        template,
        cause: err,
      });
    }
    throw err;
  }
}

const HOISTED_BOOLEAN_ATTRS = `const __booleanAttrs = new Set([${[...NATIVE_BOOLEAN_ATTRIBUTES]
  .map((name) => JSON.stringify(name))
  .join(', ')}]);`;
const HOISTED_RAW_HTML_KEY = 'const __rawHtmlKey = Symbol.for("sikka.raw-html");';

function buildFunctionBody(
  ast: TemplateAST,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string,
  completion: string
): string {
  const bodyLines = mergeLines(
    ast.body.flatMap((node) => emitNode(node, components, options, target)),
    target
  );
  return [
    `let ${target} = "";`,
    ...(bodyLines.some((line) => line.includes('__booleanAttrs')) ? [HOISTED_BOOLEAN_ATTRS] : []),
    ...(bodyLines.some((line) => line.includes('__rawHtmlKey')) ? [HOISTED_RAW_HTML_KEY] : []),
    ...buildFunctionPreamble(ast, options),
    ...bodyLines,
    completion,
  ].join('\n');
}

function buildFunctionPreamble(ast: TemplateAST, options?: CompileOptions): string[] {
  const varName = options?.varName || 'Astro';
  return [
    ...buildAstroPreamble(ast, varName),
    '',
    ...buildComponentPreamble(ast.imports),
    ...buildFrontmatterPreamble(ast.frontmatter.source),
  ];
}

function buildAstroPreamble(ast: TemplateAST, varName: string): string[] {
  if (!usesAstroGlobal(ast, varName)) return [];
  if (usesOnlyAstroProps(ast, varName)) return [`const ${varName} = { props };`];
  return [
    `const ${varName} = {
      props,
      slots: {
        ...slots,
        render: (name) => new __RawHtml(slots[name] || ""),
        has: (name) => slots[name] !== undefined || (name === "default" && slots[""] !== undefined)
      }
    };`,
  ];
}

function usesAstroGlobal(ast: TemplateAST, varName: string): boolean {
  return ast.frontmatter.source.includes(varName) || JSON.stringify(ast.body).includes(varName);
}

function usesOnlyAstroProps(ast: TemplateAST, varName: string): boolean {
  const source = ast.frontmatter.source + JSON.stringify(ast.body);
  return !source.replaceAll(`${varName}.props`, '').includes(varName);
}

function buildComponentPreamble(imports: ComponentImport[]): string[] {
  return imports.map(
    ({ localName }) => `const ${localName} = __components[${JSON.stringify(localName)}];`
  );
}

function buildFrontmatterPreamble(source: string): string[] {
  if (!source.trim()) return [];
  const cleanSource = source
    .replace(/^\s*import\s+[\s\S]*?from\s+['"].*?['"];?\s*$/gm, '')
    .replace(/^\s*export\s+/gm, '');
  return [cleanSource, ''];
}

function mergeLines(bodyLines: string[], target: string): string[] {
  const lines: string[] = [];
  const prefix = `${target} += `;
  let index = 0;
  while (index < bodyLines.length) {
    const result = mergeLineAt(bodyLines, index, prefix, target);
    lines.push(result.line);
    index = result.nextIndex;
  }
  return lines;
}

function mergeLineAt(
  bodyLines: string[],
  index: number,
  prefix: string,
  target: string
): { line: string; nextIndex: number } {
  const expression = outputExpression(bodyLines[index], prefix);
  if (expression === undefined) return { line: bodyLines[index], nextIndex: index + 1 };

  const merged = mergeAdjacentOutputExpressions(bodyLines, index + 1, prefix, expression);
  return { line: `${target} += ${merged.expression};`, nextIndex: merged.nextIndex };
}

function outputExpression(line: string, prefix: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith(prefix)) return undefined;
  const expression = trimmed.slice(prefix.length);
  return expression.endsWith(';') ? expression.slice(0, -1) : expression;
}

function mergeAdjacentOutputExpressions(
  bodyLines: string[],
  index: number,
  prefix: string,
  expression: string
): { expression: string; nextIndex: number } {
  let merged = expression;
  let nextIndex = index;
  while (nextIndex < bodyLines.length) {
    const nextExpression = outputExpression(bodyLines[nextIndex], prefix);
    if (nextExpression === undefined) break;
    merged = combineOutputExpressions(merged, nextExpression);
    nextIndex++;
  }
  return { expression: merged, nextIndex };
}

function combineOutputExpressions(previous: string, next: string): string {
  return previous.endsWith('"') && next.startsWith('"')
    ? previous.slice(0, -1) + next.slice(1)
    : previous + ' + ' + next;
}

function emitChildren(
  children: TemplateNode[],
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string,
  indent = ''
): string[] {
  return children.flatMap((child) =>
    emitNode(child, components, options, target).map((line) => indent + line)
  );
}

type ElementAttribute = AttrNode | SpreadAttrNode;

function validateDirectives(ast: TemplateAST): void {
  for (const node of ast.body) validateNodeDirectives(node);
}

function validateNodeDirectives(node: TemplateNode): void {
  if (node.type === 'element') {
    if (!node.tag || node.tag === 'Fragment') partitionFragmentAttributes(node.attrs);
    validateContentDirectives(node.attrs, node.children.length > 0);
    for (const child of node.children) validateNodeDirectives(child);
  } else if (node.type === 'slot') {
    for (const child of node.children) validateNodeDirectives(child);
  } else if (node.type === 'script' || node.type === 'style') {
    validateContentDirectives(node.attrs, node.content.length > 0);
  }
}

function validateContentDirectives(attrs: ElementAttribute[], hasChildren: boolean): void {
  const names = new Set(
    attrs.filter((attr): attr is AttrNode => !('type' in attr)).map((attr) => attr.name)
  );
  if (names.has('set:html') && names.has('set:text'))
    throw new Error('InvalidDirective: cannot use both set:html and set:text');
  const directive = names.has('set:html')
    ? 'set:html'
    : names.has('set:text')
      ? 'set:text'
      : undefined;
  if (hasChildren && directive)
    throw new Error(`InvalidDirective: cannot use ${directive} with children`);
}

type ElementAttributeGroups = {
  setHtml?: AttrNode;
  setText?: AttrNode;
  standardAttrs: ElementAttribute[];
  hasSpread: boolean;
};

type NodeEmitter = (
  node: TemplateNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
) => string[];

const NODE_EMITTERS: Record<TemplateNode['type'], NodeEmitter> = {
  text: emitTextNode,
  expression: emitExpressionTemplateNode,
  element: emitElementTemplateNode,
  slot: emitSlotTemplateNode,
  script: emitScriptTemplateNode,
  style: emitStyleTemplateNode,
  raw: emitRawTemplateNode,
};

function emitNode(
  node: TemplateNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target = '__out'
): string[] {
  const emitter = NODE_EMITTERS[node.type];
  if (!emitter) throw new Error(`Unknown node type: ${(node as { type: string }).type}`);
  return emitter(node, components, options, target);
}

function emitTextNode(node: TemplateNode, _: unknown, __: unknown, target: string): string[] {
  const value = (node as import('./types.js').TextNode).value;
  return value ? [`${target} += ${JSON.stringify(value)};`] : [];
}

function emitExpressionTemplateNode(
  node: TemplateNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  return emitExpressionNode(node as ExpressionNode, components, options, target);
}

function emitElementTemplateNode(
  node: TemplateNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  return emitElement(node as ElementNode, components, options, target);
}

function emitSlotTemplateNode(
  node: TemplateNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  return emitSlotNode(node as import('./types.js').SlotNode, components, options, target);
}

function emitScriptTemplateNode(
  node: TemplateNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  const asset = node as import('./types.js').ScriptNode;
  return emitAssetNode('script', asset.content, asset.attrs, components, options, target);
}

function emitStyleTemplateNode(
  node: TemplateNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  const asset = node as import('./types.js').StyleNode;
  return emitAssetNode('style', asset.content, asset.attrs, components, options, target);
}

function emitRawTemplateNode(
  node: TemplateNode,
  _: unknown,
  __: unknown,
  target: string
): string[] {
  return [`${target} += ${JSON.stringify((node as import('./types.js').RawNode).html)};`];
}

function emitExpressionNode(
  node: ExpressionNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  const source = expressionSource(node, components, options);
  if (isCommentExpression(source)) return [];
  return [`${target} += ${applyExpressionOptions(source, options)};`];
}

function expressionSource(
  node: ExpressionNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string {
  return node.nodes?.length === 1 && typeof node.nodes[0] === 'string'
    ? node.source
    : transformExpression(node, components, options);
}

function isCommentExpression(source: string): boolean {
  return /^\s*(\/\*[\s\S]*\*\/|\/\/.*)\s*$/.test(source);
}

function applyExpressionOptions(source: string, options: CompileOptions | undefined): string {
  const expression = shouldFilterExpression(options) ? `__filter(${source})` : source;
  return `__escape(${expression})`;
}

function shouldFilterExpression(options: CompileOptions | undefined): boolean {
  return options?.autoFilter === true;
}

function emitSlotNode(
  node: import('./types.js').SlotNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  return node.nameExpr
    ? emitDynamicSlot(node, components, options, target)
    : emitStaticSlot(node, components, options, target);
}

function emitDynamicSlot(
  node: import('./types.js').SlotNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  const emit = (value: string) => `${target} += ${value};`;
  const source = transformExpression(node.nameExpr as ExpressionNode, components, options);
  const lines = [
    `{ const __slotName = String(${source});`,
    `  if (slots[__slotName] !== undefined) {`,
    `    ${emit('slots[__slotName]')}`,
    `  } else if (slots["" ] !== undefined && __slotName === "default") {`,
    `    ${emit('slots[""]')}`,
  ];
  if (node.children.length > 0) {
    lines.push(`  } else {`, ...emitChildren(node.children, components, options, target, '    '));
  }
  lines.push(`  }`, `}`);
  return lines;
}

function emitStaticSlot(
  node: import('./types.js').SlotNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  const emit = (value: string) => `${target} += ${value};`;
  const slotName = node.name || 'default';
  const slotKey = JSON.stringify(slotName);
  const lines = [
    `if (slots[${slotKey}] !== undefined) {`,
    `  ${emit(`slots[${slotKey}]`)}`,
    `} else if (slots[${JSON.stringify('')}] !== undefined && ${JSON.stringify(slotName)} === "default") {`,
    `  ${emit(`slots[${JSON.stringify('')}]`)}`,
  ];
  if (node.children.length > 0) {
    lines.push(`} else {`, ...emitChildren(node.children, components, options, target, '  '));
  }
  lines.push(`}`);
  return lines;
}

// fallow-ignore-next-line complexity
function emitAssetNode(
  tag: 'script' | 'style',
  content: string,
  attrs: ElementAttribute[],
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  if (options?.aggregateAssets) return [];
  const lines =
    attrs.every(isStaticAttribute) && !attrs.some((attr) => isClassAttribute(attr.name))
      ? emitStaticOpeningTag(tag, attrs as AttrNode[], options, target)
      : emitSpreadOpeningTag(tag, attrs, components, options, target);
  lines.push(`${target} += ">" + ${JSON.stringify(content)} + ${JSON.stringify(`</${tag}>`)};`);
  return options?.precompiled ? ['if (!__aggregateAssets) {', ...lines, '}'] : lines;
}

function emitElement(
  node: ElementNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target = '__out'
): string[] {
  if (!node.tag || node.tag === 'Fragment') return emitFragment(node, components, options, target);
  if (isComponentElement(node)) return emitComponentCall(node, components, options, target);
  return emitHtmlElement(node, components, options, target);
}

function isComponentElement(node: ElementNode): boolean {
  return /^[A-Z]/.test(node.tag);
}

function emitHtmlElement(
  node: ElementNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  const attributes = partitionElementAttributes(node.attrs);
  if (isVoidOrDeclaration(node.tag) || (node.selfClosing && /^[A-Z]/.test(node.tag))) {
    const lines = emitElementOpeningTag(node.tag, attributes, components, options, target);
    lines.push(`${target} += ${node.tag.startsWith('!') ? '">"' : '" />"'};`);
    return lines;
  }
  return attributes.hasSpread || attributes.setHtml || attributes.setText
    ? emitDirectiveElement(node, attributes, components, options, target)
    : emitNonVoidElement(
        node,
        attributes,
        emitElementOpeningTag(node.tag, attributes, components, options, target),
        components,
        options,
        target
      );
}

function emitDirectiveElement(
  node: ElementNode,
  attributes: ElementAttributeGroups,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  if (attributes.setHtml && attributes.setText)
    throw new Error('InvalidDirective: cannot use both set:html and set:text');
  if (node.children.length > 0 && attributes.setHtml)
    throw new Error('InvalidDirective: cannot use set:html with children');
  if (node.children.length > 0 && attributes.setText)
    throw new Error('InvalidDirective: cannot use set:text with children');

  const lines = emitSpreadOpeningTag(
    node.tag,
    node.attrs,
    components,
    options,
    target,
    false,
    true
  );
  lines.push(`${target} += ">";`);
  if (node.children.length > 0) {
    lines.push(
      `if (__hasSetHtml) throw new Error("InvalidDirective: cannot use set:html with children");`,
      `if (__hasSetText) throw new Error("InvalidDirective: cannot use set:text with children");`,
      ...emitChildren(node.children, components, options, target)
    );
  } else {
    lines.push(
      `if (__hasSetHtml) {`,
      emitRawHtmlValue('__setHtml', target),
      `} else if (__hasSetText) {`,
      `${target} += __escape(__setText);`,
      `}`
    );
  }
  lines.push(`${target} += ${JSON.stringify(`</${node.tag}>`)};`, `}`);
  return lines;
}

function emitElementOpeningTag(
  tag: string,
  attributes: ElementAttributeGroups,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  if (
    !attributes.hasSpread &&
    attributes.standardAttrs.every(isStaticAttribute) &&
    !attributes.standardAttrs.some((attr) => isClassAttribute(attr.name))
  ) {
    return emitStaticOpeningTag(tag, attributes.standardAttrs as AttrNode[], options, target);
  }
  return emitSpreadOpeningTag(tag, attributes.standardAttrs, components, options, target);
}

function isStaticAttribute(attr: ElementAttribute): attr is AttrNode {
  return !('type' in attr) && (attr.value === true || typeof attr.value === 'string');
}

function emitStaticOpeningTag(
  tag: string,
  attrs: AttrNode[],
  options: CompileOptions | undefined,
  target: string
): string[] {
  const ordinary = new Map<string, string | true>();
  const special: string[] = [];
  const styles: string[] = [];
  for (const attr of attrs) addStaticAttribute(tag, attr, ordinary, special, styles, options);
  const style = mergeStyleValues(styles);
  return [
    `${target} += ${JSON.stringify(
      `<${tag}` +
        [...ordinary.values(), ...special, style && staticAttribute('style', style, options)].join(
          ''
        )
    )};`,
  ];
}

// fallow-ignore-next-line complexity
function addStaticAttribute(
  tag: string,
  attr: AttrNode,
  ordinary: Map<string, string | true>,
  special: string[],
  styles: string[],
  options: CompileOptions | undefined
): void {
  if (attr.value !== true && typeof attr.value !== 'string') return;
  if (isClassAttribute(attr.name)) {
    special.push(staticAttribute('class', attr.value, options));
  } else if (attr.name === 'style') {
    if (typeof attr.value === 'string') styles.push(attr.value);
  } else {
    ordinary.set(attr.name, staticAttribute(attr.name, attr.value, options, tag));
  }
}

// fallow-ignore-next-line complexity
function staticAttribute(
  name: string,
  value: string | true,
  options: CompileOptions | undefined,
  tag?: string
): string {
  if (value === true) return tag?.includes('-') ? ` ${name}="true"` : ` ${name}`;
  if (value === '' || (tag && isNativeBooleanAttribute(tag, name))) return ` ${name}`;
  const output = options?.autoEscape === false ? value : escapeHtml(value);
  return ` ${name}="${output}"`;
}

function mergeStyleValues(values: string[]): string {
  return values
    .map((value) => value.trim().replace(/^;+|;+$/g, ''))
    .filter(Boolean)
    .join(';');
}

function isNativeBooleanAttribute(tag: string, name: string): boolean {
  return !tag.includes('-') && NATIVE_BOOLEAN_ATTRIBUTES.has(name);
}

function isVoidOrDeclaration(tag: string): boolean {
  return VOID_ELEMENTS.has(tag) || tag.startsWith('!');
}

function emitNonVoidElement(
  node: ElementNode,
  attributes: ElementAttributeGroups,
  lines: string[],
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  lines.push(`${target} += ">";`);
  lines.push(...emitElementContent(node, attributes, components, options, target));
  lines.push(`${target} += ${JSON.stringify(`</${node.tag}>`)};`);
  return lines;
}

function emitFragment(
  node: ElementNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  const attributes = partitionFragmentAttributes(node.attrs);
  if (attributes.setHtml && attributes.setText)
    throw new Error('InvalidFragment: cannot use both set:html and set:text');
  if (attributes.setHtml) {
    if (node.children.length > 0)
      throw new Error('InvalidFragment: cannot use set:html with children');
    return emitHtmlDirective(attributes.setHtml, components, options, target);
  }
  if (attributes.setText) {
    if (node.children.length > 0)
      throw new Error('InvalidFragment: cannot use set:text with children');
    return emitTextDirective(attributes.setText, components, options, target);
  }
  return emitChildren(node.children, components, options, target);
}

function partitionFragmentAttributes(
  attrs: ElementAttribute[]
): Pick<ElementAttributeGroups, 'setHtml' | 'setText'> {
  const directives: Pick<ElementAttributeGroups, 'setHtml' | 'setText'> = {};
  for (const attr of attrs) {
    const directive = fragmentDirectiveName(attr);
    if (directive) directives[directive] = attr as AttrNode;
  }
  return directives;
}

const FRAGMENT_DIRECTIVES: Record<string, 'setHtml' | 'setText' | undefined> = {
  'set:html': 'setHtml',
  'set:text': 'setText',
};

function fragmentDirectiveName(attr: ElementAttribute): 'setHtml' | 'setText' | undefined {
  if ('type' in attr) throw new Error('InvalidFragment: spread attributes are not supported');
  return FRAGMENT_DIRECTIVES[attr.name] ?? validateFragmentAttribute(attr.name);
}

function validateFragmentAttribute(name: string): undefined {
  if (name === 'slot') return undefined;
  const construct = name.includes(':') ? 'directive' : 'attribute';
  throw new Error(`InvalidFragment: ${construct} ${name} is not supported`);
}

function partitionElementAttributes(attrs: ElementAttribute[]): ElementAttributeGroups {
  const result: ElementAttributeGroups = { standardAttrs: [], hasSpread: false };
  for (const attr of attrs) {
    const directive = elementDirectiveName(attr);
    if (directive) result[directive] = attr as AttrNode;
    else addStandardAttribute(result, attr);
  }
  return result;
}

function elementDirectiveName(attr: ElementAttribute): 'setHtml' | 'setText' | undefined {
  if ('type' in attr) return undefined;
  if (attr.name === 'set:html') return 'setHtml';
  return attr.name === 'set:text' ? 'setText' : undefined;
}

function addStandardAttribute(result: ElementAttributeGroups, attr: ElementAttribute): void {
  result.standardAttrs.push(attr);
  if ('type' in attr) result.hasSpread = true;
}

function emitSpreadOpeningTag(
  tag: string,
  attrs: ElementAttribute[],
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string,
  closeScope = true,
  supportsContentDirectives = false
): string[] {
  return emitCollectedOpeningTag(
    JSON.stringify('<' + tag),
    JSON.stringify(tag.includes('-')),
    attrs,
    components,
    options,
    target,
    closeScope,
    supportsContentDirectives
  );
}

function emitDynamicOpeningTag(
  tag: string,
  attrs: ElementAttribute[],
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  return emitCollectedOpeningTag(
    `"<" + ${tag}`,
    `${tag}.includes("-")`,
    attrs,
    components,
    options,
    target
  );
}

function emitCollectedOpeningTag(
  opening: string,
  customElement: string,
  attrs: ElementAttribute[],
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string,
  closeScope = true,
  supportsContentDirectives = false
): string[] {
  const lines = [
    `${target} += ${opening};`,
    `{`,
    `  const __attrs = Object.create(null);`,
    `  const __attrOrder = [];`,
    `  const __seenAttrs = Object.create(null);`,
    `  const __bare = {};`,
    `  const __isCustomElement = ${customElement};`,
    `  const __classes = [];`,
    `  const __styles = [];`,
    ...(supportsContentDirectives
      ? [
          `  let __hasSetHtml = false;`,
          `  let __setHtml;`,
          `  let __hasSetText = false;`,
          `  let __setText;`,
        ]
      : []),
    `  const __setAttr = (__k, __v) => {`,
    `    if (__v == null) { delete __attrs[__k]; return; }`,
    `    if (!Object.hasOwn(__seenAttrs, __k)) { __seenAttrs[__k] = true; __attrOrder.push(__k); }`,
    `    __attrs[__k] = __v;`,
    `  };`,
  ];
  for (const attr of attrs)
    lines.push(...emitSpreadAttribute(attr, components, options, supportsContentDirectives));
  if (supportsContentDirectives)
    lines.push(
      `  if (__hasSetHtml && __hasSetText) throw new Error("InvalidDirective: cannot use both set:html and set:text");`
    );
  lines.push(...emitCollectedSpreadValues(target));
  if (closeScope) lines.push(`}`);
  return lines;
}

function emitSpreadAttribute(
  attr: ElementAttribute,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  supportsContentDirectives: boolean
): string[] {
  return 'type' in attr
    ? emitSpreadObject(attr, components, options, supportsContentDirectives)
    : emitSpreadNamedAttribute(attr, components, options, supportsContentDirectives);
}

function emitSpreadObject(
  attr: SpreadAttrNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  supportsContentDirectives: boolean
): string[] {
  const source = transformExpression(attr.expression, components, options);
  return [
    `  {`,
    `    const __s = (${source});`,
    `    if (__s != null) for (const __k of Object.keys(Object(__s))) {`,
    `      const __v = __s[__k];`,
    `      if (__k === "set:html") {`,
    ...(supportsContentDirectives
      ? [`        __hasSetHtml = true;`, `        __setHtml = __v;`]
      : [`        throw new Error("InvalidDirective: spread set:html is not supported");`]),
    `      } else if (__k === "set:text") {`,
    `        throw new Error("InvalidDirective: spread set:text is not supported");`,
    `      } else if (__k === "class" || __k === "className" || __k === "class:list") {`,
    `        __classes.push(__k === "class:list" ? __classList(__v) : __v);`,
    `      } else if (__k === "style") {`,
    `        __styles.push(typeof __v === "string" ? __v : __styleObject(__v));`,
    `      } else if (__k.includes(":")) {`,
    `        throw new Error("InvalidDirective: unsupported spread directive " + __k);`,
    `      } else {`,
    `        __setAttr(__k, __v);`,
    `      }`,
    `    }`,
    `  }`,
  ];
}

function emitSpreadNamedAttribute(
  attr: AttrNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  supportsContentDirectives: boolean
): string[] {
  if (supportsContentDirectives && attr.name === 'set:html')
    return [
      `  __hasSetHtml = true;`,
      `  __setHtml = ${spreadOrdinaryAttributeValue(attr, components, options)};`,
    ];
  if (supportsContentDirectives && attr.name === 'set:text')
    return [
      `  __hasSetText = true;`,
      `  __setText = ${spreadOrdinaryAttributeValue(attr, components, options)};`,
    ];
  if (isClassAttribute(attr.name)) return emitSpreadClassAttribute(attr, components, options);
  if (attr.name === 'style') return emitSpreadStyleAttribute(attr, components, options);
  return emitSpreadOrdinaryAttribute(attr, components, options);
}

function isClassAttribute(name: string): boolean {
  return name === 'class' || name === 'className' || name === 'class:list';
}

function emitSpreadClassAttribute(
  attr: AttrNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string[] {
  return [`  __classes.push(${spreadAttributeValue(attr, '__classList', components, options)});`];
}

function emitSpreadStyleAttribute(
  attr: AttrNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string[] {
  return [`  __styles.push(${spreadAttributeValue(attr, '__styleObject', components, options)});`];
}

// fallow-ignore-next-line complexity
function spreadAttributeValue(
  attr: AttrNode,
  helper: '__classList' | '__styleObject',
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string {
  if (attr.value === true) return '""';
  if (typeof attr.value === 'string') return JSON.stringify(attr.value);
  const source = transformExpression(attr.value, components, options);
  return attr.name === 'class:list' || attr.name === 'style' ? `${helper}(${source})` : source;
}

function emitSpreadOrdinaryAttribute(
  attr: AttrNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string[] {
  return [
    `  __setAttr(${JSON.stringify(attr.name)}, ${spreadOrdinaryAttributeValue(attr, components, options)});`,
  ];
}

function spreadOrdinaryAttributeValue(
  attr: AttrNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string {
  if (attr.value === true) return '__bare';
  if (typeof attr.value === 'string') return JSON.stringify(attr.value);
  return `(${transformExpression(attr.value, components, options)})`;
}

function emitCollectedSpreadValues(target: string): string[] {
  const emit = (value: string) => `${target} += ${value};`;
  const classes = [
    `  const __finalCls = __classes.filter(Boolean).join(' ');`,
    `  if (__finalCls) ${emit("' class=\"' + __escape(__finalCls) + '\"'")}`,
  ];
  const styles = [
    `  const __finalSty = __styles.map(__s => __s.trim().replace(/^;+|;+$/g, "")).filter(Boolean).join(";");`,
    `  if (__finalSty) ${emit("' style=\"' + __escape(__finalSty) + '\"'")}`,
  ];
  return [
    `  for (const __k of __attrOrder) {`,
    `    if (!Object.hasOwn(__attrs, __k)) continue;`,
    `    const __v = __attrs[__k];`,
    `    if (__v === __bare) {`,
    `      if (__isCustomElement) ${emit('" " + __escape(__k) + \'="true"\'')}`,
    `      else ${emit('" " + __escape(__k)')}`,
    `    } else if (__v === "") ${emit('" " + __escape(__k)')}`,
    `    else if (!__isCustomElement && __booleanAttrs.has(__k)) {`,
    `      if (__v) ${emit('" " + __escape(__k)')}`,
    `    } else ${emit('" " + __escape(__k) + \'="\' + __escape(String(__v)) + \'"\'')}`,
    `  }`,
    ...classes,
    ...styles,
  ];
}

function emitElementContent(
  node: ElementNode,
  attrs: ElementAttributeGroups,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  if (attrs.setHtml) return emitHtmlElementContent(node, attrs, components, options, target);
  if (attrs.setText)
    return emitTextElementContent(node, attrs.setText, components, options, target);
  return emitChildren(node.children, components, options, target);
}

function emitHtmlElementContent(
  node: ElementNode,
  attrs: ElementAttributeGroups,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  if (attrs.setText) throw new Error('Cannot use both set:html and set:text');
  if (node.children.length > 0) throw new Error('Cannot use set:html with children');
  return emitHtmlDirective(attrs.setHtml as AttrNode, components, options, target);
}

function emitTextElementContent(
  node: ElementNode,
  attr: AttrNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  if (node.children.length > 0) throw new Error('Cannot use set:text with children');
  return emitTextDirective(attr, components, options, target);
}

function emitHtmlDirective(
  attr: AttrNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  const emit = (value: string) => `${target} += ${value};`;
  if (typeof attr.value === 'string') return [emit(JSON.stringify(attr.value))];
  if (attr.value === true) return [];
  const source = transformExpression(attr.value, components, options);
  return [`{ const __h = (${source}); ${emitRawHtmlValue('__h', target)} }`];
}

function emitRawHtmlValue(value: string, target: string): string {
  return `${target} += [].concat(${value}).map(v => (v && typeof v === 'object' && v[__rawHtmlKey] === true) ? v.value : v).join("");`;
}

function emitTextDirective(
  attr: AttrNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  const emit = (value: string) => `${target} += ${value};`;
  if (typeof attr.value === 'string') return [emit(`__escape(${JSON.stringify(attr.value)})`)];
  return attr.value === true
    ? []
    : [emit(`__escape(${transformExpression(attr.value, components, options)})`)];
}

function emitDynamicHtmlElement(
  node: ElementNode,
  tag: string,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  const attributes = partitionElementAttributes(node.attrs);
  const lines = emitDynamicOpeningTag(tag, attributes.standardAttrs, components, options, target);
  const isVoid = `${JSON.stringify([...VOID_ELEMENTS])}.includes(${tag}.toLowerCase()) || ${tag}.startsWith("!")`;
  lines.push(
    `if (${isVoid}) {`,
    `  ${target} += ${tag}.startsWith("!") ? ">" : " />";`,
    `} else {`,
    `  ${target} += ">";`,
    ...emitElementContent(node, attributes, components, options, target).map((line) => '  ' + line),
    `  ${target} += "</" + ${tag} + ">";`,
    `}`
  );
  return lines;
}

function emitComponentCall(
  node: ElementNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target = '__out'
): string[] {
  const localName = node.tag;
  const props = buildComponentPropsExpression(node.attrs, components, options);
  const lines = [
    `{`,
    `  let __component = __components[${JSON.stringify(localName)}];`,
    `  let __bound = __component !== undefined;`,
    `  if (!__bound) try { __component = ${localName}; __bound = true; } catch (error) { if (!(error instanceof ReferenceError)) throw error; }`,
    `  if (typeof __component === 'function') {`,
    `    const __childSlots = {};`,
    ...emitComponentSlots(node.children, components, options),
    ...emitResolvedComponentCall(localName, props, target, options),
    ...emitComponentFallbacks(node, components, options, target),
    `  }`,
    `}`,
  ];
  return lines;
}

function buildComponentPropsExpression(
  attrs: ElementAttribute[],
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string {
  return `{${attrs.map((attr) => componentPropPart(attr, components, options)).join(', ')}}`;
}

function componentPropPart(
  attr: ElementAttribute,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string {
  if ('type' in attr) return `...(${transformExpression(attr.expression, components, options)})`;
  const staticPart = staticComponentPropPart(attr);
  return staticPart ?? dynamicComponentPropPart(attr, components, options);
}

function staticComponentPropPart(attr: AttrNode): string | undefined {
  if (attr.value === true) return `${JSON.stringify(attr.name)}: true`;
  if (typeof attr.value === 'string')
    return `${JSON.stringify(attr.name)}: ${JSON.stringify(attr.value)}`;
  return undefined;
}

function dynamicComponentPropPart(
  attr: AttrNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string {
  const name = attr.name === 'class:list' ? 'class:list' : attr.name;
  return `${JSON.stringify(name)}: (${transformExpression(attr.value as ExpressionNode, components, options)})`;
}

function emitComponentSlots(
  children: TemplateNode[],
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string[] {
  return children.flatMap((child, index) => emitComponentSlot(child, index, components, options));
}

function emitComponentSlot(
  child: TemplateNode,
  index: number,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string[] {
  const { slotName, node, forwardedSlotName } = getComponentSlot(child, components, options);
  if (forwardedSlotName) return emitForwardedComponentSlot(slotName, forwardedSlotName);

  const variable = `__slot_${index}`;
  return [
    `    let ${variable} = "";`,
    ...emitNode(node, components, options, variable).map((line) => '    ' + line),
    ...emitChildSlotAssignment(slotName, variable, '    '),
  ];
}

function emitForwardedComponentSlot(slotName: string, forwardedSlotName: string): string[] {
  return [
    `    {`,
    `      const __forwardedName = String(${forwardedSlotName});`,
    `      const __forwarded = slots[__forwardedName] === undefined && __forwardedName === "default" ? slots[""] : slots[__forwardedName];`,
    `      if (__forwarded !== undefined) {`,
    ...emitChildSlotAssignment(slotName, '__forwarded', '        '),
    `      }`,
    `    }`,
  ];
}

function emitChildSlotAssignment(slotName: string, value: string, indent: string): string[] {
  return [
    `${indent}{`,
    `${indent}  const __sname = String(${slotName});`,
    `${indent}  if (__sname === "" || __sname === "default") {`,
    `${indent}    if (__childSlots[""] === undefined) __childSlots[""] = "";`,
    `${indent}    if (__childSlots["default"] === undefined) __childSlots["default"] = "";`,
    `${indent}    __childSlots[""] += ${value};`,
    `${indent}    __childSlots["default"] += ${value};`,
    `${indent}  } else {`,
    `${indent}    if (__childSlots[__sname] === undefined) __childSlots[__sname] = "";`,
    `${indent}    __childSlots[__sname] += ${value};`,
    `${indent}  }`,
    `${indent}}`,
  ];
}

type ComponentSlot = { slotName: string; node: TemplateNode; forwardedSlotName?: string };

function getComponentSlot(
  child: TemplateNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): ComponentSlot {
  if (child.type === 'slot') {
    return {
      slotName: getSlotAssignmentName(child, components, options),
      node: child,
      forwardedSlotName: getSlotReceiverName(child, components, options),
    };
  }
  if (child.type !== 'element') return { slotName: JSON.stringify(''), node: child };

  const slotAttr = child.attrs.find(
    (attr): attr is AttrNode => !('type' in attr) && attr.name === 'slot'
  );
  if (!slotAttr) return { slotName: JSON.stringify(''), node: child };
  return {
    slotName: getSlotName(slotAttr, components, options),
    node: { ...child, attrs: child.attrs.filter((attr) => attr !== slotAttr) },
  };
}

function getSlotReceiverName(
  node: import('./types.js').SlotNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string {
  return node.nameExpr
    ? transformExpression(node.nameExpr, components, options)
    : JSON.stringify(node.name || 'default');
}

function getSlotAssignmentName(
  node: import('./types.js').SlotNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string {
  return node.slotExpr
    ? transformExpression(node.slotExpr, components, options)
    : JSON.stringify(node.slot ?? '');
}

function getSlotName(
  attr: AttrNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string {
  if (typeof attr.value === 'string') return JSON.stringify(attr.value);
  return attr.value === true
    ? JSON.stringify('')
    : transformExpression(attr.value, components, options);
}

// fallow-ignore-next-line complexity
function emitResolvedComponentCall(
  localName: string,
  props: string,
  target: string,
  options?: CompileOptions
): string[] {
  if (target === STREAMING_TARGET) {
    const stream = options?.precompiled || options?.streamComponents;
    const invocation = options?.precompiled
      ? `__component.call(this, ${props}, __childSlots)`
      : `__component(${props}, __childSlots)`;
    return stream
      ? [`    if (__buf) { yield __buf; __buf = ""; }`, `    yield* ${invocation};`]
      : [
          `    if (__buf) { yield __buf; __buf = ""; }`,
          `    yield await __component(${props}, __childSlots);`,
        ];
  }
  return options?.precompiled
    ? [`    ${target} += __component.call(this, ${props}, __childSlots);`]
    : [
        `    if (!__component.renderSync) throw new Error("Component " + ${JSON.stringify(localName)} + " does not support synchronous rendering.");`,
        `    ${target} += __component.renderSync(${props}, __childSlots);`,
      ];
}

function emitComponentFallbacks(
  node: ElementNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined,
  target: string
): string[] {
  return [
    `  } else if (typeof __component === 'string') {`,
    ...emitDynamicHtmlElement(node, '__component', components, options, target).map(
      (line) => '    ' + line
    ),
    `  } else if (!__bound) {`,
    ...emitHtmlElement(node, components, options, target).map((line) => '    ' + line),
    `  } else {`,
    `    throw new TypeError(${JSON.stringify(`Invalid Component ${node.tag}: expected a Component or string tag`)});`,
  ];
}

function transformExpression(
  expr: ExpressionNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string {
  if (isPlainExpression(expr)) return expr.source;
  return (expr.nodes ?? [])
    .map((part) => transformExpressionPart(part, components, options))
    .join('');
}

function isPlainExpression(expr: ExpressionNode): boolean {
  return !expr.nodes || (expr.nodes.length === 1 && typeof expr.nodes[0] === 'string');
}

function transformExpressionPart(
  part: string | TemplateNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string {
  if (typeof part === 'string') return part;
  return rawHtmlExpressionFromNode(part, components, options);
}

function rawHtmlExpressionFromNode(
  node: TemplateNode,
  components: Record<string, RenderFunction>,
  options: CompileOptions | undefined
): string {
  const lines = mergeLines(emitNode(node, components, options, '__out'), '__out');
  if (isSingleOutputLine(lines)) return `new __RawHtml(${lines[0].slice(9, -1)})`;
  return `((() => { let __out = ""; ${lines.join(' ')} return new __RawHtml(__out); })())`;
}

function isSingleOutputLine(lines: string[]): boolean {
  return lines.length === 1 && lines[0].startsWith('__out += ') && lines[0].endsWith(';');
}

// ─── Streaming Compiler ─────────────────────────────────────────────────────

/** Compiles an AST for Streaming after its Component graph has been resolved by the host. */
function compileStreamingInternal(
  ast: TemplateAST,
  options?: CompileOptions
): StreamingCompileResult {
  const importError = unsupportedFrontmatterImport(ast.imports, options?.templateId);
  if (importError) return { ok: false, error: importError };
  return compileStreamingAST(ast, options);
}

export const compileStreaming = compileStreamingInternal;

/**
 * Compile a TemplateAST into a StreamingRenderFunction (async generator).
 */
type GeneratedStreamingFunction = GeneratedSyncFunction extends (...args: infer Args) => unknown
  ? (...args: Args) => AsyncGenerator<string>
  : never;

function compileStreamingAST(ast: TemplateAST, options?: CompileOptions): StreamingCompileResult {
  try {
    return compileStreamingASTUnsafe(ast, options);
  } catch (err) {
    return compileFailure(err);
  }
}

function compileStreamingASTUnsafe(
  ast: TemplateAST,
  options?: CompileOptions
): StreamingCompileResult {
  validateDirectives(ast);
  const components = options?.components ?? {};
  const source = buildStreamingFunctionBody(ast, components, options);
  const fn = createStreamingRenderFunction(createStreamingFunction(source), components, options);
  return { ok: true, fn, source };
}

function createStreamingFunction(source: string): GeneratedStreamingFunction {
  const AsyncGenCtor = Object.getPrototypeOf(async function* () {}).constructor as new (
    ...args: string[]
  ) => GeneratedStreamingFunction;
  return new AsyncGenCtor(
    'props',
    'slots',
    '__escape',
    '__RawHtml',
    '__components',
    '__classList',
    '__styleObject',
    '__filter',
    source
  );
}

function createStreamingRenderFunction(
  streamingFn: GeneratedStreamingFunction,
  components: Record<string, RenderFunction>,
  options?: CompileOptions
): import('./types.js').StreamingRenderFunction {
  const helpers = createRuntimeHelpers(options);
  return (props, slots) =>
    streamingFn(
      props,
      slots ?? {},
      helpers.escapeHelper,
      RawHtml,
      components,
      helpers.classListHelper,
      helpers.styleObjectHelper,
      helpers.filterHelper
    );
}

/**
 * Build the function body for a streaming (async generator) template.
 * Uses a `__buf` accumulator that flushes at component boundaries.
 */
function buildStreamingFunctionBody(
  ast: TemplateAST,
  components: Record<string, RenderFunction>,
  options?: CompileOptions
): string {
  return buildFunctionBody(
    ast,
    components,
    options,
    STREAMING_TARGET,
    'if (__buf) { yield __buf; }'
  );
}

/** Builds unevaluated regular and Streaming render bodies for `sikka/precompile`. */
export function compileSources(
  ast: TemplateAST,
  templateId?: string
): { ok: true; renderString: string; streamString: string } | { ok: false; error: CompileError } {
  const importError = unsupportedFrontmatterImport(ast.imports, templateId);
  if (importError) return { ok: false, error: importError };
  try {
    validateDirectives(ast);
    // Generated modules select filtering from their runtime receiver.
    const options = { autoFilter: true, precompiled: true };
    return {
      ok: true,
      renderString: ast.frontmatter.hasAwait
        ? `throw new Error(${JSON.stringify(unsupportedFrontmatterAwait(ast)?.message)});`
        : buildFunctionBody(ast, {}, options, '__out', 'return __out;'),
      streamString: buildStreamingFunctionBody(ast, {}, options),
    };
  } catch (error) {
    return compileFailure(error);
  }
}
