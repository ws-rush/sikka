import { escapeHtml, RawHtml } from './escape.js';

export type SvgAttributes = Record<string, string | number | boolean | null | undefined>;

const XML_DECL_RE = /^\s*(?:<\?xml[\s\S]*?\?>\s*)*/i;
const SVG_OPEN_RE = /^<svg\b([^>]*)>/i;
const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/**
 * Normalizes raw SVG markup and merges attributes (such as `class` and `aria-*`)
 * onto the root `<svg>` element, returning trusted `RawHtml`.
 */
export function inlineSvg(svg: string, attrs?: SvgAttributes): RawHtml {
  const cleaned = svg.replace(XML_DECL_RE, '').trim();
  if (!attrs) return new RawHtml(cleaned);

  const match = SVG_OPEN_RE.exec(cleaned);
  if (!match) return new RawHtml(cleaned);

  const rawAttrs = match[1] ?? '';
  const selfClosing = rawAttrs.trimEnd().endsWith('/');
  const attrSource = selfClosing ? rawAttrs.trimEnd().slice(0, -1) : rawAttrs;

  const merged = parseAttributes(attrSource);
  applyAttributes(merged, attrs);

  const serialized = serializeAttributes(merged);
  const openTag = `<svg${serialized ? ` ${serialized}` : ''}${selfClosing ? ' /' : ''}>`;
  return new RawHtml(openTag + cleaned.slice(match[0].length));
}

function parseAttributes(source: string): Map<string, string | true> {
  const map = new Map<string, string | true>();
  for (const match of source.matchAll(ATTR_RE)) {
    const name = match[1];
    if (!name) continue;
    const value = match[2] ?? match[3] ?? match[4];
    map.set(name, value === undefined ? true : value);
  }
  return map;
}

function mergeClassAttr(target: Map<string, string | true>, value: unknown): void {
  const next = typeof value === 'string' ? value.trim() : '';
  if (!next) return;
  const prev = target.get('class');
  target.set('class', typeof prev === 'string' && prev ? `${prev} ${next}` : next);
}

function applyAttribute(
  target: Map<string, string | true>,
  name: string,
  value: SvgAttributes[string]
): void {
  if (name === 'class') return mergeClassAttr(target, value);
  if (value === false || value == null) {
    target.delete(name);
    return;
  }
  target.set(name, value === true ? true : String(value));
}

function applyAttributes(target: Map<string, string | true>, attrs: SvgAttributes): void {
  for (const [name, value] of Object.entries(attrs)) {
    applyAttribute(target, name, value);
  }
}

function serializeAttributes(attrs: Map<string, string | true>): string {
  const parts: string[] = [];
  for (const [name, value] of attrs) {
    parts.push(value === true ? name : `${name}="${escapeHtml(value)}"`);
  }
  return parts.join(' ');
}
