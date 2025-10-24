/**
 * Distributed Refresh Lock Integration Tests
 *
 * Tests concurrent token refresh scenarios to ensure distributed locks
 * prevent race conditions when multiple instances try to refresh the same token.
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectorSDK } from '../../src/sdk';
import { AuthCore } from '../../src/core/auth/AuthCore';
import { TokenStore } from '../../src/core/token/TokenStore';
import { DistributedRefreshLock } from '../../src/core/token/DistributedRefreshLock';
import type { InitConfig } from '../../src/sdk';
import type { TokenSet } from '../../src/core/token/types';

describe('Distributed Refresh Lock Integration', () => {
  let sdk1: ConnectorSDK;
  let sdk2: ConnectorSDK;
  const userId = 'concurrent-test-user';
  const provider = 'github';

  const createTestConfig = (_instanceId: string): InitConfig => ({
    tokenStore: {
      backend: 'redis',
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      preRefreshMarginMinutes: 5,
      expiredTokenBufferMinutes: 5,
    },
    http: {
      retry: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        retryableStatusCodes: [429, 500, 502, 503, 504],
      },
    },
    rateLimits: {
      github: { qps: 5, concurrency: 10 },
      google: { qps: 2, concurrency: 5 },
      reddit: { qps: 1, concurrency: 3 },
      twitter: { qps: 0.5, concurrency: 2 },
      x: { qps: 0.5, concurrency: 2 },
      rss: { qps: 10, concurrency: 5 },
    },
    providers: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID || 'test-client-id',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || 'test-secret',
        scopes: ['user:email'],
        redirectUri: 'http://localhost:3000/callback/github',
        usePKCE: true,
      },
    },
    metrics: { enabled: false },
    logging: { level: 'debug' },
  });

  beforeEach(async () => {
    // Initialize two SDK instances to simulate distributed environment
    sdk1 = await ConnectorSDK.init(createTestConfig('instance-1'));
    sdk2 = await ConnectorSDK.init(createTestConfig('instance-2'));
  });

  afterEach(async () => {
    // Clean up test tokens
    try {
      await sdk1.disconnect(provider, userId);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Concurrent Token Refresh Prevention', () => {
    it('should prevent race conditions when multiple instances refresh simultaneously', async () => {
      // Create an expired token that needs refresh
      const expiredToken: TokenSet = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
        tokenType: 'Bearer',
        scope: 'user:email',
      };

      // Mock the token store to return expired token
      const tokenStore1 = (sdk1 as any).core.tokens as TokenStore;

      await tokenStore1.setToken(userId, provider, expiredToken);

      // Mock AuthCore refresh to simulate network delay
      const authCore1 = (sdk1 as any).core.auth as AuthCore;
      const authCore2 = (sdk2 as any).core.auth as AuthCore;

      let refreshCallCount = 0;

      const mockRefresh = vi.fn().mockImplementation(async (_provider, _refreshToken) => {
        refreshCallCount++;
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 100));

        return {
          accessToken: `new-access-token-${refreshCallCount}`,
          refreshToken: 'new-refresh-token',
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
          tokenType: 'Bearer',
          scope: 'user:email',
        };
      });

      // Replace refresh method on both instances
      authCore1.refreshToken = mockRefresh;
      authCore2.refreshToken = mockRefresh;

      // Simulate concurrent fetch operations that trigger token refresh
      const fetchPromises = [
        sdk1.fetch(provider, userId, { limit: 1 }).catch(() => null),
        sdk2.fetch(provider, userId, { limit: 1 }).catch(() => null),
        sdk1.fetch(provider, userId, { limit: 1 }).catch(() => null),
        sdk2.fetch(provider, userId, { limit: 1 }).catch(() => null),
      ];

      await Promise.allSettled(fetchPromises);

      // Distributed lock should ensure only one refresh call is made
      expect(refreshCallCount).toBe(1);
    });

    it('should handle Redis connection failures gracefully', async () => {
      // Create config with invalid Redis URL to test fallback behavior
      const invalidConfig = createTestConfig('redis-fail-test');
      invalidConfig.tokenStore.url = 'redis://invalid-host:6379';

      const sdkWithInvalidRedis = await ConnectorSDK.init(invalidConfig);

      // Should still work with local locks when Redis is unavailable
      const authUrl = await sdkWithInvalidRedis.connect(provider, userId);
      expect(authUrl).toBeTruthy();
      expect(authUrl).toContain('github.com');
    });
  });

  describe('Lock Acquisition and Release', () => {
    it('should acquire and release locks properly', async () => {
      const refreshLock = (sdk1 as any).core.refreshLock as DistributedRefreshLock;

      // Test lock acquisition
      const acquired = await refreshLock.tryAcquire(userId, provider);
      expect(acquired).toBe(true);

      // Second attempt should fail
      const secondAttempt = await refreshLock.tryAcquire(userId, provider);
      expect(secondAttempt).toBe(false);

      // Release lock
      await refreshLock.release(userId, provider);

      // Should be able to acquire again
      const afterRelease = await refreshLock.tryAcquire(userId, provider);
      expect(afterRelease).toBe(true);

      await refreshLock.release(userId, provider);
    });

    it('should handle lock timeouts', async () => {
      const refreshLock = (sdk1 as any).core.refreshLock as DistributedRefreshLock;

      // Acquire lock
      await refreshLock.tryAcquire(userId, provider);

      // Wait for release should timeout appropriately
      const waitStart = Date.now();
      await refreshLock.waitForRelease(userId, provider);
      const waitTime = Date.now() - waitStart;

      // Should wait reasonable amount but not forever
      expect(waitTime).toBeGreaterThan(100);
      expect(waitTime).toBeLessThan(5000);
    });
  });

  describe('Token Refresh Metrics', () => {
    it('should track deduplication metrics', async () => {
      const metrics1 = (sdk1 as any).core.metrics;
      const metrics2 = (sdk2 as any).core.metrics;

      // Mock metrics to track calls
      const localDedupSpy = vi.spyOn(metrics1, 'incrementCounter');
      const distributedDedupSpy = vi.spyOn(metrics2, 'incrementCounter');

      // Create scenario that triggers deduplication
      const expiredToken: TokenSet = {
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() - 60000),
        tokenType: 'Bearer',
      };

      const tokenStore = (sdk1 as any).core.tokens as TokenStore;
      await tokenStore.setToken(userId, provider, expiredToken);

      // Concurrent operations should trigger dedup metrics
      await Promise.allSettled([
        sdk1.fetch(provider, userId).catch(() => null),
        sdk2.fetch(provider, userId).catch(() => null),
      ]);

      // Check that deduplication metrics were recorded
      expect(localDedupSpy).toHaveBeenCalled();
      expect(distributedDedupSpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling in Distributed Scenarios', () => {
    it('should handle network errors during refresh', async () => {
      const authCore = (sdk1 as any).core.auth as AuthCore;

      // Mock network error during refresh
      authCore.refreshToken = vi.fn().mockRejectedValue(new Error('Network timeout'));

      const expiredToken: TokenSet = {
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() - 60000),
        tokenType: 'Bearer',
      };

      const tokenStore = (sdk1 as any).core.tokens as TokenStore;
      await tokenStore.setToken(userId, provider, expiredToken);

      // Should handle refresh errors gracefully
      await expect(sdk1.fetch(provider, userId)).rejects.toThrow();
    });

    it('should clean up locks on refresh failure', async () => {
      const refreshLock = (sdk1 as any).core.refreshLock as DistributedRefreshLock;
      const authCore = (sdk1 as any).core.auth as AuthCore;

      // Mock refresh failure
      authCore.refreshToken = vi.fn().mockRejectedValue(new Error('Refresh failed'));

      const expiredToken: TokenSet = {
        accessToken: 'expired-token',
        refreshToken: 'invalid-refresh-token',
        expiresAt: new Date(Date.now() - 60000),
        tokenType: 'Bearer',
      };

      const tokenStore = (sdk1 as any).core.tokens as TokenStore;
      await tokenStore.setToken(userId, provider, expiredToken);

      // Attempt refresh (will fail)
      await expect(sdk1.fetch(provider, userId)).rejects.toThrow();

      // Lock should be released even on failure
      const canAcquire = await refreshLock.tryAcquire(userId, provider);
      expect(canAcquire).toBe(true);

      await refreshLock.release(userId, provider);
    });
  });

  describe('Connection Health Monitoring', () => {
    it('should report distributed lock health status', () => {
      const health1 = sdk1.getHealth();
      const health2 = sdk2.getHealth();

      expect(health1.distributedLocks).toBeDefined();
      expect(health1.distributedLocks.mode).toMatch(/^(distributed|local-only)$/);
      expect(typeof health1.distributedLocks.connected).toBe('boolean');
      expect(typeof health1.distributedLocks.healthy).toBe('boolean');

      expect(health2.distributedLocks).toBeDefined();
    });
  });
});

/**
 * Test helper for simulating concurrent operations
 */
export class ConcurrencyTestHelper {
  static async runConcurrent<T>(
    operations: Array<() => Promise<T>>,
    concurrency: number = operations.length
  ): Promise<Array<T | Error>> {
    const results: Array<T | Error> = [];

    for (let i = 0; i < operations.length; i += concurrency) {
      const batch = operations.slice(i, i + concurrency);
      const batchPromises = batch.map(async (op) => {
        try {
          return await op();
        } catch (error) {
          return error as Error;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  static createDelayedOperation<T>(operation: () => Promise<T>, delayMs: number): () => Promise<T> {
    return async () => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return operation();
    };
  }
}
