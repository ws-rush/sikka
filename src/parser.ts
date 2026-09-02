/**
 * Parser
 *
 * Parses Astro-like template source into a TemplateAST.
 *
 * Pipeline:
 *   1. Extract frontmatter between `---` fences
 *   2. Collect `import` statements from frontmatter
 *   3. Recursive-descent parse of the template body
 */

import type {
  ParseResult,
  ParseError,
  TemplateAST,
  TemplateNode,
  ElementNode,
  ExpressionNode,
  TextNode,
  SlotNode,
  ScriptNode,
  StyleNode,
  AttrNode,
  SpreadAttrNode,
  ComponentImport,
  FrontmatterNode,
  RawNode,
} from './types.js';

// ─── Position tracking ────────────────────────────────────────────────────────

interface Position {
  line: number;
  column: number;
}

function positionAt(source: string, offset: number): Position {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

function makeError(message: string, source: string, offset: number): ParseError {
  const { line, column } = positionAt(source, offset);
  return { message, category: 'Parse', line, column, construct: rejectedConstruct(message) };
}

function rejectedConstruct(message: string): string | undefined {
  if (message.startsWith('InvalidDirective:')) return 'directive';
  if (message.startsWith('InvalidFragment:')) return 'Fragment';
  return undefined;
}

// ─── Frontmatter extraction ───────────────────────────────────────────────────

interface FrontmatterResult {
  frontmatter: FrontmatterNode;
  imports: ComponentImport[];
  bodyStart: number;
}

type ExpressionState = {
  depth: number;
  nodes: (string | TemplateNode)[];
  currentString: string;
};

type ExpressionPartResult = { ok: true } | { ok: false; error: ParseError };
type AttributeParseResult =
  | { ok: true; attr: AttrNode | SpreadAttrNode }
  | { ok: false; error: ParseError };

function extractFrontmatter(
  source: string
): { ok: true; result: FrontmatterResult } | { ok: false; error: ParseError } {
  if (!source.startsWith('---')) return emptyFrontmatter();

  const afterOpen = source.indexOf('\n', 3);
  if (afterOpen === -1) {
    return { ok: false, error: makeError('Unclosed frontmatter fence', source, 3) };
  }
  return extractFrontmatterContent(source, afterOpen);
}

function emptyFrontmatter(): { ok: true; result: FrontmatterResult } {
  return {
    ok: true,
    result: { frontmatter: { source: '', hasAwait: false }, imports: [], bodyStart: 0 },
  };
}

function extractFrontmatterContent(
  source: string,
  afterOpen: number
): { ok: true; result: FrontmatterResult } | { ok: false; error: ParseError } {
  const closeIndex = source.indexOf('\n---', afterOpen);
  if (closeIndex === -1) {
    return {
      ok: false,
      error: makeError('Unclosed frontmatter fence: missing closing `---`', source, source.length),
    };
  }

  const fmSource = source.slice(afterOpen + 1, closeIndex);
  return {
    ok: true,
    result: {
      frontmatter: { source: fmSource, hasAwait: hasAwait(fmSource) },
      imports: collectImports(fmSource),
      bodyStart: skipFrontmatterNewline(source, closeIndex + 4),
    },
  };
}

function skipFrontmatterNewline(source: string, bodyStart: number): number {
  return source[bodyStart] === '\n' ? bodyStart + 1 : bodyStart;
}

function hasAwait(source: string): boolean {
  return /\bawait\b/.test(
    source.replace(/\/\*[\s\S]*?\*\/|\/\/.*|(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '')
  );
}

// ─── Import collection ────────────────────────────────────────────────────────

function collectImports(fmSource: string): ComponentImport[] {
  const imports: ComponentImport[] = [];
  const re = /^\s*import(?:\s+([\s\S]*?)\s+from)?\s+['"]([^'"]+)['"]/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(fmSource)) !== null) {
    collectImportClause(match[1]?.trim() ?? '', match[2], imports);
  }
  return imports;
}

function collectImportClause(
  importClause: string,
  specifier: string,
  imports: ComponentImport[]
): void {
  if (isTypeOnlyImport(importClause)) return;
  if (collectNamespaceImport(importClause, specifier, imports)) return;
  collectRegularImports(importClause, specifier, imports);
}

function collectRegularImports(
  importClause: string,
  specifier: string,
  imports: ComponentImport[]
): void {
  const start = imports.length;
  for (const part of splitImportClause(importClause)) collectImportPart(part, specifier, imports);
  if (imports.length === start) imports.push({ localName: '', specifier, isComponent: false });
}

