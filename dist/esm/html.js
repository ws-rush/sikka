import { escapeHtml, isRawHtml } from './escape.js';
const XML_DECL_RE = /^\s*(?:<\?xml[\s\S]*?\?>\s*)*/i;
const ROOT_OPEN_RE = /^<([a-zA-Z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/;
const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const ASSET_OR_COMMENT_RE = /<!--[\s\S]*?-->|<style\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/style>|<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/script>/gi;
/**
 * Extracts and deduplicates `<style>` and `<script>` tags from rendered HTML.
 * When `inject` is not `false` and `</head>` is present, injects them before `</head>`.
 */
export function extractAssets(html, options = {}) {
    const styles = new Set();
    const scripts = new Set();
    let stripped = html.replace(ASSET_OR_COMMENT_RE, (match) => {
        if (match.startsWith('<!--'))
            return match;
        const target = match.slice(1, 6).toLowerCase() === 'style' ? styles : scripts;
        target.add(match);
        return '';
    });
    const styleList = [...styles];
    const scriptList = [...scripts];
    if (options.inject !== false && (styleList.length > 0 || scriptList.length > 0)) {
        const headClose = stripped.search(/<\/head>/i);
        if (headClose !== -1) {
            stripped =
                stripped.slice(0, headClose) +
                    styleList.join('') +
                    scriptList.join('') +
                    stripped.slice(headClose);
        }
    }
    return { html: stripped, styles: styleList, scripts: scriptList };
}
/**
 * Coerces a `set:html` value, strips leading XML declarations, and merges
 * attribute maps onto the root element if present.
 */
export function mergeHtmlAttributes(raw, attrMaps, helpers) {
    const cleaned = coerceRawHtml(raw).replace(XML_DECL_RE, '').trim();
    if (attrMaps.length === 0)
        return cleaned;
    const match = ROOT_OPEN_RE.exec(cleaned);
    if (!match)
        return cleaned;
    const tag = match[1];
    const rawAttrs = match[2] ?? '';
    const selfClosing = rawAttrs.trimEnd().endsWith('/');
    const attrSource = selfClosing ? rawAttrs.trimEnd().slice(0, -1) : rawAttrs;
    const merged = parseAttributes(attrSource);
    for (const map of attrMaps) {
        if (map != null && typeof map === 'object') {
            applyAttributeMap(merged, map, helpers);
        }
    }
    const serialized = serializeAttributes(merged);
    const openTag = `<${tag}${serialized ? ` ${serialized}` : ''}${selfClosing ? ' /' : ''}>`;
    return openTag + cleaned.slice(match[0].length);
}
function coerceRawHtml(value) {
    if (typeof value === 'string')
        return value;
    if (isRawHtml(value))
        return value.value;
    if (Array.isArray(value))
        return value.map(coerceRawHtml).join('');
    return value == null ? '' : String(value);
}
function parseAttributes(source) {
    const map = new Map();
    for (const match of source.matchAll(ATTR_RE)) {
        const name = match[1];
        if (!name)
            continue;
        const value = match[2] ?? match[3] ?? match[4];
        map.set(name, value === undefined ? true : value);
    }
    return map;
}
function mergeClassAttr(target, value) {
    const next = typeof value === 'string' ? value.trim() : '';
    if (!next)
        return;
    const prev = target.get('class');
    target.set('class', typeof prev === 'string' && prev ? `${prev} ${next}` : next);
}
function mergeStyleAttr(target, value) {
    const next = typeof value === 'string' ? value.trim() : '';
    if (!next)
        return;
    const prev = target.get('style');
    if (typeof prev !== 'string' || !prev.trim()) {
        target.set('style', next);
        return;
    }
    const trimmed = prev.trim();
    const sep = trimmed.endsWith(';') ? ' ' : '; ';
    target.set('style', `${trimmed}${sep}${next}`);
}
function applyAttributeMap(target, attrs, helpers) {
    for (const [name, value] of Object.entries(attrs)) {
        applyAttributeEntry(target, name, value, helpers);
    }
}
function applyAttributeEntry(target, name, value, helpers) {
    if (name === 'set:html' || name === 'set:text') {
        throw new Error(`InvalidDirective: spread ${name} is not supported`);
    }
    if (name === 'class' || name === 'className')
        return mergeClassAttr(target, value);
    if (name === 'class:list')
        return mergeClassAttr(target, helpers.classList(value));
    if (name === 'style') {
        return mergeStyleAttr(target, typeof value === 'string' ? value : helpers.styleObject(value));
    }
    if (name.includes(':'))
        throw new Error(`InvalidDirective: unsupported spread directive ${name}`);
    if (value === false || value == null) {
        target.delete(name);
        return;
    }
    target.set(name, value === true ? true : String(value));
}
function serializeAttributes(attrs) {
    const parts = [];
    for (const [name, value] of attrs) {
        parts.push(value === true ? name : `${name}="${escapeHtml(value)}"`);
    }
    return parts.join(' ');
}
//# sourceMappingURL=html.js.map