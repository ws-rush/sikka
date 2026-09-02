/**
 * HTML Escaper
 *
 * Provides:
 *   - `RawHtml`  — a wrapper that marks content as trusted/pre-escaped
 *   - `escapeHtml` — escapes untrusted values before HTML insertion
 */

/** Wraps a string that should be inserted into HTML output verbatim (no escaping). */
const RAW_HTML = Symbol.for('sikka.raw-html');

export class RawHtml {
  [RAW_HTML] = true;
  constructor(public readonly value: string) {}
}

const ESCAPE_TEST_RE = /[&<>"']/;

/**
 * Escape an untrusted value for safe HTML insertion.
 */
export function escapeHtml(value: unknown): string {
  if (typeof value === 'string') return escapeString(value);
  if (isRawHtml(value)) return value.value;
  if (Array.isArray(value)) return escapeArray(value);
  return escapeString(stringifyHtml(value));
}

/** Coerce an Expression value without HTML escaping. */
export function stringifyHtml(value: unknown): string {
  return Array.isArray(value) ? stringifyArray(value) : stringifyValue(value);
}

function stringifyValue(value: unknown): string {
  if (value == null || typeof value === 'boolean') return '';
  if (isRawHtml(value)) return value.value;
  return String(value);
}

function isRawHtml(value: unknown): value is { value: string } {
  return value instanceof RawHtml || isBrandedRawHtml(value);
}

function isBrandedRawHtml(value: unknown): value is { value: string } {
  if (Object(value) !== value) return false;
  const raw = value as { [RAW_HTML]?: unknown; value?: unknown };
  return raw[RAW_HTML] === true && typeof raw.value === 'string';
}

function escapeString(value: string): string {
  const match = ESCAPE_TEST_RE.exec(value);
  return match ? replaceEscapedCharacters(value, match.index) : value;
}

function replaceEscapedCharacters(value: string, start: number): string {
  let output = '';
  let lastIndex = 0;
  for (let index = start; index < value.length; index++) {
    let escaped: string;
    switch (value.charCodeAt(index)) {
      case 34:
        escaped = '&quot;';
        break;
      case 38:
        escaped = '&amp;';
        break;
      case 39:
        escaped = '&#39;';
        break;
      case 60:
        escaped = '&lt;';
        break;
      case 62:
        escaped = '&gt;';
        break;
      default:
        continue;
    }
    output += value.slice(lastIndex, index) + escaped;
    lastIndex = index + 1;
  }
  return output + value.slice(lastIndex);
}

function escapeArray(values: unknown[]): string {
  let output = '';
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    output += value instanceof RawHtml ? value.value : escapeHtml(value);
  }
  return output;
}

function stringifyArray(values: unknown[]): string {
  let output = '';
  for (let index = 0; index < values.length; index++) output += stringifyHtml(values[index]);
  return output;
}
