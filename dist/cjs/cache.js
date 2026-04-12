/**
 * Create a Cache instance backed by a Map.
 *
 * When `maxSize` is provided, the cache uses LRU eviction: the least-recently-used
 * entry is removed when the cache is full and a new entry is inserted.
 *
 * `get` updates recency — the accessed entry moves to the most-recently-used position.
 */
export function createCache(maxSize) {
    // Map preserves insertion order; we exploit this for LRU tracking.
    // Most-recently-used entries are at the end; LRU entry is at the front.
    const store = new Map();
    return {
        get(key) {
            const fn = store.get(key);
            if (fn === undefined)
                return undefined;
            // Move to most-recently-used position by re-inserting at the end.
            store.delete(key);
            store.set(key, fn);
            return fn;
        },
        set(key, fn) {
            if (store.has(key)) {
                // Update existing entry and move to MRU position.
                store.delete(key);
            }
            else if (maxSize !== undefined && store.size >= maxSize) {
                // Evict the least-recently-used entry (first key in the Map).
                const lruKey = store.keys().next().value;
                if (lruKey !== undefined) {
                    store.delete(lruKey);
                }
            }
            store.set(key, fn);
        },
        delete(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        },
    };
}
//# sourceMappingURL=cache.js.map