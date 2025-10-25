"use strict";
// src/core/http/ETagCache.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ETagCache = void 0;
class ETagCache {
    cache = new Map();
    maxSize = 1000;
    ttl = 3600000; // 1 hour
    get(key) {
        const cacheKey = this.createKey(key);
        const cached = this.cache.get(cacheKey);
        if (!cached)
            return undefined;
        // Check TTL
        if (Date.now() - cached.timestamp > this.ttl) {
            this.cache.delete(cacheKey);
            return undefined;
        }
        return cached;
    }
    set(key, payload, etag) {
        if (!etag)
            return; // Skip if no ETag provided
        const cacheKey = this.createKey(key);
        // Evict oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(cacheKey, {
            etag,
            payload,
            timestamp: Date.now(),
        });
    }
    getETag(key) {
        return this.get(key)?.etag;
    }
    createKey(key) {
        return `${key.userId}:${key.provider}:${key.resource}`;
    }
}
exports.ETagCache = ETagCache;
//# sourceMappingURL=ETagCache.js.map