function isTypeOnlyImport(importClause: string): boolean {
  if (importClause.startsWith('type ')) return true;
  const parts = importClause.replaceAll(/[{}]/g, '').split(',');
  return parts.length > 0 && parts.every((part) => part.trim().startsWith('type '));
}

function collectNamespaceImport(
  importClause: string,
  specifier: string,
  imports: ComponentImport[]
): boolean {
  if (!importClause.startsWith('* as ')) return false;
  imports.push(componentImport(importClause.slice(5).trim(), specifier));
  return true;
}

function collectImportPart(part: string, specifier: string, imports: ComponentImport[]): void {
  if (part.startsWith('{')) collectNamedImports(part, specifier, imports);
  else collectDefaultImport(part, specifier, imports);
}

function splitImportClause(importClause: string): string[] {
  const parts: string[] = [];
  let current = '';
  let braceDepth = 0;
  for (const char of importClause) {
    braceDepth = updateBraceDepth(char, braceDepth);
    if (isTopLevelImportComma(char, braceDepth)) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current) parts.push(current.trim());
  return parts;
}

function updateBraceDepth(char: string, depth: number): number {
  if (char === '{') return depth + 1;
  if (char === '}') return depth - 1;
  return depth;
}

function isTopLevelImportComma(char: string, braceDepth: number): boolean {
  return char === ',' && braceDepth === 0;
}

function collectNamedImports(part: string, specifier: string, imports: ComponentImport[]): void {
  const namedParts = part.slice(1).replace(/}$/, '').split(',');
  for (const named of namedParts) collectNamedImport(named, specifier, imports);
}

function collectNamedImport(named: string, specifier: string, imports: ComponentImport[]): void {
  const trimmed = named.trim();
  const localName = /(?:\s+as\s+)?(\w+)$/.exec(trimmed)?.[1];
  if (localName && !trimmed.startsWith('type '))
    imports.push(componentImport(localName, specifier));
}

function collectDefaultImport(part: string, specifier: string, imports: ComponentImport[]): void {
  const localName = /(\w+)$/.exec(part)?.[1];
  if (localName) imports.push(componentImport(localName, specifier));
}

function componentImport(localName: string, specifier: string): ComponentImport {
  return { localName, specifier, isComponent: specifier.endsWith('.astro') };
}

// ─── Body parser ─────────────────────────────────────────────────────────────

class Parser {
  private pos = 0;

  constructor(
    private readonly full: string, // full original source (for position reporting)
    private readonly src: string, // body slice
    private readonly bodyOffset: number // offset of body within full source
  ) {}

  // ── Utilities ──────────────────────────────────────────────────────────────

  private peek(offset = 0): string {
    return this.src[this.pos + offset] ?? '';
  }

  private at(str: string): boolean {
    return this.src.startsWith(str, this.pos);
  }

  private advance(n = 1): string {
    const ch = this.src.slice(this.pos, this.pos + n);
    this.pos += n;
    return ch;
  }

