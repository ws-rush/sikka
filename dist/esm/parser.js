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
function positionAt(source, offset) {
    let line = 1;
    let column = 1;
    for (let i = 0; i < offset && i < source.length; i++) {
        if (source[i] === '\n') {
            line++;
            column = 1;
        }
        else {
            column++;
        }
    }
    return { line, column };
}
function makeError(message, source, offset) {
    const { line, column } = positionAt(source, offset);
    return { message, category: 'Parse', line, column, construct: rejectedConstruct(message) };
}
function rejectedConstruct(message) {
    if (message.startsWith('InvalidDirective:'))
        return 'directive';
    if (message.startsWith('InvalidFragment:'))
        return 'Fragment';
    return undefined;
}
function extractFrontmatter(source) {
    if (!source.startsWith('---'))
        return emptyFrontmatter();
    const afterOpen = source.indexOf('\n', 3);
    if (afterOpen === -1) {
        return { ok: false, error: makeError('Unclosed frontmatter fence', source, 3) };
    }
    return extractFrontmatterContent(source, afterOpen);
}
function emptyFrontmatter() {
    return {
        ok: true,
        result: { frontmatter: { source: '', hasAwait: false }, imports: [], bodyStart: 0 },
    };
}
function extractFrontmatterContent(source, afterOpen) {
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
function skipFrontmatterNewline(source, bodyStart) {
    return source[bodyStart] === '\n' ? bodyStart + 1 : bodyStart;
}
function hasAwait(source) {
    return /\bawait\b/.test(source.replace(/\/\*[\s\S]*?\*\/|\/\/.*|(['"`])(?:\\.|(?!\1)[^\\])*\1/g, ''));
}
// ─── Import collection ────────────────────────────────────────────────────────
function collectImports(fmSource) {
    const imports = [];
    const re = /^\s*import(?:\s+([\s\S]*?)\s+from)?\s+['"]([^'"]+)['"]/gm;
    let match;
    while ((match = re.exec(fmSource)) !== null) {
        collectImportClause(match[1]?.trim() ?? '', match[2], imports);
    }
    return imports;
}
function collectImportClause(importClause, specifier, imports) {
    if (isTypeOnlyImport(importClause))
        return;
    if (collectNamespaceImport(importClause, specifier, imports))
        return;
    collectRegularImports(importClause, specifier, imports);
}
function collectRegularImports(importClause, specifier, imports) {
    const start = imports.length;
    for (const part of splitImportClause(importClause))
        collectImportPart(part, specifier, imports);
    if (imports.length === start)
        imports.push({ localName: '', specifier, isComponent: false });
}
function isTypeOnlyImport(importClause) {
    if (importClause.startsWith('type '))
        return true;
    const parts = importClause.replaceAll(/[{}]/g, '').split(',');
    return parts.length > 0 && parts.every((part) => part.trim().startsWith('type '));
}
function collectNamespaceImport(importClause, specifier, imports) {
    if (!importClause.startsWith('* as '))
        return false;
    imports.push(componentImport(importClause.slice(5).trim(), specifier));
    return true;
}
function collectImportPart(part, specifier, imports) {
    if (part.startsWith('{'))
        collectNamedImports(part, specifier, imports);
    else
        collectDefaultImport(part, specifier, imports);
}
function splitImportClause(importClause) {
    const parts = [];
    let current = '';
    let braceDepth = 0;
    for (const char of importClause) {
        braceDepth = updateBraceDepth(char, braceDepth);
        if (isTopLevelImportComma(char, braceDepth)) {
            parts.push(current.trim());
            current = '';
        }
        else {
            current += char;
        }
    }
    if (current)
        parts.push(current.trim());
    return parts;
}
function updateBraceDepth(char, depth) {
    if (char === '{')
        return depth + 1;
    if (char === '}')
        return depth - 1;
    return depth;
}
function isTopLevelImportComma(char, braceDepth) {
    return char === ',' && braceDepth === 0;
}
function collectNamedImports(part, specifier, imports) {
    const namedParts = part.slice(1).replace(/}$/, '').split(',');
    for (const named of namedParts)
        collectNamedImport(named, specifier, imports);
}
function collectNamedImport(named, specifier, imports) {
    const trimmed = named.trim();
    const localName = /(?:\s+as\s+)?(\w+)$/.exec(trimmed)?.[1];
    if (localName && !trimmed.startsWith('type '))
        imports.push(componentImport(localName, specifier));
}
function collectDefaultImport(part, specifier, imports) {
    const localName = /(\w+)$/.exec(part)?.[1];
    if (localName)
        imports.push(componentImport(localName, specifier));
}
function componentImport(localName, specifier) {
    return { localName, specifier, isComponent: specifier.endsWith('.astro') };
}
// ─── Body parser ─────────────────────────────────────────────────────────────
class Parser {
    full;
    src;
    bodyOffset;
    pos = 0;
    constructor(full, // full original source (for position reporting)
    src, // body slice
    bodyOffset // offset of body within full source
    ) {
        this.full = full;
        this.src = src;
        this.bodyOffset = bodyOffset;
    }
    // ── Utilities ──────────────────────────────────────────────────────────────
    peek(offset = 0) {
        return this.src[this.pos + offset] ?? '';
    }
    at(str) {
        return this.src.startsWith(str, this.pos);
    }
    advance(n = 1) {
        const ch = this.src.slice(this.pos, this.pos + n);
        this.pos += n;
        return ch;
    }
    skipWhitespace() {
        while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) {
            this.pos++;
        }
    }
    error(message) {
        return makeError(message, this.full, this.bodyOffset + this.pos);
    }
    eof() {
        return this.pos >= this.src.length;
    }
    // ── Top-level body parse ───────────────────────────────────────────────────
    parseBody() {
        const nodes = [];
        while (!this.eof()) {
            const result = this.parseBodyNode();
            if (!result.ok)
                return result;
            if (this.completeBodyNode(result, nodes))
                break;
        }
        return { ok: true, nodes };
    }
    completeBodyNode(result, nodes) {
        if (result.shouldStop)
            return true;
        if (result.node)
            nodes.push(result.node);
        return false;
    }
    parseBodyNode() {
        const start = this.pos;
        const result = this.parseNode();
        if (!result.ok)
            return result;
        return { ok: true, node: result.node, shouldStop: result.node === null && this.pos === start };
    }
    // ── Node dispatch ──────────────────────────────────────────────────────────
    parseNode() {
        if (this.eof())
            return { ok: true, node: null };
        if (this.peek() === '{')
            return this.parseExpression();
        if (this.peek() === '<')
            return this.parseTagNode();
        return this.parseText();
    }
    parseTagNode() {
        if (this.at('<!--'))
            return this.parseComment();
        if (this.at('</'))
            return { ok: true, node: null };
        return this.isElementOpening() ? this.parseElement() : this.parseText();
    }
    isElementOpening() {
        return /[\w!/>]/.test(this.peek(1));
    }
    // ── Text node ──────────────────────────────────────────────────────────────
    parseText() {
        let value = '';
        while (!this.eof() && !this.isTextBoundary()) {
            value += this.advance();
        }
        return { ok: true, node: { type: 'text', value } };
    }
    isTextBoundary() {
        return this.isExpressionBoundary() || this.isTagBoundary();
    }
    isExpressionBoundary() {
        return this.peek() === '{';
    }
    isTagBoundary() {
        if (this.peek() !== '<')
            return false;
        return this.at('<!--') || this.at('</') || this.isElementOpening();
    }
    // ── Comment ────────────────────────────────────────────────────────────────
    parseComment() {
        const end = this.src.indexOf('-->', this.pos + 4);
        if (end === -1) {
            return { ok: false, error: this.error('Unclosed HTML comment') };
        }
        const html = this.src.slice(this.pos, end + 3);
        this.pos = end + 3;
        return { ok: true, node: { type: 'raw', html } };
    }
    // ── Expression node ────────────────────────────────────────────────────────
    parseExpression() {
        const start = this.pos;
        this.advance(); // consume '{'
        const state = { depth: 1, nodes: [], currentString: '' };
        while (this.hasUnclosedExpression(state)) {
            const result = this.parseExpressionPart(state);
            if (!result.ok)
                return result;
        }
        return this.completeExpression(start, state);
    }
    hasUnclosedExpression(state) {
        return !this.eof() && state.depth > 0;
    }
    parseExpressionPart(state) {
        const braceResult = this.parseExpressionBrace(state);
        if (braceResult)
            return braceResult;
        const stringResult = this.parseExpressionString(state);
        if (stringResult)
            return stringResult;
        if (this.isExpressionElement())
            return this.parseExpressionElement(state);
        state.currentString += this.advance();
        return { ok: true };
    }
    parseExpressionBrace(state) {
        const ch = this.peek();
        if (ch === '{') {
            state.depth++;
            state.currentString += this.advance();
            return { ok: true };
        }
        if (ch !== '}')
            return undefined;
        state.depth--;
        this.consumeExpressionClosingBrace(state);
        return { ok: true };
    }
    consumeExpressionClosingBrace(state) {
        const closingBrace = this.advance();
        if (state.depth > 0)
            state.currentString += closingBrace;
    }
    parseExpressionString(state) {
        const quote = this.peek();
        if (!this.isStringQuote(quote))
            return undefined;
        const result = this.parseStringLiteral(quote);
        if (!result.ok)
            return result;
        state.currentString += result.value;
        return { ok: true };
    }
    isStringQuote(value) {
        return value === '"' || value === "'" || value === '`';
    }
    isExpressionElement() {
        return this.peek() === '<' && /[\w!/>]/.test(this.peek(1));
    }
    parseExpressionElement(state) {
        this.flushExpressionString(state);
        const result = this.parseNode();
        if (!result.ok)
            return result;
        if (result.node)
            state.nodes.push(result.node);
        else
            state.currentString += this.advance();
        return { ok: true };
    }
    flushExpressionString(state) {
        if (state.currentString)
            state.nodes.push(state.currentString);
        state.currentString = '';
    }
    completeExpression(start, state) {
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
    parseStringLiteral(quote) {
        const state = { value: quote };
        this.advance(); // consume opening quote
        while (!this.eof()) {
            const result = this.parseStringCharacter(quote, state);
            if (result === 'complete')
                return { ok: true, value: state.value };
            const interpolationResult = this.parseStringInterpolation(result, state);
            if (!interpolationResult.ok)
                return interpolationResult;
        }
        return { ok: false, error: this.error(`Unclosed string literal starting with ${quote}`) };
    }
    parseStringCharacter(quote, state) {
        if (this.peek() === '\\') {
            state.value += this.advance(2);
            return 'continue';
        }
        if (this.peek() === quote) {
            state.value += this.advance();
            return 'complete';
        }
        if (this.isTemplateLiteralInterpolation(quote))
            return 'interpolation';
        state.value += this.advance();
        return 'continue';
    }
    isTemplateLiteralInterpolation(quote) {
        return quote === '`' && this.at('${');
    }
    parseStringInterpolation(result, state) {
        return result === 'interpolation'
            ? this.parseTemplateLiteralInterpolation(state)
            : { ok: true };
    }
    parseTemplateLiteralInterpolation(state) {
        state.value += this.advance(2);
        let depth = 1;
        while (this.hasTemplateLiteralInterpolationContent(depth)) {
            const ch = this.peek();
            if (ch === '{')
                depth++;
            else if (ch === '}')
                depth--;
            state.value += this.advance();
        }
        return { ok: true };
    }
    hasTemplateLiteralInterpolationContent(depth) {
        return !this.eof() && depth > 0;
    }
    // ── Element / special tags ─────────────────────────────────────────────────
    parseElement() {
        const start = this.pos;
        this.advance(); // consume '<'
        const tag = this.readTagName();
        // ── <script> ──────────────────────────────────────────────────────────
        if (tag === 'script') {
            return this.parseRawTag('script', (content, attrs) => ({
                type: 'script',
                content,
                attrs,
            }));
        }
        // ── <style> ───────────────────────────────────────────────────────────
        if (tag === 'style') {
            return this.parseRawTag('style', (content, attrs) => ({
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
    readTagName() {
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
    parseRawTag(tagName, build) {
        const attrsResult = this.parseAttributes(tagName);
        if (!attrsResult.ok)
            return attrsResult;
        const opening = this.consumeRawTagOpening(tagName);
        if (!opening.ok)
            return opening;
        if (opening.isSelfClosing)
            return { ok: true, node: build('', attrsResult.attrs) };
        return this.parseRawTagContent(tagName, attrsResult.attrs, build);
    }
    consumeRawTagOpening(tagName) {
        if (this.peek() === '/')
            return this.consumeSelfClosingRawTag();
        if (this.peek() !== '>') {
            return { ok: false, error: this.error(`Expected '>' to close <${tagName}> opening tag`) };
        }
        this.advance();
        return { ok: true, isSelfClosing: false };
    }
    consumeSelfClosingRawTag() {
        this.advance();
        if (this.peek() !== '>')
            return { ok: false, error: this.error(`Expected '>' after '/'`) };
        this.advance();
        return { ok: true, isSelfClosing: true };
    }
    parseRawTagContent(tagName, attrs, build) {
        const closeTag = `</${tagName}>`;
        const closeIdx = this.src.indexOf(closeTag, this.pos);
        if (closeIdx === -1)
            return { ok: false, error: this.error(`Unclosed <${tagName}> tag`) };
        const content = this.src.slice(this.pos, closeIdx);
        this.pos = closeIdx + closeTag.length;
        return { ok: true, node: build(content, attrs) };
    }
    // ── <slot> ────────────────────────────────────────────────────────────────
    parseSlot() {
        const attrsResult = this.parseAttributes('slot');
        if (!attrsResult.ok)
            return attrsResult;
        return this.parseSlotContent(this.getSlotDetails(attrsResult.attrs));
    }
    getSlotDetails(attrs) {
        const details = { name: '', nameExpr: undefined, slot: undefined, slotExpr: undefined };
        for (const attr of attrs)
            this.assignSlotDetail(details, attr);
        return details;
    }
    assignSlotDetail(details, attr) {
        if ('type' in attr)
            return;
        if (attr.name === 'name')
            this.assignSlotName(details, attr.value);
        else if (attr.name === 'slot')
            this.assignSlotAssignment(details, attr.value);
    }
    assignSlotName(details, value) {
        if (typeof value === 'string')
            details.name = value;
        else if (value !== true)
            details.nameExpr = value;
    }
    assignSlotAssignment(details, value) {
        if (typeof value === 'string')
            details.slot = value;
        else if (value !== true)
            details.slotExpr = value;
    }
    parseSlotContent(details) {
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
    parseSlotChildren(details) {
        const children = [];
        while (!this.eof()) {
            const result = this.parseSlotChild(children);
            if (!result.ok)
                return result;
            if (result.status !== 'continue')
                return this.completeSlotChildResult(result.status, details, children);
        }
        return { ok: false, error: this.error('Unclosed <slot> tag') };
    }
    parseSlotChild(children) {
        if (this.at('</slot>')) {
            this.pos += 7;
            return { ok: true, status: 'closing' };
        }
        const result = this.parseChild(children);
        if (!result.ok)
            return result;
        return { ok: true, status: result.shouldStop ? 'stop' : 'continue' };
    }
    completeSlotChildResult(status, details, children) {
        return status === 'closing'
            ? { ok: true, node: { type: 'slot', ...details, children } }
            : { ok: false, error: this.error('Unclosed <slot> tag') };
    }
    parseChild(children) {
        const childStartPos = this.pos;
        const childResult = this.parseNode();
        if (!childResult.ok)
            return childResult;
        if (childResult.node === null) {
            return { ok: true, shouldStop: this.pos === childStartPos };
        }
        children.push(childResult.node);
        return { ok: true, shouldStop: false };
    }
    // ── Generic element ───────────────────────────────────────────────────────
    parseGenericElement(tag, start) {
        const attrsResult = this.parseAttributes(tag);
        if (!attrsResult.ok)
            return attrsResult;
        const opening = this.consumeGenericOpeningTag(tag, attrsResult.attrs);
        if (!opening.ok)
            return opening;
        if (opening.selfClosing)
            return opening;
        return this.parseOpenedGenericElement(tag, attrsResult.attrs, start);
    }
    consumeGenericOpeningTag(tag, attrs) {
        if (this.at('/>'))
            return this.parseSelfClosingElement(tag, attrs);
        if (this.peek() !== '>')
            return this.unclosedOpeningTagError(tag);
        this.advance();
        return { ok: true, selfClosing: false };
    }
    parseOpenedGenericElement(tag, attrs, start) {
        if (this.hasRawAttribute(attrs))
            return this.parseRawElement(tag, attrs);
        if (VOID_ELEMENTS.has(tag.toLowerCase())) {
            return { ok: true, node: this.createElement(tag, attrs, [], false) };
        }
        return this.parseElementChildren(tag, attrs, start);
    }
    hasRawAttribute(attrs) {
        return attrs.some((attr) => !('type' in attr) && attr.name === 'is:raw');
    }
    parseSelfClosingElement(tag, attrs) {
        this.advance(2);
        if ((tag === 'Fragment' || tag === '') && this.hasRawAttribute(attrs))
            return { ok: false, error: this.error('InvalidFragment: is:raw is not supported') };
        return {
            ok: true,
            selfClosing: true,
            node: this.createElement(tag, this.removeRawAttribute(attrs), [], true),
        };
    }
    unclosedOpeningTagError(tag) {
        return {
            ok: false,
            error: makeError(`Expected '>' or '/>' to close opening tag <${tag}>`, this.full, this.bodyOffset + this.pos),
        };
    }
    parseRawElement(tag, attrs) {
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
            node: this.createElement(tag, this.removeRawAttribute(attrs), [{ type: 'raw', html: content }], false),
        };
    }
    findRawClosingTag(tag) {
        const closeTag = `</${tag}>`;
        let depth = 1;
        let cursor = this.pos;
        let closeIdx = -1;
        while (depth > 0) {
            const next = this.findNextRawTag(tag, closeTag, cursor);
            if (!next)
                return -1;
            depth += next.depthChange;
            cursor = next.cursor;
            if (next.closeIdx !== undefined)
                closeIdx = next.closeIdx;
        }
        return closeIdx;
    }
    findNextRawTag(tag, closeTag, cursor) {
        const nextClose = this.src.indexOf(closeTag, cursor);
        if (nextClose === -1)
            return undefined;
        const nextOpen = this.findRawOpeningTag(tag, cursor);
        if (nextOpen !== -1 && nextOpen < nextClose) {
            return { depthChange: 1, cursor: nextOpen + tag.length + 1 };
        }
        return { depthChange: -1, cursor: nextClose + closeTag.length, closeIdx: nextClose };
    }
    findRawOpeningTag(tag, cursor) {
        const index = this.src.indexOf(`<${tag}`, cursor);
        if (index === -1)
            return -1;
        const nextCharacter = this.src[index + tag.length + 1];
        if (!nextCharacter)
            return index;
        return /[\s/>]/.test(nextCharacter) ? index : -1;
    }
    parseElementChildren(tag, attrs, start) {
        const children = [];
        while (!this.eof()) {
            const result = this.parseElementChild(tag, children);
            if (!result.ok)
                return result;
            if (result.status !== 'continue')
                return this.completeElementChildResult(result.status, tag, attrs, children, start);
        }
        return this.unclosedElementError(tag, start);
    }
    parseElementChild(tag, children) {
        const closeResult = this.consumeMatchingClosingTag(tag);
        if (!closeResult.ok)
            return closeResult;
        if (closeResult.isClosing || this.at('</'))
            return { ok: true, status: 'closing' };
        return this.parseElementContentChild(children);
    }
    parseElementContentChild(children) {
        const result = this.parseChild(children);
        if (!result.ok)
            return result;
        return { ok: true, status: result.shouldStop ? 'stop' : 'continue' };
    }
    completeElementChildResult(status, tag, attrs, children, start) {
        return status === 'closing'
            ? { ok: true, node: this.createElement(tag, attrs, children, false) }
            : this.unclosedElementError(tag, start);
    }
    unclosedElementError(tag, start) {
        return {
            ok: false,
            error: makeError(`Unclosed tag <${tag}>`, this.full, this.bodyOffset + start),
        };
    }
    consumeMatchingClosingTag(tag) {
        if (tag === '')
            return this.consumeFragmentClosingTag();
        if (!this.isMatchingClosingTag(tag))
            return { ok: true, isClosing: false };
        return this.consumeNamedClosingTag(tag);
    }
    consumeFragmentClosingTag() {
        if (!this.at('</>'))
            return { ok: true, isClosing: false };
        this.pos += 3;
        return { ok: true, isClosing: true };
    }
    isMatchingClosingTag(tag) {
        const closeStart = `</${tag}`;
        if (!this.at(closeStart))
            return false;
        const closingCharacter = this.full[this.bodyOffset + this.pos + closeStart.length] || '';
        return /[\s>]/.test(closingCharacter);
    }
    consumeNamedClosingTag(tag) {
        this.pos += tag.length + 2;
        this.skipWhitespace();
        if (this.peek() !== '>') {
            return { ok: false, error: this.error(`Expected '>' to close </${tag}>`) };
        }
        this.advance();
        return { ok: true, isClosing: true };
    }
    createElement(tag, attrs, children, selfClosing) {
        return { type: 'element', tag, attrs, children, selfClosing };
    }
    removeRawAttribute(attrs) {
        return attrs.filter((attr) => 'type' in attr || attr.name !== 'is:raw');
    }
    // ── Attribute parsing ─────────────────────────────────────────────────────
    parseAttributes(tagName) {
        const attrs = [];
        while (!this.eof()) {
            this.skipWhitespace();
            if (this.shouldStopParsingAttributes(tagName))
                break;
            const result = this.parseAttribute();
            if (!result.ok)
                return result;
            attrs.push(result.attr);
        }
        return { ok: true, attrs };
    }
    shouldStopParsingAttributes(tagName) {
        return this.eof() || this.isAttributeTerminator(tagName);
    }
    isAttributeTerminator(tagName) {
        if (this.peek() === '>')
            return true;
        if (this.at('/>'))
            return true;
        return this.isRawAssetTag(tagName) && this.peek() === '/';
    }
    isRawAssetTag(tagName) {
        return tagName === 'script' || tagName === 'style';
    }
    parseAttribute() {
        return this.at('{...') ? this.parseSpreadAttribute() : this.parseNamedAttribute();
    }
    parseSpreadAttribute() {
        const result = this.parseExpression();
        if (!result.ok)
            return result;
        const expression = result.node;
        expression.source = expression.source.slice(3).trim();
        if (expression.nodes && typeof expression.nodes[0] === 'string') {
            expression.nodes[0] = expression.nodes[0].slice(3).trim();
        }
        return { ok: true, attr: { type: 'spread', expression } };
    }
    parseNamedAttribute() {
        const name = this.readAttrName();
        const nameError = this.attributeNameError(name);
        if (nameError)
            return nameError;
        this.skipWhitespace();
        if (this.peek() !== '=')
            return { ok: true, attr: { name, value: true } };
        this.advance(); // consume '='
        this.skipWhitespace();
        const valueResult = this.parseAttrValue();
        return valueResult.ok ? { ok: true, attr: { name, value: valueResult.value } } : valueResult;
    }
    attributeNameError(name) {
        if (!name)
            return { ok: false, error: this.error('Expected attribute name') };
        return name === 'is:inline'
            ? { ok: false, error: this.error('InvalidDirective: is:inline is not supported') }
            : undefined;
    }
    readAttrName() {
        let name = '';
        while (!this.eof() && /[^\s=/>]/.test(this.peek())) {
            name += this.advance();
        }
        return name;
    }
    parseAttrValue() {
        if (this.peek() === '{')
            return this.parseExpressionAttributeValue();
        if (this.isQuotedAttributeValue())
            return this.parseQuotedAttributeValue(this.peek());
        return this.parseUnquotedAttributeValue();
    }
    parseExpressionAttributeValue() {
        const result = this.parseExpression();
        return result.ok ? { ok: true, value: result.node } : result;
    }
    isQuotedAttributeValue() {
        return this.peek() === '"' || this.peek() === "'";
    }
    parseQuotedAttributeValue(quote) {
        this.advance(); // opening quote
        let value = '';
        while (!this.eof() && this.peek() !== quote) {
            value += this.advance();
        }
        if (this.eof())
            return { ok: false, error: this.error(`Unclosed attribute value string`) };
        this.advance(); // closing quote
        return { ok: true, value };
    }
    parseUnquotedAttributeValue() {
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
export function parse(source) {
    // 1. Extract frontmatter
    const fmResult = extractFrontmatter(source);
    if (!fmResult.ok)
        return fmResult;
    const { frontmatter, imports, bodyStart } = fmResult.result;
    const bodySource = source.slice(bodyStart);
    // 2. Parse body
    const parser = new Parser(source, bodySource, bodyStart);
    const bodyResult = parser.parseBody();
    if (!bodyResult.ok)
        return bodyResult;
    const ast = {
        frontmatter,
        body: bodyResult.nodes,
        imports,
    };
    return { ok: true, ast };
}
//# sourceMappingURL=parser.js.map