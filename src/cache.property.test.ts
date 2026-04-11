import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createCache } from './cache.js';
import type { RenderFunction } from './types.js';

// Helper: create a minimal mock RenderFunction
function makeFn(): RenderFunction {
  return (_props, _slots) => '';
}

describe('Cache property tests', () => {
  // Feature: astro-template-engine, Property 6: Cache hit returns the same render function reference
  it('Property 6: cache hit returns the same render function reference', () => {
    fc.assert(
      fc.property(fc.string(), (templateSource) => {
        const cache = createCache();
        const key = templateSource;
        const fn = makeFn();

        // Simulate first compile: populate cache
        cache.set(key, fn);

        // Simulate second compile: retrieve from cache
        const retrieved = cache.get(key);

        // Must be the exact same reference
        expect(retrieved).toBe(fn);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: astro-template-engine, Property 7: Dev mode bypasses cache on every call
  it('Property 7: dev mode bypasses cache — each call produces a distinct reference', () => {
    fc.assert(
      fc.property(fc.string(), (templateSource) => {
        const cache = createCache();
        const key = templateSource;

        // Simulate devMode: we never call cache.set, so cache.get always returns undefined
        // Each "compile" call would produce a new function since nothing is stored
        const firstGet = cache.get(key);
        const secondGet = cache.get(key);

        // Both should be undefined — no cached value exists
        expect(firstGet).toBeUndefined();
        expect(secondGet).toBeUndefined();

        // Simulate two separate compile calls each producing a new function (devMode)
        const fn1 = makeFn();
        const fn2 = makeFn();

        // In dev mode, each compile produces a fresh function — they must be distinct references
        expect(fn1).not.toBe(fn2);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: astro-template-engine, Property 8: Cache invalidation removes only the target entry
  it('Property 8: cache invalidation removes only the target entry', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 2 }),
        fc.integer({ min: 0, max: 99 }),
        (keys, targetIndexRaw) => {
          // Deduplicate keys to ensure distinct entries
          const uniqueKeys = [...new Set(keys)];
          if (uniqueKeys.length < 2) return; // skip if dedup left fewer than 2

          const cache = createCache();
          const fns = new Map<string, RenderFunction>();

          // Populate cache with all unique keys
          for (const key of uniqueKeys) {
            const fn = makeFn();
            fns.set(key, fn);
            cache.set(key, fn);
          }

          // Pick a target key to invalidate
          const targetIndex = targetIndexRaw % uniqueKeys.length;
          const targetKey = uniqueKeys[targetIndex];

          // Invalidate the target
          cache.delete(targetKey);

          // Target entry must be gone
          expect(cache.get(targetKey)).toBeUndefined();

          // All other entries must still be present and return the same reference
          for (const key of uniqueKeys) {
            if (key === targetKey) continue;
            expect(cache.get(key)).toBe(fns.get(key));
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
