/**
 * HTML Escaper
 *
 * Provides:
 *   - `RawHtml`  — a wrapper that marks content as trusted/pre-escaped
 *   - `escapeHtml` — escapes untrusted values before HTML insertion
 */

/** Wraps a string that should be inserted into HTML output verbatim (no escaping). */
export class RawHtml {
  __isRawHtml = true;
  constructor(public readonly value: string) {}
}

const ESCAPE_TEST_RE = /[&<>"']/;

/**
 * Escape an untrusted value for safe HTML insertion.
 */
export function escapeHtml(value: unknown): string {
  if (typeof value === 'string') return escapeString(value);
  if (value instanceof RawHtml) return value.value;
  if (Array.isArray(value)) return escapeArray(value);
  return escapeString(stringifyHtml(value));
}

/** Coerce an Expression value without HTML escaping. */
export function stringifyHtml(value: unknown): string {
  return Array.isArray(value) ? stringifyArray(value) : stringifyValue(value);
}

function stringifyValue(value: unknown): string {
  if (value == null || typeof value === 'boolean') return '';
  if (value instanceof RawHtml) return value.value;
  return String(value);
}

function escapeString(value: string): string {
  const match = ESCAPE_TEST_RE.exec(value);
  return match ? replaceEscapedCharacters(value, match.index) : value;
}

function replaceEscapedCharacters(value: string, start: number): string {
  let output = '';
  let lastIndex = 0;
  for (let index = start; index < value.length; index++) {
    const escaped = escapeCharacterCode(value.charCodeAt(index));
    if (escaped === undefined) continue;
    output += value.slice(lastIndex, index) + escaped;
    lastIndex = index + 1;
  }
  return output + value.slice(lastIndex);
}

function escapeCharacterCode(code: number): string | undefined {
  return code < 40 ? escapeLowCharacterCode(code) : escapeHighCharacterCode(code);
}

function escapeLowCharacterCode(code: number): string | undefined {
  switch (code) {
    case 34:
      return '&quot;';
    case 38:
      return '&amp;';
    case 39:
      return '&#39;';
  }
}

function escapeHighCharacterCode(code: number): string | undefined {
  switch (code) {
    case 60:
      return '&lt;';
    case 62:
      return '&gt;';
  }
}

function escapeArray(values: unknown[]): string {
  let output = '';
  for (let index = 0; index < values.length; index++) output += escapeHtml(values[index]);
  return output;
}

function stringifyArray(values: unknown[]): string {
  let output = '';
  for (let index = 0; index < values.length; index++) output += stringifyHtml(values[index]);
  return output;
}
