import type { Cache } from './types.js';
/**
 * Compute a SHA-256 hex hash of a string using the browser-compatible
 * `crypto.subtle` API. Used as cache keys for string-based templates.
 */
export declare function hashTemplate(source: string): Promise<string>;
/**
 * Create a Cache instance backed by a Map.
 *
 * When `maxSize` is provided, the cache uses LRU eviction: the least-recently-used
 * entry is removed when the cache is full and a new entry is inserted.
 *
 * `get` updates recency — the accessed entry moves to the most-recently-used position.
 */
export declare function createCache(maxSize?: number): Cache;
//# sourceMappingURL=cache.d.ts.map