  private skipWhitespace(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) {
      this.pos++;
    }
  }

  private error(message: string): ParseError {
    return makeError(message, this.full, this.bodyOffset + this.pos);
  }

  private eof(): boolean {
    return this.pos >= this.src.length;
  }

  // ── Top-level body parse ───────────────────────────────────────────────────

  parseBody(): { ok: true; nodes: TemplateNode[] } | { ok: false; error: ParseError } {
    const nodes: TemplateNode[] = [];
    while (!this.eof()) {
      const result = this.parseBodyNode();
      if (!result.ok) return result;
      if (this.completeBodyNode(result, nodes)) break;
    }
    return { ok: true, nodes };
  }

  private completeBodyNode(
    result: { node: TemplateNode | null; shouldStop: boolean },
    nodes: TemplateNode[]
  ): boolean {
    if (result.shouldStop) return true;
    if (result.node) nodes.push(result.node);
    return false;
  }

  private parseBodyNode():
    | { ok: true; node: TemplateNode | null; shouldStop: boolean }
    | { ok: false; error: ParseError } {
    const start = this.pos;
    const result = this.parseNode();
    if (!result.ok) return result;
    return { ok: true, node: result.node, shouldStop: result.node === null && this.pos === start };
  }

  // ── Node dispatch ──────────────────────────────────────────────────────────

  private parseNode(): { ok: true; node: TemplateNode | null } | { ok: false; error: ParseError } {
    if (this.eof()) return { ok: true, node: null };
    if (this.peek() === '{') return this.parseExpression();
    if (this.peek() === '<') return this.parseTagNode();
    return this.parseText();
  }

  private parseTagNode():
    | { ok: true; node: TemplateNode | null }
    | { ok: false; error: ParseError } {
    if (this.at('<!--')) return this.parseComment();
    if (this.at('</')) return { ok: true, node: null };
    return this.isElementOpening() ? this.parseElement() : this.parseText();
  }

  private isElementOpening(): boolean {
    return /[\w!/>]/.test(this.peek(1));
  }

  // ── Text node ──────────────────────────────────────────────────────────────

  private parseText(): { ok: true; node: TextNode } | { ok: false; error: ParseError } {
    let value = '';
    while (!this.eof() && !this.isTextBoundary()) {
      value += this.advance();
    }
    return { ok: true, node: { type: 'text', value } };
  }

  private isTextBoundary(): boolean {
    return this.isExpressionBoundary() || this.isTagBoundary();
  }

  private isExpressionBoundary(): boolean {
    return this.peek() === '{';
  }

  private isTagBoundary(): boolean {
    if (this.peek() !== '<') return false;
    return this.at('<!--') || this.at('</') || this.isElementOpening();
  }

  // ── Comment ────────────────────────────────────────────────────────────────

  private parseComment(): { ok: true; node: RawNode | null } | { ok: false; error: ParseError } {
    const end = this.src.indexOf('-->', this.pos + 4);
    if (end === -1) {
      return { ok: false, error: this.error('Unclosed HTML comment') };
    }
    const html = this.src.slice(this.pos, end + 3);
    this.pos = end + 3;
    return { ok: true, node: { type: 'raw', html } };
  }

  // ── Expression node ────────────────────────────────────────────────────────

  private parseExpression(): { ok: true; node: ExpressionNode } | { ok: false; error: ParseError } {
    const start = this.pos;
    this.advance(); // consume '{'
    const state: ExpressionState = { depth: 1, nodes: [], currentString: '' };

    while (this.hasUnclosedExpression(state)) {
      const result = this.parseExpressionPart(state);
      if (!result.ok) return result;
    }
    return this.completeExpression(start, state);
  }

  private hasUnclosedExpression(state: ExpressionState): boolean {
    return !this.eof() && state.depth > 0;
  }

  private parseExpressionPart(state: ExpressionState): ExpressionPartResult {
    const braceResult = this.parseExpressionBrace(state);
    if (braceResult) return braceResult;

    const stringResult = this.parseExpressionString(state);
    if (stringResult) return stringResult;

    if (this.isExpressionElement()) return this.parseExpressionElement(state);
    state.currentString += this.advance();
    return { ok: true };
  }

  private parseExpressionBrace(state: ExpressionState): ExpressionPartResult | undefined {
    const ch = this.peek();
    if (ch === '{') {
      state.depth++;
      state.currentString += this.advance();
      return { ok: true };
    }
    if (ch !== '}') return undefined;

    state.depth--;
    this.consumeExpressionClosingBrace(state);
    return { ok: true };
  }

  private consumeExpressionClosingBrace(state: ExpressionState): void {
    const closingBrace = this.advance();
    if (state.depth > 0) state.currentString += closingBrace;
  }

  private parseExpressionString(state: ExpressionState): ExpressionPartResult | undefined {
    const quote = this.peek();
    if (!this.isStringQuote(quote)) return undefined;

    const result = this.parseStringLiteral(quote);
    if (!result.ok) return result;
    state.currentString += result.value;
    return { ok: true };
  }

  private isStringQuote(value: string): boolean {
    return value === '"' || value === "'" || value === '`';
  }

  private isExpressionElement(): boolean {
    return this.peek() === '<' && /[\w!/>]/.test(this.peek(1));
  }

  private parseExpressionElement(state: ExpressionState): ExpressionPartResult {
    this.flushExpressionString(state);
    const result = this.parseNode();
    if (!result.ok) return result;
    if (result.node) state.nodes.push(result.node);
    else state.currentString += this.advance();
    return { ok: true };
  }

  private flushExpressionString(state: ExpressionState): void {
    if (state.currentString) state.nodes.push(state.currentString);
    state.currentString = '';
  }

  private completeExpression(
    start: number,
    state: ExpressionState
  ): { ok: true; node: ExpressionNode } | { ok: false; error: ParseError } {
    if (state.depth !== 0) {
      return {
        ok: false,
        error: makeError('Unclosed expression `{`', this.full, this.bodyOffset + start),
      };
    }
    this.flushExpressionString(state);
    const source = state.nodes.map((node) => (typeof node === 'string' ? node : '[NODE]')).join('');
    return { ok: true, node: { type: 'expression', source, nodes: state.nodes } };
  }

  private parseStringLiteral(
    quote: string
  ): { ok: true; value: string } | { ok: false; error: ParseError } {
    const state = { value: quote };
    this.advance(); // consume opening quote
    while (!this.eof()) {
      const result = this.parseStringCharacter(quote, state);
      if (result === 'complete') return { ok: true, value: state.value };
      const interpolationResult = this.parseStringInterpolation(result, state);
      if (!interpolationResult.ok) return interpolationResult;
    }
    return { ok: false, error: this.error(`Unclosed string literal starting with ${quote}`) };
  }

  private parseStringCharacter(
    quote: string,
    state: { value: string }
  ): 'continue' | 'complete' | 'interpolation' {
    if (this.peek() === '\\') {
      state.value += this.advance(2);
      return 'continue';
    }
    if (this.peek() === quote) {
      state.value += this.advance();
      return 'complete';
    }
    if (this.isTemplateLiteralInterpolation(quote)) return 'interpolation';
    state.value += this.advance();
    return 'continue';
  }

  private isTemplateLiteralInterpolation(quote: string): boolean {
    return quote === '`' && this.at('${');
  }

  private parseStringInterpolation(
    result: 'continue' | 'interpolation',
    state: { value: string }
  ): { ok: true } | { ok: false; error: ParseError } {
    return result === 'interpolation'
      ? this.parseTemplateLiteralInterpolation(state)
      : { ok: true };
  }

  private parseTemplateLiteralInterpolation(state: {
    value: string;
  }): { ok: true } | { ok: false; error: ParseError } {
    state.value += this.advance(2);
    let depth = 1;
    while (this.hasTemplateLiteralInterpolationContent(depth)) {
      const ch = this.peek();
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      state.value += this.advance();
    }
    return { ok: true };
  }

  private hasTemplateLiteralInterpolationContent(depth: number): boolean {
    return !this.eof() && depth > 0;
  }

  // ── Element / special tags ─────────────────────────────────────────────────

  private parseElement(): { ok: true; node: TemplateNode } | { ok: false; error: ParseError } {
    const start = this.pos;
    this.advance(); // consume '<'

    const tag = this.readTagName();
    // ── <script> ──────────────────────────────────────────────────────────
    if (tag === 'script') {
      return this.parseRawTag<ScriptNode>('script', (content, attrs) => ({
        type: 'script',
        content,
        attrs,
      }));
    }

    // ── <style> ───────────────────────────────────────────────────────────
    if (tag === 'style') {
      return this.parseRawTag<StyleNode>('style', (content, attrs) => ({
        type: 'style',
        content,
        attrs,
      }));
    }

    // ── <slot> ────────────────────────────────────────────────────────────
    if (tag === 'slot') {
      return this.parseSlot();
    }

    // ── Generic element ───────────────────────────────────────────────────
    return this.parseGenericElement(tag, start);
  }

  private readTagName(): string {
    let name = '';
    if (this.peek() === '!') {
      name += this.advance();
    }
    while (!this.eof() && /[\w\-.:]/.test(this.peek())) {
      name += this.advance();
    }
    return name;
  }

  // ── <script> / <style> verbatim content ───────────────────────────────────

  private parseRawTag<T extends TemplateNode>(
    tagName: string,
    build: (content: string, attrs: (AttrNode | SpreadAttrNode)[]) => T
  ): { ok: true; node: T } | { ok: false; error: ParseError } {
    const attrsResult = this.parseAttributes(tagName);
    if (!attrsResult.ok) return attrsResult;

    const opening = this.consumeRawTagOpening(tagName);
    if (!opening.ok) return opening;
    if (opening.isSelfClosing) return { ok: true, node: build('', attrsResult.attrs) };
    return this.parseRawTagContent(tagName, attrsResult.attrs, build);
  }

  private consumeRawTagOpening(
    tagName: string
  ): { ok: true; isSelfClosing: boolean } | { ok: false; error: ParseError } {
    if (this.peek() === '/') return this.consumeSelfClosingRawTag();
    if (this.peek() !== '>') {
      return { ok: false, error: this.error(`Expected '>' to close <${tagName}> opening tag`) };
    }
    this.advance();
    return { ok: true, isSelfClosing: false };
  }

  private consumeSelfClosingRawTag():
    | { ok: true; isSelfClosing: true }
    | { ok: false; error: ParseError } {
    this.advance();
    if (this.peek() !== '>') return { ok: false, error: this.error(`Expected '>' after '/'`) };
    this.advance();
    return { ok: true, isSelfClosing: true };
  }

  private parseRawTagContent<T extends TemplateNode>(
    tagName: string,
    attrs: (AttrNode | SpreadAttrNode)[],
    build: (content: string, attrs: (AttrNode | SpreadAttrNode)[]) => T
  ): { ok: true; node: T } | { ok: false; error: ParseError } {
    const closeTag = `</${tagName}>`;
    const closeIdx = this.src.indexOf(closeTag, this.pos);
    if (closeIdx === -1) return { ok: false, error: this.error(`Unclosed <${tagName}> tag`) };

    const content = this.src.slice(this.pos, closeIdx);
    this.pos = closeIdx + closeTag.length;
    return { ok: true, node: build(content, attrs) };
  }

  // ── <slot> ────────────────────────────────────────────────────────────────

  private parseSlot(): { ok: true; node: SlotNode } | { ok: false; error: ParseError } {
    const attrsResult = this.parseAttributes('slot');
    if (!attrsResult.ok) return attrsResult;
    return this.parseSlotContent(this.getSlotDetails(attrsResult.attrs));
  }

  private getSlotDetails(attrs: (AttrNode | SpreadAttrNode)[]): {
    name: string;
    nameExpr: ExpressionNode | undefined;
    slot: string | undefined;
    slotExpr: ExpressionNode | undefined;
  } {
    const details: {
      name: string;
      nameExpr: ExpressionNode | undefined;
      slot: string | undefined;
      slotExpr: ExpressionNode | undefined;
    } = { name: '', nameExpr: undefined, slot: undefined, slotExpr: undefined };
    for (const attr of attrs) this.assignSlotDetail(details, attr);
    return details;
  }

  private assignSlotDetail(
    details: {
      name: string;
      nameExpr: ExpressionNode | undefined;
      slot: string | undefined;
      slotExpr: ExpressionNode | undefined;
    },
    attr: AttrNode | SpreadAttrNode
  ): void {
    if ('type' in attr) return;
    if (attr.name === 'name') this.assignSlotName(details, attr.value);
    else if (attr.name === 'slot') this.assignSlotAssignment(details, attr.value);
  }

  private assignSlotName(
    details: { name: string; nameExpr: ExpressionNode | undefined },
    value: AttrNode['value']
  ): void {
    if (typeof value === 'string') details.name = value;
    else if (value !== true) details.nameExpr = value;
  }

  private assignSlotAssignment(
    details: { slot: string | undefined; slotExpr: ExpressionNode | undefined },
    value: AttrNode['value']
  ): void {
    if (typeof value === 'string') details.slot = value;
    else if (value !== true) details.slotExpr = value;
  }

  private parseSlotContent(details: {
    name: string;
    nameExpr: ExpressionNode | undefined;
    slot: string | undefined;
    slotExpr: ExpressionNode | undefined;
  }): { ok: true; node: SlotNode } | { ok: false; error: ParseError } {
    if (this.at('/>')) {
      this.advance(2);
      return { ok: true, node: { type: 'slot', ...details, children: [] } };
    }
    if (this.peek() !== '>') {
      return { ok: false, error: this.error('Expected `/>` or `>` after <slot> attributes') };
    }
    this.advance();
    return this.parseSlotChildren(details);
  }

  private parseSlotChildren(details: {
    name: string;
    nameExpr: ExpressionNode | undefined;
    slot: string | undefined;
    slotExpr: ExpressionNode | undefined;
  }): { ok: true; node: SlotNode } | { ok: false; error: ParseError } {
    const children: TemplateNode[] = [];
    while (!this.eof()) {
      const result = this.parseSlotChild(children);
      if (!result.ok) return result;
      if (result.status !== 'continue')
        return this.completeSlotChildResult(result.status, details, children);
    }
    return { ok: false, error: this.error('Unclosed <slot> tag') };
  }

  private parseSlotChild(
    children: TemplateNode[]
  ): { ok: true; status: 'continue' | 'closing' | 'stop' } | { ok: false; error: ParseError } {
    if (this.at('</slot>')) {
      this.pos += 7;
      return { ok: true, status: 'closing' };
    }
    const result = this.parseChild(children);
    if (!result.ok) return result;
    return { ok: true, status: result.shouldStop ? 'stop' : 'continue' };
  }

  private completeSlotChildResult(
    status: 'closing' | 'stop',
    details: {
      name: string;
      nameExpr: ExpressionNode | undefined;
      slot: string | undefined;
      slotExpr: ExpressionNode | undefined;
    },
    children: TemplateNode[]
  ): { ok: true; node: SlotNode } | { ok: false; error: ParseError } {
    return status === 'closing'
      ? { ok: true, node: { type: 'slot', ...details, children } }
      : { ok: false, error: this.error('Unclosed <slot> tag') };
  }

  private parseChild(
    children: TemplateNode[]
  ): { ok: true; shouldStop: boolean } | { ok: false; error: ParseError } {
    const childStartPos = this.pos;
    const childResult = this.parseNode();
    if (!childResult.ok) return childResult;
    if (childResult.node === null) {
      return { ok: true, shouldStop: this.pos === childStartPos };
    }
    children.push(childResult.node);
    return { ok: true, shouldStop: false };
  }

  // ── Generic element ───────────────────────────────────────────────────────

  private parseGenericElement(
    tag: string,
    start: number
  ): { ok: true; node: ElementNode } | { ok: false; error: ParseError } {
    const attrsResult = this.parseAttributes(tag);
    if (!attrsResult.ok) return attrsResult;

    const opening = this.consumeGenericOpeningTag(tag, attrsResult.attrs);
    if (!opening.ok) return opening;
    if (opening.selfClosing) return opening;
    return this.parseOpenedGenericElement(tag, attrsResult.attrs, start);
  }

  private consumeGenericOpeningTag(
    tag: string,
    attrs: (AttrNode | SpreadAttrNode)[]
  ):
    | { ok: true; selfClosing: false }
    | { ok: true; selfClosing: true; node: ElementNode }
    | { ok: false; error: ParseError } {
    if (this.at('/>')) return this.parseSelfClosingElement(tag, attrs);
    if (this.peek() !== '>') return this.unclosedOpeningTagError(tag);
    this.advance();
    return { ok: true, selfClosing: false };
  }

  private parseOpenedGenericElement(
    tag: string,
    attrs: (AttrNode | SpreadAttrNode)[],
    start: number
  ): { ok: true; node: ElementNode } | { ok: false; error: ParseError } {
    if (this.hasRawAttribute(attrs)) return this.parseRawElement(tag, attrs);
    if (VOID_ELEMENTS.has(tag.toLowerCase())) {
      return { ok: true, node: this.createElement(tag, attrs, [], false) };
    }
    return this.parseElementChildren(tag, attrs, start);
  }

  private hasRawAttribute(attrs: (AttrNode | SpreadAttrNode)[]): boolean {
    return attrs.some((attr) => !('type' in attr) && attr.name === 'is:raw');
  }

  private parseSelfClosingElement(
    tag: string,
    attrs: (AttrNode | SpreadAttrNode)[]
  ): { ok: true; selfClosing: true; node: ElementNode } | { ok: false; error: ParseError } {
    this.advance(2);
    if ((tag === 'Fragment' || tag === '') && this.hasRawAttribute(attrs))
      return { ok: false, error: this.error('InvalidFragment: is:raw is not supported') };
    return {
      ok: true,
      selfClosing: true,
      node: this.createElement(tag, this.removeRawAttribute(attrs), [], true),
    };
  }

  private unclosedOpeningTagError(tag: string): { ok: false; error: ParseError } {
    return {
      ok: false,
      error: makeError(
        `Expected '>' or '/>' to close opening tag <${tag}>`,
        this.full,
        this.bodyOffset + this.pos
      ),
    };
  }

  private parseRawElement(
    tag: string,
    attrs: (AttrNode | SpreadAttrNode)[]
  ): { ok: true; node: ElementNode } | { ok: false; error: ParseError } {
    if (tag === 'Fragment' || tag === '') {
      return { ok: false, error: this.error('InvalidFragment: is:raw is not supported') };
    }
    const closeIdx = this.findRawClosingTag(tag);
    if (closeIdx === -1) {
      return { ok: false, error: this.error(`Unclosed <${tag}> tag with is:raw`) };
    }

    const closeTag = `</${tag}>`;
    const content = this.src.slice(this.pos, closeIdx);
    this.pos = closeIdx + closeTag.length;
    return {
      ok: true,
      node: this.createElement(
        tag,
        this.removeRawAttribute(attrs),
        [{ type: 'raw', html: content }],
        false
      ),
    };
  }

  private findRawClosingTag(tag: string): number {
    const closeTag = `</${tag}>`;
    let depth = 1;
    let cursor = this.pos;
    let closeIdx = -1;

    while (depth > 0) {
      const next = this.findNextRawTag(tag, closeTag, cursor);
      if (!next) return -1;
      depth += next.depthChange;
      cursor = next.cursor;
      if (next.closeIdx !== undefined) closeIdx = next.closeIdx;
    }
    return closeIdx;
  }

  private findNextRawTag(
    tag: string,
    closeTag: string,
    cursor: number
  ): { depthChange: number; cursor: number; closeIdx?: number } | undefined {
    const nextClose = this.src.indexOf(closeTag, cursor);
    if (nextClose === -1) return undefined;

    const nextOpen = this.findRawOpeningTag(tag, cursor);
    if (nextOpen !== -1 && nextOpen < nextClose) {
      return { depthChange: 1, cursor: nextOpen + tag.length + 1 };
    }
    return { depthChange: -1, cursor: nextClose + closeTag.length, closeIdx: nextClose };
  }

  private findRawOpeningTag(tag: string, cursor: number): number {
    const index = this.src.indexOf(`<${tag}`, cursor);
    if (index === -1) return -1;

    const nextCharacter = this.src[index + tag.length + 1];
    if (!nextCharacter) return index;
    return /[\s/>]/.test(nextCharacter) ? index : -1;
  }

  private parseElementChildren(
    tag: string,
    attrs: (AttrNode | SpreadAttrNode)[],
    start: number
  ): { ok: true; node: ElementNode } | { ok: false; error: ParseError } {
    const children: TemplateNode[] = [];
    while (!this.eof()) {
      const result = this.parseElementChild(tag, children);
      if (!result.ok) return result;
      if (result.status !== 'continue')
        return this.completeElementChildResult(result.status, tag, attrs, children, start);
    }
    return this.unclosedElementError(tag, start);
  }

  private parseElementChild(
    tag: string,
    children: TemplateNode[]
  ): { ok: true; status: 'continue' | 'closing' | 'stop' } | { ok: false; error: ParseError } {
    const closeResult = this.consumeMatchingClosingTag(tag);
    if (!closeResult.ok) return closeResult;
    if (closeResult.isClosing || this.at('</')) return { ok: true, status: 'closing' };
    return this.parseElementContentChild(children);
  }

  private parseElementContentChild(
    children: TemplateNode[]
  ): { ok: true; status: 'continue' | 'stop' } | { ok: false; error: ParseError } {
    const result = this.parseChild(children);
    if (!result.ok) return result;
    return { ok: true, status: result.shouldStop ? 'stop' : 'continue' };
  }

  private completeElementChildResult(
    status: 'closing' | 'stop',
    tag: string,
    attrs: (AttrNode | SpreadAttrNode)[],
    children: TemplateNode[],
    start: number
  ): { ok: true; node: ElementNode } | { ok: false; error: ParseError } {
    return status === 'closing'
      ? { ok: true, node: this.createElement(tag, attrs, children, false) }
      : this.unclosedElementError(tag, start);
  }

  private unclosedElementError(tag: string, start: number): { ok: false; error: ParseError } {
    return {
      ok: false,
      error: makeError(`Unclosed tag <${tag}>`, this.full, this.bodyOffset + start),
    };
  }

  private consumeMatchingClosingTag(
    tag: string
  ): { ok: true; isClosing: boolean } | { ok: false; error: ParseError } {
    if (tag === '') return this.consumeFragmentClosingTag();
    if (!this.isMatchingClosingTag(tag)) return { ok: true, isClosing: false };
    return this.consumeNamedClosingTag(tag);
  }

  private consumeFragmentClosingTag(): { ok: true; isClosing: boolean } {
    if (!this.at('</>')) return { ok: true, isClosing: false };
    this.pos += 3;
    return { ok: true, isClosing: true };
  }

  private isMatchingClosingTag(tag: string): boolean {
    const closeStart = `</${tag}`;
    if (!this.at(closeStart)) return false;
    const closingCharacter = this.full[this.bodyOffset + this.pos + closeStart.length] || '';
    return /[\s>]/.test(closingCharacter);
  }

  private consumeNamedClosingTag(
    tag: string
  ): { ok: true; isClosing: boolean } | { ok: false; error: ParseError } {
    this.pos += tag.length + 2;
    this.skipWhitespace();
    if (this.peek() !== '>') {
      return { ok: false, error: this.error(`Expected '>' to close </${tag}>`) };
    }
    this.advance();
    return { ok: true, isClosing: true };
  }

  private createElement(
    tag: string,
    attrs: (AttrNode | SpreadAttrNode)[],
    children: TemplateNode[],
    selfClosing: boolean
  ): ElementNode {
    return { type: 'element', tag, attrs, children, selfClosing };
  }

  private removeRawAttribute(attrs: (AttrNode | SpreadAttrNode)[]): (AttrNode | SpreadAttrNode)[] {
    return attrs.filter((attr) => 'type' in attr || attr.name !== 'is:raw');
  }

  // ── Attribute parsing ─────────────────────────────────────────────────────

  private parseAttributes(
    tagName?: string
  ): { ok: true; attrs: (AttrNode | SpreadAttrNode)[] } | { ok: false; error: ParseError } {
    const attrs: (AttrNode | SpreadAttrNode)[] = [];
    while (!this.eof()) {
      this.skipWhitespace();
      if (this.shouldStopParsingAttributes(tagName)) break;

      const result = this.parseAttribute();
      if (!result.ok) return result;
      attrs.push(result.attr);
    }
    return { ok: true, attrs };
  }

  private shouldStopParsingAttributes(tagName?: string): boolean {
    return this.eof() || this.isAttributeTerminator(tagName);
  }

  private isAttributeTerminator(tagName?: string): boolean {
    if (this.peek() === '>') return true;
    if (this.at('/>')) return true;
    return this.isRawAssetTag(tagName) && this.peek() === '/';
  }

  private isRawAssetTag(tagName: string | undefined): boolean {
    return tagName === 'script' || tagName === 'style';
  }

  private parseAttribute(): AttributeParseResult {
    return this.at('{...') ? this.parseSpreadAttribute() : this.parseNamedAttribute();
  }

  private parseSpreadAttribute(): AttributeParseResult {
    const result = this.parseExpression();
    if (!result.ok) return result;

    const expression = result.node;
    expression.source = expression.source.slice(3).trim();
    if (expression.nodes && typeof expression.nodes[0] === 'string') {
      expression.nodes[0] = expression.nodes[0].slice(3).trim();
    }
    return { ok: true, attr: { type: 'spread', expression } };
  }

  private parseNamedAttribute(): AttributeParseResult {
    const name = this.readAttrName();
    const nameError = this.attributeNameError(name);
    if (nameError) return nameError;

    this.skipWhitespace();
    if (this.peek() !== '=') return { ok: true, attr: { name, value: true } };

    this.advance(); // consume '='
    this.skipWhitespace();
    const valueResult = this.parseAttrValue();
    return valueResult.ok ? { ok: true, attr: { name, value: valueResult.value } } : valueResult;
  }

  private attributeNameError(name: string): AttributeParseResult | undefined {
    if (!name) return { ok: false, error: this.error('Expected attribute name') };
    return name === 'is:inline'
      ? { ok: false, error: this.error('InvalidDirective: is:inline is not supported') }
      : undefined;
  }

  private readAttrName(): string {
    let name = '';
    while (!this.eof() && /[^\s=/>]/.test(this.peek())) {
      name += this.advance();
    }
    return name;
  }

  private parseAttrValue():
    | { ok: true; value: string | ExpressionNode }
    | { ok: false; error: ParseError } {
    if (this.peek() === '{') return this.parseExpressionAttributeValue();
    if (this.isQuotedAttributeValue()) return this.parseQuotedAttributeValue(this.peek());
    return this.parseUnquotedAttributeValue();
  }

  private parseExpressionAttributeValue():
    | { ok: true; value: ExpressionNode }
    | { ok: false; error: ParseError } {
    const result = this.parseExpression();
    return result.ok ? { ok: true, value: result.node } : result;
  }

  private isQuotedAttributeValue(): boolean {
    return this.peek() === '"' || this.peek() === "'";
  }

  private parseQuotedAttributeValue(
    quote: string
  ): { ok: true; value: string } | { ok: false; error: ParseError } {
    this.advance(); // opening quote
    let value = '';
    while (!this.eof() && this.peek() !== quote) {
      value += this.advance();
    }
    if (this.eof()) return { ok: false, error: this.error(`Unclosed attribute value string`) };
    this.advance(); // closing quote
    return { ok: true, value };
  }

  private parseUnquotedAttributeValue(): { ok: true; value: string } {
    let value = '';
    while (!this.eof() && !/[\s>]/.test(this.peek())) {
      value += this.advance();
    }
    return { ok: true, value };
  }
}

// ─── Void elements (HTML5) ────────────────────────────────────────────────────

export const VOID_ELEMENTS = new Set([
  '!doctype',
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse an Astro-like template source string into a `TemplateAST`.
 *
 * Returns `{ ok: true, ast }` on success or `{ ok: false, error }` on failure.
 * All errors include a `line` and `column` pointing to the fault location.
 */
export function parse(source: string): ParseResult {
  // 1. Extract frontmatter
  const fmResult = extractFrontmatter(source);
  if (!fmResult.ok) return fmResult;

  const { frontmatter, imports, bodyStart } = fmResult.result;
  const bodySource = source.slice(bodyStart);

  // 2. Parse body
  const parser = new Parser(source, bodySource, bodyStart);
  const bodyResult = parser.parseBody();
  if (!bodyResult.ok) return bodyResult;

  const ast: TemplateAST = {
    frontmatter,
    body: bodyResult.nodes,
    imports,
  };

  return { ok: true, ast };
}
