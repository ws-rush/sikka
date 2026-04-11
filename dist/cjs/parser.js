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
    return { message, line, column };
}
function extractFrontmatter(source) {
    // Frontmatter is optional — if the file doesn't start with ---, body starts at 0
    if (!source.startsWith('---')) {
        return {
            ok: true,
            result: {
                frontmatter: { source: '' },
                imports: [],
                bodyStart: 0,
            },
        };
    }
    // Skip the opening fence (including optional trailing whitespace/newline)
    const afterOpen = source.indexOf('\n', 3);
    if (afterOpen === -1) {
        // No newline after opening fence — malformed
        return { ok: false, error: makeError('Unclosed frontmatter fence', source, 3) };
    }
    // Find the closing ---
    const closeIndex = source.indexOf('\n---', afterOpen);
    if (closeIndex === -1) {
        return {
            ok: false,
            error: makeError('Unclosed frontmatter fence: missing closing `---`', source, source.length),
        };
    }
    const fmSource = source.slice(afterOpen + 1, closeIndex);
    const imports = collectImports(fmSource);
    // Body starts after the closing fence line
    const bodyStart = closeIndex + 4; // skip \n---
    // Skip optional newline right after closing fence
    const actualBodyStart = bodyStart < source.length && source[bodyStart] === '\n' ? bodyStart + 1 : bodyStart;
    return {
        ok: true,
        result: {
            frontmatter: { source: fmSource },
            imports,
            bodyStart: actualBodyStart,
        },
    };
}
// ─── Import collection ────────────────────────────────────────────────────────
const IMPORT_LOCAL_RE = /^\s*import\s+(?:(\w+)|(?:\{[^}]*\}))\s+from\s+['"]([^'"]+)['"]/;
function collectImports(fmSource) {
    const imports = [];
    const lines = fmSource.split('\n');
    for (const line of lines) {
        const m = IMPORT_LOCAL_RE.exec(line);
        if (m) {
            imports.push({ localName: m[1] || 'default', specifier: m[2] });
        }
    }
    return imports;
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
            const startPos = this.pos;
            const result = this.parseNode();
            if (!result.ok)
                return result;
            if (result.node === null) {
                // If we didn't advance, we hit an unexpected closing tag
                if (this.pos === startPos)
                    break;
                // Otherwise (e.g. comment), just continue
                continue;
            }
            nodes.push(result.node);
        }
        return { ok: true, nodes };
    }
    // ── Node dispatch ──────────────────────────────────────────────────────────
    parseNode() {
        if (this.eof())
            return { ok: true, node: null };
        // Expression node: {expr}
        if (this.peek() === '{') {
            return this.parseExpression();
        }
        // Tag node: <...
        if (this.peek() === '<') {
            // Comment: <!-- ... -->
            if (this.at('<!--')) {
                return this.parseComment();
            }
            // Closing tag — caller handles this
            if (this.at('</')) {
                return { ok: true, node: null };
            }
            // Check if it's followed by a valid tag name start char or > for fragment
            if (/[\w!/>]/.test(this.peek(1))) {
                return this.parseElement();
            }
        }
        // Text node
        return this.parseText();
    }
    // ── Text node ──────────────────────────────────────────────────────────────
    parseText() {
        let value = '';
        while (!this.eof()) {
            const ch = this.peek();
            if (ch === '{')
                break;
            if (ch === '<') {
                // If it's a comment, expression, closing tag, or valid tag start, break
                if (this.at('<!--') || this.at('</') || /[\w!/>]/.test(this.peek(1))) {
                    break;
                }
            }
            value += this.advance();
        }
        return { ok: true, node: { type: 'text', value } };
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
        let depth = 1;
        let source = '';
        while (!this.eof() && depth > 0) {
            const ch = this.peek();
            if (ch === '{') {
                depth++;
                source += this.advance();
            }
            else if (ch === '}') {
                depth--;
                if (depth > 0)
                    source += this.advance();
                else
                    this.advance(); // consume closing '}'
            }
            else if (ch === '"' || ch === "'" || ch === '`') {
                const str = this.parseStringLiteral(ch);
                if (!str.ok)
                    return str;
                source += str.value;
            }
            else {
                source += this.advance();
            }
        }
        if (depth !== 0) {
            return {
                ok: false,
                error: makeError('Unclosed expression `{`', this.full, this.bodyOffset + start),
            };
        }
        return { ok: true, node: { type: 'expression', source } };
    }
    parseStringLiteral(quote) {
        let value = quote;
        this.advance(); // consume opening quote
        while (!this.eof()) {
            const ch = this.peek();
            if (ch === '\\') {
                value += this.advance(); // backslash
                value += this.advance(); // escaped char
            }
            else if (ch === quote) {
                value += this.advance(); // closing quote
                return { ok: true, value };
            }
            else if (quote === '`' && this.at('${')) {
                // Template literal interpolation — consume until matching }
                value += this.advance(); // $
                value += this.advance(); // {
                let depth = 1;
                while (!this.eof() && depth > 0) {
                    const c = this.peek();
                    if (c === '{') {
                        depth++;
                        value += this.advance();
                    }
                    else if (c === '}') {
                        depth--;
                        if (depth > 0)
                            value += this.advance();
                        else
                            value += this.advance();
                    }
                    else {
                        value += this.advance();
                    }
                }
            }
            else {
                value += this.advance();
            }
        }
        return { ok: false, error: this.error(`Unclosed string literal starting with ${quote}`) };
    }
    // ── Element / special tags ─────────────────────────────────────────────────
    parseElement() {
        const start = this.pos;
        this.advance(); // consume '<'
        const tag = this.readTagName();
        if (!tag && this.peek() !== '>' && !this.at('/>')) {
            return {
                ok: false,
                error: makeError('Expected tag name after `<`', this.full, this.bodyOffset + start),
            };
        }
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
        // Parse (and discard) attributes then consume '>'
        const attrsResult = this.parseAttributes(tagName);
        if (!attrsResult.ok)
            return attrsResult;
        if (this.peek() === '/') {
            // Self-closing <script /> or <style /> — empty content
            this.advance(); // /
            if (this.peek() !== '>') {
                return { ok: false, error: this.error(`Expected '>' after '/'`) };
            }
            this.advance(); // >
            return { ok: true, node: build('', attrsResult.attrs) };
        }
        if (this.peek() !== '>') {
            return { ok: false, error: this.error(`Expected '>' to close <${tagName}> opening tag`) };
        }
        this.advance(); // >
        const closeTag = `</${tagName}>`;
        const closeIdx = this.src.indexOf(closeTag, this.pos);
        if (closeIdx === -1) {
            return { ok: false, error: this.error(`Unclosed <${tagName}> tag`) };
        }
        const content = this.src.slice(this.pos, closeIdx);
        this.pos = closeIdx + closeTag.length;
        return { ok: true, node: build(content, attrsResult.attrs) };
    }
    // ── <slot> ────────────────────────────────────────────────────────────────
    parseSlot() {
        const attrsResult = this.parseAttributes('slot');
        if (!attrsResult.ok)
            return attrsResult;
        // Determine slot name from `name="..."` attribute
        let name = '';
        for (const attr of attrsResult.attrs) {
            if (!('type' in attr) && attr.name === 'name' && typeof attr.value === 'string') {
                name = attr.value;
            }
        }
        // Consume self-closing /> or parse children until </slot>
        if (this.at('/>')) {
            this.advance(2);
            return { ok: true, node: { type: 'slot', name, children: [] } };
        }
        else if (this.peek() === '>') {
            this.advance();
            const children = [];
            while (!this.eof()) {
                if (this.at('</slot>')) {
                    this.pos += 7;
                    return { ok: true, node: { type: 'slot', name, children } };
                }
                const childStartPos = this.pos;
                const childResult = this.parseNode();
                if (!childResult.ok)
                    return childResult;
                if (childResult.node === null) {
                    if (this.pos === childStartPos)
                        break;
                    continue;
                }
                children.push(childResult.node);
            }
            return { ok: false, error: this.error('Unclosed <slot> tag') };
        }
        else {
            return { ok: false, error: this.error('Expected `/>` or `>` after <slot> attributes') };
        }
    }
    // ── Generic element ───────────────────────────────────────────────────────
    parseGenericElement(tag, start) {
        const attrsResult = this.parseAttributes(tag);
        if (!attrsResult.ok)
            return attrsResult;
        // Determine if this is a raw tag (is:raw)
        const isRaw = attrsResult.attrs.some((a) => !('type' in a) && a.name === 'is:raw');
        // Self-closing
        if (this.at('/>')) {
            this.advance(2);
            return {
                ok: true,
                node: {
                    type: 'element',
                    tag,
                    attrs: attrsResult.attrs.filter((a) => 'type' in a || a.name !== 'is:raw'),
                    children: [],
                    selfClosing: true,
                },
            };
        }
        if (this.peek() !== '>') {
            return {
                ok: false,
                error: makeError(`Expected '>' or '/>' to close opening tag <${tag}>`, this.full, this.bodyOffset + this.pos),
            };
        }
        this.advance(); // >
        if (isRaw) {
            if (tag === 'Fragment' || tag === '') {
                return { ok: false, error: this.error('is:raw is not supported on Fragments') };
            }
            const closeTag = `</${tag}>`;
            const closeIdx = this.src.indexOf(closeTag, this.pos);
            if (closeIdx === -1) {
                return { ok: false, error: this.error(`Unclosed <${tag}> tag with is:raw`) };
            }
            const rawContent = this.src.slice(this.pos, closeIdx);
            this.pos = closeIdx + closeTag.length;
            return {
                ok: true,
                node: {
                    type: 'element',
                    tag,
                    attrs: attrsResult.attrs.filter((a) => 'type' in a || a.name !== 'is:raw'),
                    children: [{ type: 'raw', html: rawContent }],
                    selfClosing: false,
                },
            };
        }
        // Void elements — no children, no closing tag
        if (VOID_ELEMENTS.has(tag)) {
            return {
                ok: true,
                node: { type: 'element', tag, attrs: attrsResult.attrs, children: [], selfClosing: false },
            };
        }
        // Parse children until </tag>
        const children = [];
        while (!this.eof()) {
            let isClosingTag = false;
            if (tag === '') {
                if (this.at('</>')) {
                    isClosingTag = true;
                    this.pos += 3;
                }
            }
            else {
                if (this.at(`</${tag}`) &&
                    /[\s>]/.test(this.full[this.bodyOffset + this.pos + 2 + tag.length] || '')) {
                    isClosingTag = true;
                    this.pos += 2 + tag.length; // </tag
                    this.skipWhitespace();
                    if (this.peek() !== '>') {
                        return {
                            ok: false,
                            error: this.error(`Expected '>' to close </${tag}>`),
                        };
                    }
                    this.advance(); // >
                }
            }
            if (isClosingTag) {
                return {
                    ok: true,
                    node: { type: 'element', tag, attrs: attrsResult.attrs, children, selfClosing: false },
                };
            }
            // Closing tag for an ancestor or mismatched — stop parsing children
            if (this.at('</')) {
                return {
                    ok: true,
                    node: { type: 'element', tag, attrs: attrsResult.attrs, children, selfClosing: false },
                };
            }
            const childStartPos = this.pos;
            const childResult = this.parseNode();
            if (!childResult.ok)
                return childResult;
            if (childResult.node === null) {
                // We hit a closing tag that didn't match, or a comment.
                // If pos didn't advance, we must break to avoid infinite loop.
                if (this.pos === childStartPos)
                    break;
                continue;
            }
            children.push(childResult.node);
        }
        return {
            ok: false,
            error: makeError(`Unclosed tag <${tag}>`, this.full, this.bodyOffset + start),
        };
    }
    // ── Attribute parsing ─────────────────────────────────────────────────────
    parseAttributes(tagName) {
        const attrs = [];
        while (!this.eof()) {
            this.skipWhitespace();
            // End of opening tag
            if (this.peek() === '>' ||
                this.at('/>') ||
                (tagName === 'script' || tagName === 'style' ? this.peek() === '/' : false))
                break;
            if (this.at('{...')) {
                const exprResult = this.parseExpression();
                if (!exprResult.ok)
                    return exprResult;
                let expr = exprResult.node.source.trim();
                if (expr.startsWith('...')) {
                    expr = expr.slice(3).trim();
                }
                attrs.push({ type: 'spread', expression: expr });
                continue;
            }
            // Attribute name
            const name = this.readAttrName();
            if (!name) {
                // If we are at EOF or hit unexpected char and not at tag end, it's an error
                if (this.eof())
                    break;
                return { ok: false, error: this.error('Expected attribute name') };
            }
            this.skipWhitespace();
            // Boolean attribute (no value)
            if (this.peek() !== '=') {
                attrs.push({ name, value: true });
                continue;
            }
            this.advance(); // consume '='
            this.skipWhitespace();
            // Attribute value
            const valResult = this.parseAttrValue();
            if (!valResult.ok)
                return valResult;
            attrs.push({ name, value: valResult.value });
        }
        return { ok: true, attrs };
    }
    readAttrName() {
        let name = '';
        while (!this.eof() && /[^\s=/>]/.test(this.peek())) {
            name += this.advance();
        }
        return name;
    }
    parseAttrValue() {
        const ch = this.peek();
        // Dynamic expression value: attr={expr}
        if (ch === '{') {
            const exprResult = this.parseExpression();
            if (!exprResult.ok)
                return exprResult;
            return { ok: true, value: exprResult.node };
        }
        // Quoted string value
        if (ch === '"' || ch === "'") {
            this.advance(); // opening quote
            let value = '';
            while (!this.eof() && this.peek() !== ch) {
                value += this.advance();
            }
            if (this.eof()) {
                return { ok: false, error: this.error(`Unclosed attribute value string`) };
            }
            this.advance(); // closing quote
            return { ok: true, value };
        }
        // Unquoted value (read until whitespace or >)
        let value = '';
        while (!this.eof() && !/[\s>]/.test(this.peek())) {
            value += this.advance();
        }
        return { ok: true, value };
    }
}
// ─── Void elements (HTML5) ────────────────────────────────────────────────────
export const VOID_ELEMENTS = new Set([
    '!DOCTYPE',
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