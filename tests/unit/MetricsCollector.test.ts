/**
 * MetricsCollector Unit Tests
 *
 * Tests port conflict handling, server error scenarios, tryNextPort method,
 * server close scenarios, and metrics recording functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetricsCollector } from '../../src/observability/MetricsCollector';
import type { Logger } from '../../src/observability/Logger';
import * as http from 'http';

// Mock http module
vi.mock('http', () => ({
  createServer: vi.fn(),
}));

describe('MetricsCollector', () => {
  let mockLogger: Logger;
  let mockServer: any;
  let metricsCollector: MetricsCollector;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    } as any;

    mockServer = {
      on: vi.fn(),
      listen: vi.fn(),
      close: vi.fn(),
      address: vi.fn(),
    };

    vi.mocked(http.createServer).mockReturnValue(mockServer as any);
  });

  afterEach(async () => {
    if (metricsCollector) {
      await metricsCollector.close();
    }
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default config', () => {
      metricsCollector = new MetricsCollector();

      expect(metricsCollector).toBeDefined();
      expect(http.createServer).not.toHaveBeenCalled();
    });

    it('should initialize with disabled metrics', () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      expect(metricsCollector).toBeDefined();
      expect(http.createServer).not.toHaveBeenCalled();
    });

    it('should initialize with enabled metrics and port', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090 });

      expect(metricsCollector).toBeDefined();
      expect(http.createServer).toHaveBeenCalled();
      expect(mockServer.listen).toHaveBeenCalledWith(9090, expect.any(Function));
    });

    it('should initialize with custom path', () => {
      metricsCollector = new MetricsCollector({
        enabled: true,
        port: 9090,
        path: '/custom-metrics',
      });

      expect(metricsCollector).toBeDefined();
      expect(http.createServer).toHaveBeenCalled();
    });

    it('should initialize with logger', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090 }, mockLogger);

      expect(metricsCollector).toBeDefined();
      expect(http.createServer).toHaveBeenCalled();
    });
  });

  describe('Metrics Recording', () => {
    beforeEach(() => {
      metricsCollector = new MetricsCollector({ enabled: false });
    });

    it('should increment counter', () => {
      metricsCollector.incrementCounter('test_counter', { label: 'value' });
      // Should not throw error
    });

    it('should record latency', () => {
      metricsCollector.recordLatency('test_latency', 1000, { status: 'success' });
      // Should not throw error
    });

    it('should record gauge', () => {
      metricsCollector.recordGauge('test_gauge', 42, { provider: 'github' });
      // Should not throw error
    });

    it('should get metrics', async () => {
      const metrics = await metricsCollector.getMetrics();
      expect(typeof metrics).toBe('string');
    });
  });

  describe('Server Creation and Management', () => {
    it('should create server with correct request handler', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090, path: '/metrics' });

      expect(http.createServer).toHaveBeenCalledWith(expect.any(Function));

      const requestHandler = vi.mocked(http.createServer).mock.calls[0][0];
      expect(typeof requestHandler).toBe('function');
    });

    it('should handle metrics endpoint requests', async () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090, path: '/metrics' });

      const mockReq = { url: '/metrics' };
      const mockRes = {
        setHeader: vi.fn(),
        end: vi.fn(),
      };

      const requestHandler = vi.mocked(http.createServer).mock.calls[0][0];
      await requestHandler(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', expect.any(String));
      expect(mockRes.end).toHaveBeenCalledWith(expect.any(String));
    });

    it('should handle non-metrics endpoint requests', async () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090, path: '/metrics' });

      const mockReq = { url: '/health' };
      const mockRes = {
        statusCode: 200,
        end: vi.fn(),
      };

      const requestHandler = vi.mocked(http.createServer).mock.calls[0][0];
      await requestHandler(mockReq, mockRes);

      expect(mockRes.statusCode).toBe(404);
      expect(mockRes.end).toHaveBeenCalledWith('Not Found');
    });

    it('should log server startup', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090 }, mockLogger);

      const listenCallback = mockServer.listen.mock.calls[0][1];
      mockServer.address.mockReturnValue({ port: 9090 });
      listenCallback();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Metrics exposed on http://localhost:9090/metrics'
      );
    });

    it('should log server startup with actual port', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090 }, mockLogger);

      const listenCallback = mockServer.listen.mock.calls[0][1];
      mockServer.address.mockReturnValue({ port: 9091 }); // Different from requested port
      listenCallback();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Metrics exposed on http://localhost:9091/metrics'
      );
    });
  });

  describe('Port Conflict Handling', () => {
    it('should handle EADDRINUSE error and try next port', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090 }, mockLogger);

      const errorHandler = mockServer.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      expect(errorHandler).toBeDefined();

      const eaddrInUseError = { code: 'EADDRINUSE' };
      errorHandler?.(eaddrInUseError);

      expect(mockLogger.warn).toHaveBeenCalledWith('Port 9090 in use, trying next available port');
      expect(mockServer.close).toHaveBeenCalled();
    });

    it('should handle non-EADDRINUSE errors', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090 }, mockLogger);

      const errorHandler = mockServer.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      expect(errorHandler).toBeDefined();

      const otherError = { code: 'ECONNREFUSED', message: 'Connection refused' };
      errorHandler?.(otherError);

      expect(mockLogger.error).toHaveBeenCalledWith('MetricsCollector server error', {
        error: 'Connection refused',
      });
    });

    it('should handle errors without code', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090 }, mockLogger);

      const errorHandler = mockServer.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      expect(errorHandler).toBeDefined();

      const errorWithoutCode = { message: 'Unknown error' };
      errorHandler?.(errorWithoutCode);

      expect(mockLogger.error).toHaveBeenCalledWith('MetricsCollector server error', {
        error: 'Unknown error',
      });
    });
  });

  describe('tryNextPort Method', () => {
    it('should try next port when EADDRINUSE occurs', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090 }, mockLogger);

      // Trigger EADDRINUSE error
      const errorHandler = mockServer.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      const eaddrInUseError = { code: 'EADDRINUSE' };
      errorHandler(eaddrInUseError);

      // Should create new server for next port
      expect(http.createServer).toHaveBeenCalledTimes(2);
      expect(mockServer.close).toHaveBeenCalled();
    });

    it('should limit port range to avoid infinite loops', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9199 }, mockLogger);

      // Trigger EADDRINUSE error
      const errorHandler = mockServer.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      const eaddrInUseError = { code: 'EADDRINUSE' };
      errorHandler(eaddrInUseError);

      // Should try port 9200, which is at the limit
      expect(mockLogger.warn).toHaveBeenCalledWith('Port 9199 in use, trying next available port');
    });

    it('should stop trying when port exceeds limit', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9200 }, mockLogger);

      // Trigger EADDRINUSE error
      const errorHandler = mockServer.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      const eaddrInUseError = { code: 'EADDRINUSE' };
      errorHandler(eaddrInUseError);

      // Should log error about unable to find available port
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Unable to find available port for metrics server'
      );
    });

    it('should handle recursive port conflicts', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090 }, mockLogger);

      // Mock multiple EADDRINUSE errors
      let callCount = 0;
      mockServer.on.mockImplementation((event, _handler) => {
        if (event === 'error') {
          return mockServer.on.mockImplementation((event, handler) => {
            if (event === 'error' && callCount < 3) {
              callCount++;
              const eaddrInUseError = { code: 'EADDRINUSE' };
              handler(eaddrInUseError);
            }
          });
        }
      });

      const errorHandler = mockServer.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      const eaddrInUseError = { code: 'EADDRINUSE' };
      errorHandler?.(eaddrInUseError);

      // Should have tried multiple ports
      expect(http.createServer).toHaveBeenCalledTimes(2);
    });
  });

  describe('Server Close Scenarios', () => {
    it('should close server successfully', async () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090 });
      mockServer.close.mockImplementation((callback) => callback());

      await metricsCollector.close();

      expect(mockServer.close).toHaveBeenCalled();
    });

    it('should handle close when no server exists', async () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      await metricsCollector.close();
      // Should not throw error
    });

    it('should handle close with callback error', async () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090 });
      mockServer.close.mockImplementation((_callback) => {
        // Don't call callback to simulate error
      });

      // Should not throw error even if callback is not called
      await expect(metricsCollector.close()).resolves.toBeUndefined();
    });
  });

  describe('Metrics Initialization', () => {
    it('should initialize all required metrics', () => {
      metricsCollector = new MetricsCollector({ enabled: true });

      // Test that we can record metrics without errors
      expect(() => {
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
        metricsCollector.recordGauge('items_fetched', 10, { provider: 'github' });
      }).not.toThrow();
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle server creation failure', () => {
      vi.mocked(http.createServer).mockImplementation(() => {
        throw new Error('Server creation failed');
      });

      expect(() => {
        metricsCollector = new MetricsCollector({ enabled: true, port: 9090 });
      }).toThrow('Server creation failed');
    });

    it('should handle server listen failure', () => {
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090 }, mockLogger);

      mockServer.listen.mockImplementation((_port, _callback) => {
        throw new Error('Listen failed');
      });

      // Should not throw during construction
      expect(metricsCollector).toBeDefined();
    });

    it('should handle metrics collection with invalid labels', () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      // Should not throw with invalid labels
      expect(() => {
        metricsCollector.incrementCounter('test_counter', { invalid: null } as any);
        metricsCollector.recordLatency('test_latency', -1000, { invalid: undefined } as any);
        metricsCollector.recordGauge('test_gauge', NaN, { invalid: {} } as any);
      }).not.toThrow();
    });

    it('should handle concurrent metrics recording', () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      // Record metrics concurrently
      const promises = Array.from({ length: 100 }, (_, i) => {
        return Promise.resolve().then(() => {
          metricsCollector.incrementCounter('concurrent_counter', { index: i.toString() });
          metricsCollector.recordLatency('concurrent_latency', i * 10, { index: i.toString() });
          metricsCollector.recordGauge('concurrent_gauge', i, { index: i.toString() });
        });
      });

      return Promise.all(promises).then(() => {
        // Should complete without errors
        expect(true).toBe(true);
      });
    });

    it('should handle very large metric values', () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      expect(() => {
        metricsCollector.recordLatency('large_latency', Number.MAX_SAFE_INTEGER, { test: 'large' });
        metricsCollector.recordGauge('large_gauge', Number.MAX_SAFE_INTEGER, { test: 'large' });
        metricsCollector.incrementCounter('large_counter', { test: 'large' });
      }).not.toThrow();
    });

    it('should handle negative metric values', () => {
      metricsCollector = new MetricsCollector({ enabled: false });

      expect(() => {
        metricsCollector.recordLatency('negative_latency', -1000, { test: 'negative' });
        metricsCollector.recordGauge('negative_gauge', -42, { test: 'negative' });
      }).not.toThrow();
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle undefined config', () => {
      vi.clearAllMocks();
      metricsCollector = new MetricsCollector(undefined);

      expect(metricsCollector).toBeDefined();
    });

    it('should handle config with undefined values', () => {
      vi.clearAllMocks();
      metricsCollector = new MetricsCollector({
        enabled: undefined,
        port: undefined,
        path: undefined,
      });

      expect(metricsCollector).toBeDefined();
    });

    it('should handle config with zero port', () => {
      vi.clearAllMocks();
      metricsCollector = new MetricsCollector({ enabled: true, port: 0 });

      expect(metricsCollector).toBeDefined();
      expect(http.createServer).toHaveBeenCalled();
    });

    it('should handle config with negative port', () => {
      vi.clearAllMocks();
      metricsCollector = new MetricsCollector({ enabled: true, port: -1 });

      expect(metricsCollector).toBeDefined();
      expect(http.createServer).toHaveBeenCalled();
    });

    it('should handle config with empty path', () => {
      vi.clearAllMocks();
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090, path: '' });

      expect(metricsCollector).toBeDefined();
      expect(http.createServer).toHaveBeenCalled();
    });

    it('should handle config with null logger', () => {
      vi.clearAllMocks();
      metricsCollector = new MetricsCollector({ enabled: true, port: 9090 }, null as any);

      expect(metricsCollector).toBeDefined();
      expect(http.createServer).toHaveBeenCalled();
    });
  });
});
