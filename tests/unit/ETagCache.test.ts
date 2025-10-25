/**
 * ETagCache Unit Tests
 *
 * Tests cache eviction, TTL expiration, ETag handling edge cases,
 * cache key creation and retrieval, and capacity management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ETagCache } from '../../src/core/http/ETagCache';
import type { ETagKey, HttpResponse } from '../../src/core/http/types';

describe('ETagCache', () => {
  let cache: ETagCache;

  beforeEach(() => {
    cache = new ETagCache();
  });

  describe('Basic Cache Operations', () => {
    it('should store and retrieve cached data', () => {
      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      const etag = 'W/"abc123"';

      cache.set(key, response, etag);

      const cached = cache.get(key);
      expect(cached).toBeDefined();
      expect(cached?.etag).toBe(etag);
      expect(cached?.payload).toEqual(response);
      expect(cached?.timestamp).toBeTypeOf('number');
    });

    it('should return undefined for non-existent key', () => {
      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const cached = cache.get(key);
      expect(cached).toBeUndefined();
    });

    it('should return undefined when no ETag provided', () => {
      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      // Set without ETag
      cache.set(key, response, undefined);

      const cached = cache.get(key);
      expect(cached).toBeUndefined();
    });

    it('should return undefined when ETag is null', () => {
      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      // Set with null ETag
      cache.set(key, response, null as any);

      const cached = cache.get(key);
      expect(cached).toBeUndefined();
    });
  });

  describe('TTL Expiration', () => {
    it('should return undefined for expired entries', () => {
      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      const etag = 'W/"abc123"';

      // Set cache entry
      cache.set(key, response, etag);

      // Mock Date.now to simulate time passing beyond TTL
      const originalNow = Date.now;
      const currentTime = originalNow();
      vi.spyOn(Date, 'now').mockReturnValue(currentTime + cache.ttl + 1000); // 1 second past TTL

      const cached = cache.get(key);
      expect(cached).toBeUndefined();

      // Restore original Date.now
      vi.spyOn(Date, 'now').mockRestore();
    });

    it('should return cached data within TTL', () => {
      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      const etag = 'W/"abc123"';

      // Set cache entry
      cache.set(key, response, etag);

      // Mock Date.now to simulate time within TTL
      const originalNow = Date.now;
      const currentTime = originalNow();
      vi.spyOn(Date, 'now').mockReturnValue(currentTime + cache.ttl - 1000); // 1 second before TTL

      const cached = cache.get(key);
      expect(cached).toBeDefined();
      expect(cached?.etag).toBe(etag);
      expect(cached?.payload).toEqual(response);

      // Restore original Date.now
      vi.spyOn(Date, 'now').mockRestore();
    });

    it('should handle TTL at exact boundary', () => {
      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      const etag = 'W/"abc123"';

      // Set cache entry
      cache.set(key, response, etag);

      // Mock Date.now to simulate time exactly at TTL boundary
      const originalNow = Date.now;
      const currentTime = originalNow();
      vi.spyOn(Date, 'now').mockReturnValue(currentTime + cache.ttl + 1); // 1ms past boundary

      const cached = cache.get(key);
      expect(cached).toBeUndefined(); // Should be expired at exact boundary

      // Restore original Date.now
      vi.spyOn(Date, 'now').mockRestore();
    });
  });

  describe('Cache Eviction at Capacity', () => {
    it('should evict oldest entry when at capacity', () => {
      // Set a small max size for testing
      cache.maxSize = 3;

      const keys: ETagKey[] = [
        { userId: 'user-1', provider: 'github', resource: 'repos' },
        { userId: 'user-2', provider: 'github', resource: 'repos' },
        { userId: 'user-3', provider: 'github', resource: 'repos' },
        { userId: 'user-4', provider: 'github', resource: 'repos' },
      ];

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      // Fill cache to capacity
      keys.slice(0, 3).forEach((key, index) => {
        cache.set(key, response, `etag-${index}`);
      });

      // Verify all entries are cached
      expect(cache.get(keys[0])).toBeDefined();
      expect(cache.get(keys[1])).toBeDefined();
      expect(cache.get(keys[2])).toBeDefined();

      // Add one more entry to trigger eviction
      cache.set(keys[3], response, 'etag-3');

      // First entry should be evicted (oldest)
      expect(cache.get(keys[0])).toBeUndefined();
      expect(cache.get(keys[1])).toBeDefined();
      expect(cache.get(keys[2])).toBeDefined();
      expect(cache.get(keys[3])).toBeDefined();
    });

    it('should handle eviction when cache is exactly at capacity', () => {
      cache.maxSize = 2;

      const keys: ETagKey[] = [
        { userId: 'user-1', provider: 'github', resource: 'repos' },
        { userId: 'user-2', provider: 'github', resource: 'repos' },
      ];

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      // Fill cache to exact capacity
      keys.forEach((key, index) => {
        cache.set(key, response, `etag-${index}`);
      });

      // Verify all entries are cached
      expect(cache.get(keys[0])).toBeDefined();
      expect(cache.get(keys[1])).toBeDefined();

      // Add one more entry to trigger eviction
      const newKey: ETagKey = { userId: 'user-3', provider: 'github', resource: 'repos' };
      cache.set(newKey, response, 'etag-3');

      // First entry should be evicted
      expect(cache.get(keys[0])).toBeUndefined();
      expect(cache.get(keys[1])).toBeDefined();
      expect(cache.get(newKey)).toBeDefined();
    });

    it('should handle eviction with empty cache', () => {
      cache.maxSize = 0;

      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      // Should not throw when trying to evict from empty cache
      expect(() => {
        cache.set(key, response, 'etag-123');
      }).not.toThrow();
    });
  });

  describe('ETag Handling', () => {
    it('should handle different ETag formats', () => {
      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      const etagFormats = ['W/"abc123"', '"def456"', 'etag789', 'strong-etag', 'W/"weak-etag"'];

      etagFormats.forEach((etag, index) => {
        const testKey: ETagKey = {
          userId: `user-${index}`,
          provider: 'github',
          resource: 'repos',
        };

        cache.set(testKey, response, etag);
        const cached = cache.get(testKey);
        expect(cached?.etag).toBe(etag);
      });
    });

    it('should handle empty string ETag', () => {
      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      cache.set(key, response, '');

      const cached = cache.get(key);
      expect(cached).toBeUndefined(); // Empty string should be treated as no ETag
    });
  });

  describe('Cache Key Creation and Retrieval', () => {
    it('should create unique keys for different users', () => {
      const keys: ETagKey[] = [
        { userId: 'user-1', provider: 'github', resource: 'repos' },
        { userId: 'user-2', provider: 'github', resource: 'repos' },
      ];

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      keys.forEach((key, index) => {
        cache.set(key, response, `etag-${index}`);
      });

      // Both should be cached separately
      expect(cache.get(keys[0])).toBeDefined();
      expect(cache.get(keys[1])).toBeDefined();
      expect(cache.get(keys[0])?.etag).toBe('etag-0');
      expect(cache.get(keys[1])?.etag).toBe('etag-1');
    });

    it('should create unique keys for different providers', () => {
      const keys: ETagKey[] = [
        { userId: 'user-1', provider: 'github', resource: 'repos' },
        { userId: 'user-1', provider: 'google', resource: 'repos' },
      ];

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      keys.forEach((key, index) => {
        cache.set(key, response, `etag-${index}`);
      });

      // Both should be cached separately
      expect(cache.get(keys[0])).toBeDefined();
      expect(cache.get(keys[1])).toBeDefined();
      expect(cache.get(keys[0])?.etag).toBe('etag-0');
      expect(cache.get(keys[1])?.etag).toBe('etag-1');
    });

    it('should create unique keys for different resources', () => {
      const keys: ETagKey[] = [
        { userId: 'user-1', provider: 'github', resource: 'repos' },
        { userId: 'user-1', provider: 'github', resource: 'issues' },
      ];

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      keys.forEach((key, index) => {
        cache.set(key, response, `etag-${index}`);
      });

      // Both should be cached separately
      expect(cache.get(keys[0])).toBeDefined();
      expect(cache.get(keys[1])).toBeDefined();
      expect(cache.get(keys[0])?.etag).toBe('etag-0');
      expect(cache.get(keys[1])?.etag).toBe('etag-1');
    });

    it('should handle getETag method', () => {
      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      const etag = 'W/"abc123"';

      cache.set(key, response, etag);

      const retrievedETag = cache.getETag(key);
      expect(retrievedETag).toBe(etag);
    });

    it('should return undefined for getETag when entry does not exist', () => {
      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const retrievedETag = cache.getETag(key);
      expect(retrievedETag).toBeUndefined();
    });

    it('should return undefined for getETag when entry is expired', () => {
      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      const etag = 'W/"abc123"';

      cache.set(key, response, etag);

      // Mock Date.now to simulate time passing beyond TTL
      const originalNow = Date.now;
      const currentTime = originalNow();
      vi.spyOn(Date, 'now').mockReturnValue(currentTime + cache.ttl + 1000);

      const retrievedETag = cache.getETag(key);
      expect(retrievedETag).toBeUndefined();

      // Restore original Date.now
      vi.spyOn(Date, 'now').mockRestore();
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle concurrent cache operations', () => {
      const keys: ETagKey[] = Array.from({ length: 10 }, (_, i) => ({
        userId: `user-${i}`,
        provider: 'github',
        resource: 'repos',
      }));

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      // Concurrent set operations
      keys.forEach((key, index) => {
        cache.set(key, response, `etag-${index}`);
      });

      // All should be cached
      keys.forEach((key, index) => {
        const cached = cache.get(key);
        expect(cached).toBeDefined();
        expect(cached?.etag).toBe(`etag-${index}`);
      });
    });

    it('should handle cache with very large payloads', () => {
      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `repo-${i}`,
        description: 'A very long description that takes up space'.repeat(10),
      }));

      const response: HttpResponse<unknown> = {
        data: largeData,
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      const etag = 'W/"large-payload"';

      cache.set(key, response, etag);

      const cached = cache.get(key);
      expect(cached).toBeDefined();
      expect(cached?.etag).toBe(etag);
      expect(cached?.payload.data).toEqual(largeData);
    });

    it('should handle cache with special characters in keys', () => {
      const keys: ETagKey[] = [
        { userId: 'user@domain.com', provider: 'github', resource: 'repos' },
        { userId: 'user-123', provider: 'google+', resource: 'repos' },
        { userId: 'user-123', provider: 'github', resource: 'repos/with/slashes' },
      ];

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      keys.forEach((key, index) => {
        cache.set(key, response, `etag-${index}`);
      });

      keys.forEach((_key, index) => {
        const cached = cache.get(keys[index]);
        expect(cached).toBeDefined();
        expect(cached?.etag).toBe(`etag-${index}`);
      });
    });

    it('should handle cache with different response types', () => {
      const responses: HttpResponse<unknown>[] = [
        { data: [{ id: 1, name: 'repo1' }], status: 200, headers: {} },
        { data: null, status: 404, headers: {} },
        { data: 'error message', status: 500, headers: {} },
        { data: { error: 'Not found' }, status: 404, headers: {} },
      ];

      responses.forEach((response, index) => {
        const testKey: ETagKey = {
          userId: `user-${index}`,
          provider: 'github',
          resource: 'repos',
        };

        cache.set(testKey, response, `etag-${index}`);

        const cached = cache.get(testKey);
        expect(cached).toBeDefined();
        expect(cached?.payload).toEqual(response);
      });
    });
  });

  describe('Cache Configuration', () => {
    it('should use default TTL', () => {
      expect(cache.ttl).toBe(3600000); // 1 hour in milliseconds
    });

    it('should use default max size', () => {
      expect(cache.maxSize).toBe(1000);
    });

    it('should allow TTL modification', () => {
      const newTTL = 1800000; // 30 minutes
      cache.ttl = newTTL;
      expect(cache.ttl).toBe(newTTL);
    });

    it('should handle TTL edge cases', () => {
      // Test with very small TTL
      cache.ttl = 1; // 1 millisecond

      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      cache.set(key, response, 'etag-123');

      // Wait a bit to ensure expiration
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10);

      // Should be immediately expired
      const cached = cache.get(key);
      expect(cached).toBeUndefined();
      
      vi.spyOn(Date, 'now').mockRestore();
    });

    it('should handle zero TTL', () => {
      cache.ttl = 0;

      const key: ETagKey = {
        userId: 'user-123',
        provider: 'github',
        resource: 'repos',
      };

      const response: HttpResponse<unknown> = {
        data: [{ id: 1, name: 'repo1' }],
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      cache.set(key, response, 'etag-123');

      // Wait a bit to ensure expiration
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1);

      // Should be immediately expired
      const cached = cache.get(key);
      expect(cached).toBeUndefined();
      
      vi.spyOn(Date, 'now').mockRestore();
    });
  });
});
