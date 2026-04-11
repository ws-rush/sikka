import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { escapeHtml, html, RawHtml } from './escape.js';

// The set of characters that must be escaped
const SPECIAL_CHARS = ['&', '<', '>', '"', "'"];

// Arbitrary that always contains at least one special HTML character
const stringWithSpecialChar = fc
  .tuple(fc.string(), fc.constantFrom(...SPECIAL_CHARS), fc.string())
  .map(([pre, special, post]) => pre + special + post);

describe('HTML Escaper — Property-Based Tests', () => {
  it(// Feature: astro-template-engine, Property 2: HTML escaping applied to all interpolated strings
  'Property 2: escapeHtml never leaves unescaped special chars in string output', () => {
    const ENTITY_MAP: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    fc.assert(
      fc.property(stringWithSpecialChar, (value) => {
        const result = escapeHtml(value);
        // The result must equal the manually escaped version of the input
        const expected = value.replace(/[&<>"']/g, (ch) => ENTITY_MAP[ch]);
        expect(result).toBe(expected);
        // Specifically: none of the raw special chars appear outside of entity sequences.
        // We verify by checking the result contains no bare < > " ' and no bare & that
        // isn't the start of a known entity.
        expect(result).not.toMatch(/<|>|"|'/);
        expect(result).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#39;)/);
      }),
      { numRuns: 100 }
    );
  });

  it(// Feature: astro-template-engine, Property 2: HTML escaping applied to all interpolated strings (non-string primitives)
  'Property 2: escapeHtml coerces integers and booleans to string and escapes them', () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer(), fc.boolean()), (value) => {
        const result = escapeHtml(value);
        // Result must equal the escaped string representation
        const expected = String(value).replace(/[&<>"']/g, (ch) => {
          const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          };
          return map[ch];
        });
        expect(result).toBe(expected);
        // No raw special chars in output
        for (const ch of SPECIAL_CHARS) {
          expect(result).not.toContain(ch);
        }
      }),
      { numRuns: 100 }
    );
  });

  it(// Feature: astro-template-engine, Property 3: Raw/trusted content is inserted verbatim
  'Property 3: html tagged template inserts raw string verbatim without escaping', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        // Pass value as a RawHtml (trusted) — escapeHtml should return it unchanged
        const raw = new RawHtml(value);
        const result = escapeHtml(raw);
        expect(result).toBe(value);
      }),
      { numRuns: 100 }
    );
  });

  it(// Feature: astro-template-engine, Property 3: Raw/trusted content is inserted verbatim (html tag)
  'Property 3: html`` tag produces RawHtml whose value equals the assembled string', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        // Static string in the template — should appear verbatim in the RawHtml value
        const result = html`${new RawHtml(value)}`;
        expect(result).toBeInstanceOf(RawHtml);
        expect(result.value).toBe(value);
      }),
      { numRuns: 100 }
    );
  });

  it(// Feature: astro-template-engine, Property 4: RawHtml is idempotent — no double-escaping
  'Property 4: wrapping an already-escaped string in RawHtml does not double-escape', () => {
    // Generate strings that already contain HTML entities
    const entityString = fc.string().map((s) =>
      s.replace(/[&<>"']/g, (ch) => {
        const map: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        };
        return map[ch];
      })
    );

    fc.assert(
      fc.property(entityString, (alreadyEscaped) => {
        const raw = new RawHtml(alreadyEscaped);
        const result = escapeHtml(raw);
        // Must come out exactly as it went in — no second pass of escaping
        expect(result).toBe(alreadyEscaped);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 5: null and undefined always produce an empty string', () => {
    fc.assert(
      fc.property(fc.constantFrom(null, undefined), (value) => {
        expect(escapeHtml(value)).toBe('');
      }),
      { numRuns: 100 }
    );
  });

  it('escapes arrays by joining their escaped elements', () => {
    const arr = ['<b>', new RawHtml('<i>')];
    expect(escapeHtml(arr)).toBe('&lt;b&gt;<i>');
  });
});
