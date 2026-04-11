/**
 * Pretty Printer
 *
 * Serializes a `TemplateAST` back into a syntactically correct template string.
 * The output is designed to round-trip through the parser (parse → print → parse
 * produces an equivalent AST).
 */
// ─── Attribute serialization ──────────────────────────────────────────────────
function printAttr(attr) {
    if ('type' in attr) {
        // Spread attribute: {...expr}
        return `{...${attr.expression}}`;
    }
    if (attr.value === true) {
        // Boolean attribute: just the name
        return attr.name;
    }
    if (typeof attr.value === 'string') {
        // String attribute: name="value"
        return `${attr.name}="${attr.value}"`;
    }
    // Expression attribute: name={expr}
    return `${attr.name}={${attr.value.source}}`;
}
function printAttrs(attrs) {
    if (!attrs || attrs.length === 0)
        return '';
    return ' ' + attrs.map(printAttr).join(' ');
}
// ─── Node serialization ───────────────────────────────────────────────────────
function printNode(node) {
    switch (node.type) {
        case 'text':
            return printText(node);
        case 'expression':
            return printExpression(node);
        case 'element':
            return printElement(node);
        case 'slot':
            return printSlot(node);
        case 'script':
            return printScript(node);
        case 'style':
            return printStyle(node);
        case 'raw':
            return printRaw(node);
    }
}
function printText(node) {
    return node.value;
}
function printExpression(node) {
    return `{${node.source}}`;
}
function printElement(node) {
    const attrs = printAttrs(node.attrs);
    if (node.selfClosing) {
        return `<${node.tag}${attrs} />`;
    }
    const children = node.children.map(printNode).join('');
    return `<${node.tag}${attrs}>${children}</${node.tag}>`;
}
function printSlot(node) {
    if (node.name === '') {
        return `<slot />`;
    }
    return `<slot name="${node.name}" />`;
}
function printScript(node) {
    const attrs = printAttrs(node.attrs);
    return `<script${attrs}>${node.content}</script>`;
}
function printStyle(node) {
    const attrs = printAttrs(node.attrs);
    return `<style${attrs}>${node.content}</style>`;
}
function printRaw(node) {
    return node.html;
}
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Serialize a `TemplateAST` back into a template source string.
 *
 * The output is syntactically correct and round-trips through the parser:
 * `parse(print(ast))` produces an AST structurally equivalent to `ast`.
 */
export function print(ast) {
    const parts = [];
    // Frontmatter — only emit fences when there is frontmatter content
    if (ast.frontmatter.source !== '') {
        parts.push('---\n');
        parts.push(ast.frontmatter.source);
        // Ensure the closing fence is on its own line
        if (!ast.frontmatter.source.endsWith('\n')) {
            parts.push('\n');
        }
        parts.push('---\n');
    }
    // Body nodes
    for (const node of ast.body) {
        parts.push(printNode(node));
    }
    return parts.join('');
}
//# sourceMappingURL=printer.js.map