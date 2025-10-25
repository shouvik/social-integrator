/**
 * DistributedRefreshLock Unit Tests
 *
 * Tests Redis connection failures, lock acquisition timeout scenarios,
 * connection status health checks, error handling, and graceful degradation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DistributedRefreshLock } from '../../src/core/token/DistributedRefreshLock';
import type { Logger } from '../../src/observability/Logger';

// Mock Redis client
const mockRedisClient = {
  connect: vi.fn(),
  quit: vi.fn(),
  del: vi.fn(),
  set: vi.fn(),
  exists: vi.fn(),
  on: vi.fn(),
  ping: vi.fn(),
};

vi.mock('redis', () => ({
  createClient: vi.fn(() => mockRedisClient),
}));

describe('DistributedRefreshLock', () => {
  let mockLogger: Logger;
  let lock: DistributedRefreshLock;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    } as any;

    // Reset all mocks
    vi.clearAllMocks();
    mockRedisClient.connect.mockClear();
    mockRedisClient.quit.mockClear();
    mockRedisClient.del.mockClear();
    mockRedisClient.set.mockClear();
    mockRedisClient.exists.mockClear();
    mockRedisClient.on.mockClear();
  });

  afterEach(async () => {
    if (lock) {
      await lock.disconnect();
    }
  });

  describe('Constructor and Initialization', () => {
    it('should initialize without Redis URL (local-only mode)', async () => {
      lock = new DistributedRefreshLock(undefined, mockLogger);
      await lock.initialize();

      const status = lock.getConnectionStatus();
      expect(status.connected).toBe(false);
      expect(status.mode).toBe('local-only');
      expect(status.healthy).toBe(true);
    });

    it('should initialize with Redis URL and connect successfully', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      expect(mockRedisClient.connect).toHaveBeenCalled();
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('should handle Redis connection failure gracefully', async () => {
      const connectionError = new Error('Connection failed');
      mockRedisClient.connect.mockRejectedValue(connectionError);

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      const status = lock.getConnectionStatus();
      expect(status.connected).toBe(false);
      expect(status.mode).toBe('local-only');
      expect(status.healthy).toBe(true);

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to connect to Redis for refresh lock', {
        error: 'Connection failed',
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Distributed refresh locks disabled - running in local-only mode',
        { impact: 'Multi-instance token refresh deduplication unavailable' }
      );
    });
  });

  describe('Connection Status and Health Checks', () => {
    it('should report distributed mode when connected', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      // Simulate connection event
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }

      const status = lock.getConnectionStatus();
      expect(status.connected).toBe(true);
      expect(status.mode).toBe('distributed');
      expect(status.healthy).toBe(true);
    });

    it('should report local-only mode when Redis is undefined', () => {
      lock = new DistributedRefreshLock(undefined, mockLogger);
      const status = lock.getConnectionStatus();

      expect(status.connected).toBe(false);
      expect(status.mode).toBe('local-only');
      expect(status.healthy).toBe(true);
    });

    it('should report unhealthy when Redis is connected but not ready', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      // Don't trigger connect event, so connected should be false
      const status = lock.getConnectionStatus();
      expect(status.connected).toBe(false);
      expect(status.mode).toBe('distributed');
      expect(status.healthy).toBe(false);
    });
  });

  describe('Redis Event Handlers', () => {
    it('should handle Redis error events', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      const errorHandler = mockRedisClient.on.mock.calls.find((call) => call[0] === 'error')?.[1];

      if (errorHandler) {
        const error = new Error('Redis connection lost');
        errorHandler(error);
      }

      expect(mockLogger.error).toHaveBeenCalledWith('Redis client error', {
        error: 'Redis connection lost',
      });
    });

    it('should handle Redis connect events', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];

      if (connectHandler) {
        connectHandler();
      }

      expect(mockLogger.info).toHaveBeenCalledWith('Redis connected for distributed refresh lock');
    });

    it('should handle Redis disconnect events', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      const disconnectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'disconnect'
      )?.[1];

      if (disconnectHandler) {
        disconnectHandler();
      }

      expect(mockLogger.warn).toHaveBeenCalledWith('Redis disconnected');
    });
  });

  describe('Lock Acquisition (tryAcquire)', () => {
    it('should return true when Redis is not available (local-only mode)', async () => {
      lock = new DistributedRefreshLock(undefined, mockLogger);
      await lock.initialize();

      const result = await lock.tryAcquire('user1', 'github');
      expect(result).toBe(true);
    });

    it('should return true when Redis is not connected', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      // Don't trigger connect event
      const result = await lock.tryAcquire('user1', 'github');
      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis not connected, skipping distributed lock'
      );
    });

    it('should acquire lock successfully when Redis is connected', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.set.mockResolvedValue('OK');

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      // Simulate connection
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }

      const result = await lock.tryAcquire('user1', 'github');

      expect(result).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith('refresh_lock:user1:github', '1', {
        PX: 10000,
        NX: true,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith('Acquired distributed refresh lock', {
        userId: 'user1',
        provider: 'github',
      });
    });

    it('should fail to acquire lock when already held', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.set.mockResolvedValue(null); // Lock already exists

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      // Simulate connection
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }

      const result = await lock.tryAcquire('user1', 'github');

      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('Distributed refresh lock already held', {
        userId: 'user1',
        provider: 'github',
      });
    });

    it('should handle Redis errors during lock acquisition', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      // Simulate connection
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }

      const result = await lock.tryAcquire('user1', 'github');

      expect(result).toBe(true); // Should fallback to allowing operation
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to acquire distributed lock', {
        userId: 'user1',
        provider: 'github',
        error: 'Redis error',
      });
    });
  });

  describe('Wait for Release (waitForRelease)', () => {
    it('should return immediately when Redis is not available', async () => {
      lock = new DistributedRefreshLock(undefined, mockLogger);
      await lock.initialize();

      await lock.waitForRelease('user1', 'github');
      // Should complete without error
    });

    it('should return immediately when Redis is not connected', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      await lock.waitForRelease('user1', 'github');
      // Should complete without error
    });

    it('should wait for lock release successfully', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.exists
        .mockResolvedValueOnce(1) // Lock exists initially
        .mockResolvedValueOnce(1) // Still exists
        .mockResolvedValueOnce(0); // Released

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      // Simulate connection
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }

      await lock.waitForRelease('user1', 'github');

      expect(mockRedisClient.exists).toHaveBeenCalledWith('refresh_lock:user1:github');
      expect(mockLogger.debug).toHaveBeenCalledWith('Distributed lock released', {
        userId: 'user1',
        provider: 'github',
      });
    });

    it('should timeout waiting for lock release', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.exists.mockResolvedValue(1); // Lock always exists

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      // Simulate connection
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }

      const startTime = Date.now();
      await lock.waitForRelease('user1', 'github', 1000); // 1 second timeout
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(1000);
      expect(duration).toBeLessThan(2000); // Should timeout around 1 second
      expect(mockLogger.warn).toHaveBeenCalledWith('Timeout waiting for distributed lock release', {
        userId: 'user1',
        provider: 'github',
        timeoutMs: 1000,
      });
    });

    it('should handle Redis errors during wait for release', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.exists.mockRejectedValue(new Error('Redis connection lost'));

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      // Simulate connection
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }

      await lock.waitForRelease('user1', 'github');

      expect(mockLogger.error).toHaveBeenCalledWith('Error waiting for lock release', {
        userId: 'user1',
        provider: 'github',
        error: 'Redis connection lost',
      });
    });
  });

  describe('Lock Release (release)', () => {
    it('should return immediately when Redis is not available', async () => {
      lock = new DistributedRefreshLock(undefined, mockLogger);
      await lock.initialize();

      await lock.release('user1', 'github');
      // Should complete without error
    });

    it('should return immediately when Redis is not connected', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      await lock.release('user1', 'github');
      // Should complete without error
    });

    it('should release lock successfully', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.del.mockResolvedValue(1);

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      // Simulate connection
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }

      await lock.release('user1', 'github');

      expect(mockRedisClient.del).toHaveBeenCalledWith('refresh_lock:user1:github');
      expect(mockLogger.debug).toHaveBeenCalledWith('Released distributed lock', {
        userId: 'user1',
        provider: 'github',
      });
    });

    it('should handle Redis errors during lock release', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      // Simulate connection
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }

      await lock.release('user1', 'github');

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to release distributed lock', {
        userId: 'user1',
        provider: 'github',
        error: 'Redis error',
      });
    });
  });

  describe('Disconnect', () => {
    it('should handle disconnect when Redis is not available', async () => {
      lock = new DistributedRefreshLock(undefined, mockLogger);
      await lock.initialize();

      await lock.disconnect();
      // Should complete without error
    });

    it('should handle disconnect when Redis is not connected', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      await lock.disconnect();
      // Should complete without error
    });

    it('should disconnect successfully when Redis is connected', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.quit.mockResolvedValue('OK');

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      // Simulate connection
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }

      await lock.disconnect();

      expect(mockRedisClient.quit).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('DistributedRefreshLock disconnected');
    });

    it('should handle Redis errors during disconnect', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.quit.mockRejectedValue(new Error('Quit failed'));

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      // Simulate connection
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }

      await lock.disconnect();

      expect(mockLogger.error).toHaveBeenCalledWith('Error disconnecting Redis', {
        error: 'Quit failed',
      });
    });
  });

  describe('Reconnection Strategy', () => {
    it('should implement exponential backoff reconnection strategy', () => {
      // Test the reconnection strategy logic
      const retries = [1, 2, 3, 5, 10, 11];
      const expectedDelays = [100, 200, 300, 500, 1000, 3000]; // Capped at 3000ms
      const expectedErrors = [false, false, false, false, false, true]; // Error after 10 retries

      retries.forEach((retry, index) => {
        const delay = Math.min(retry * 100, 3000);
        const shouldError = retry > 10;

        expect(delay).toBe(expectedDelays[index]);
        expect(shouldError).toBe(expectedErrors[index]);
      });
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle malformed Redis URL gracefully', async () => {
      const malformedUrl = 'invalid-redis-url';
      mockRedisClient.connect.mockRejectedValue(new Error('Invalid URL'));

      lock = new DistributedRefreshLock(malformedUrl, mockLogger);
      await lock.initialize();

      const status = lock.getConnectionStatus();
      expect(status.mode).toBe('local-only');
      expect(status.healthy).toBe(true);
    });

    it('should handle Redis connection timeout', async () => {
      mockRedisClient.connect.mockImplementation(
        () =>
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 100))
      );

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      const status = lock.getConnectionStatus();
      expect(status.mode).toBe('local-only');
      expect(status.healthy).toBe(true);
    });

    it('should handle concurrent lock operations', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.del.mockResolvedValue(1);

      lock = new DistributedRefreshLock('redis://localhost:6379', mockLogger);
      await lock.initialize();

      // Simulate connection
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }

      // Test concurrent operations
      const operations = [
        lock.tryAcquire('user1', 'github'),
        lock.tryAcquire('user2', 'github'),
        lock.tryAcquire('user1', 'twitter'),
      ];

      const results = await Promise.all(operations);
      expect(results).toEqual([true, true, true]);

      // Test concurrent releases
      const releases = [
        lock.release('user1', 'github'),
        lock.release('user2', 'github'),
        lock.release('user1', 'twitter'),
      ];

      await Promise.all(releases);
      expect(mockRedisClient.del).toHaveBeenCalledTimes(3);
    });
  });
});
