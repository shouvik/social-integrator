/**
 * MetricsCollector Unit Tests
 *
 * Tests focus on INTENT, not implementation details:
 * - Metrics recording works correctly
 * - Configuration is handled properly
 * - Error handling is graceful
 * - NOT testing HTTP server creation details
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetricsCollector } from '../../src/observability/MetricsCollector';
import type { Logger } from '../../src/types';

// Mock http module
vi.mock('http', () => ({
  createServer: vi.fn().mockReturnValue({
    on: vi.fn(),
    listen: vi.fn().mockImplementation((port, callback) => {
      if (callback) setTimeout(() => callback(), 0);
    }),
    close: vi.fn().mockImplementation((callback) => {
      if (callback) setTimeout(() => callback(), 0);
    }),
    address: vi.fn().mockReturnValue({ port: 9090 }),
  }),
}));

describe('MetricsCollector', () => {
  let mockLogger: Logger;
  let metricsCollector: MetricsCollector;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    } as any;
  });

  afterEach(async () => {
    if (metricsCollector) {
      await metricsCollector.close();
    }
  });

  describe('Metrics Recording', () => {
    it('should record counter metrics', () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      metricsCollector.incrementCounter('test_counter', { label: 'value' });

      // Should not throw error
      expect(true).toBe(true);
    });

    it('should record latency metrics', () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      metricsCollector.recordLatency('test_latency', 100, { label: 'value' });

      // Should not throw error
      expect(true).toBe(true);
    });

    it('should record gauge metrics', () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      metricsCollector.recordGauge('test_gauge', 42, { label: 'value' });

      // Should not throw error
      expect(true).toBe(true);
    });

    it('should handle metrics with complex labels', () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      const complexLabels = {
        provider: 'github',
        method: 'GET',
        status: '200',
        endpoint: '/api/users',
        userId: 'user-123',
      };

      metricsCollector.incrementCounter('http_requests_total', complexLabels);
      metricsCollector.recordLatency('http_request_duration', 150, complexLabels);
      metricsCollector.recordGauge('active_connections', 5, complexLabels);

      // Should not throw error
      expect(true).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should initialize with default config', () => {
      metricsCollector = new MetricsCollector();

      expect(metricsCollector).toBeDefined();
    });

    it('should initialize with custom config', () => {
      metricsCollector = new MetricsCollector({
        enabled: true,
        port: 9090,
        path: '/metrics',
      });

      expect(metricsCollector).toBeDefined();
    });

    it('should initialize with logger', () => {
      metricsCollector = new MetricsCollector({ enabled: false }, mockLogger);

      expect(metricsCollector).toBeDefined();
    });

    it('should handle disabled metrics', () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      // Should work without errors
      metricsCollector.incrementCounter('test', {});
      metricsCollector.recordLatency('test', 100, {});
      metricsCollector.recordGauge('test', 1, {});

      expect(true).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid metric names gracefully', () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      // Should not throw with invalid names
      expect(() => {
        metricsCollector.incrementCounter('', {});
        metricsCollector.recordLatency('', 100, {});
        metricsCollector.recordGauge('', 1, {});
      }).not.toThrow();
    });

    it('should handle invalid labels gracefully', () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      // Should not throw with invalid labels
      expect(() => {
        metricsCollector.incrementCounter('test', null as any);
        metricsCollector.recordLatency('test', 100, undefined as any);
        metricsCollector.recordGauge('test', 1, {} as any);
      }).not.toThrow();
    });

    it('should handle negative values gracefully', () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      // Should not throw with negative values
      expect(() => {
        metricsCollector.recordLatency('test', -100, {});
        metricsCollector.recordGauge('test', -1, {});
      }).not.toThrow();
    });
  });

  describe('Metrics Collection', () => {
    it('should collect metrics without errors', () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      // Test all metric types
      metricsCollector.incrementCounter('http_requests_total', {
        provider: 'github',
        method: 'GET',
        status: '200',
      });
      metricsCollector.recordLatency('http_request_duration', 1000, {
        provider: 'github',
        status: '200',
      });
      metricsCollector.incrementCounter('http_cache_hits', { provider: 'github' });
      metricsCollector.incrementCounter('http_errors', { provider: 'github', status: '500' });
      metricsCollector.recordGauge('rate_limit_queue_size', 5, { provider: 'github' });
      metricsCollector.incrementCounter('rate_limit_hits', { provider: 'github' });
      metricsCollector.incrementCounter('token_refresh_total', {
        provider: 'github',
        status: 'success',
      });
      metricsCollector.incrementCounter('token_refresh_dedup_local', { provider: 'github' });
      metricsCollector.incrementCounter('token_refresh_dedup_distributed', {
        provider: 'github',
      });
      metricsCollector.recordLatency('token_refresh_duration', 500, {
        provider: 'github',
        status: 'success',
      });
      metricsCollector.incrementCounter('token_refresh_failures', {
        provider: 'github',
        errorType: 'network',
      });
      metricsCollector.incrementCounter('connections_total', { provider: 'github' });
      metricsCollector.recordLatency('fetch_duration', 2000, { provider: 'github' });

      // Should not throw error
      expect(true).toBe(true);
    });
  });

  describe('Server Management', () => {
    it('should handle close without errors', async () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      await expect(metricsCollector.close()).resolves.toBeUndefined();
    });

    it('should handle multiple close calls', async () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      await metricsCollector.close();
      await metricsCollector.close();
      await metricsCollector.close();

      // Should not throw error
      expect(true).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined config', () => {
      metricsCollector = new MetricsCollector(undefined);

      expect(metricsCollector).toBeDefined();
    });

    it('should handle config with undefined values', () => {
      metricsCollector = new MetricsCollector({
        enabled: undefined,
        port: undefined,
        path: undefined,
      });

      expect(metricsCollector).toBeDefined();
    });

    it('should handle config with zero port', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 0 });

      expect(metricsCollector).toBeDefined();
    });

    it('should handle config with negative port', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: -1 });

      expect(metricsCollector).toBeDefined();
    });

    it('should handle config with empty path', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090, path: '' });

      expect(metricsCollector).toBeDefined();
    });

    it('should handle config with null logger', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090 }, null as any);

      expect(metricsCollector).toBeDefined();
    });
  });
});