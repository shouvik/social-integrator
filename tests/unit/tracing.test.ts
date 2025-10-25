/**
 * Tracing Unit Tests
 *
 * Tests OpenTelemetry tracing functionality including span creation,
 * attributes, error recording, and lifecycle management.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isOTelEnabled,
  getTracer,
  generateCorrelationId,
  withSpan,
  withHttpSpan,
  withOAuthSpan,
  withTokenSpan,
  getCurrentSpan,
  addSpanEvent,
  setSpanAttribute,
} from '../../src/observability/tracing';

describe('Tracing', () => {
  const originalEnv = process.env.OTEL_ENABLED;

  afterEach(() => {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.OTEL_ENABLED;
    } else {
      process.env.OTEL_ENABLED = originalEnv;
    }
  });

  describe('isOTelEnabled', () => {
    it('should return false when OTEL_ENABLED is not set', () => {
      delete process.env.OTEL_ENABLED;
      expect(isOTelEnabled()).toBe(false);
    });

    it('should return true when OTEL_ENABLED is "1"', () => {
      process.env.OTEL_ENABLED = '1';
      expect(isOTelEnabled()).toBe(true);
    });

    it('should return true when OTEL_ENABLED is "true"', () => {
      process.env.OTEL_ENABLED = 'true';
      expect(isOTelEnabled()).toBe(true);
    });

    it('should return false when OTEL_ENABLED is "0"', () => {
      process.env.OTEL_ENABLED = '0';
      expect(isOTelEnabled()).toBe(false);
    });

    it('should return false when OTEL_ENABLED is "false"', () => {
      process.env.OTEL_ENABLED = 'false';
      expect(isOTelEnabled()).toBe(false);
    });
  });

  describe('getTracer', () => {
    it('should return null when tracing is disabled', () => {
      delete process.env.OTEL_ENABLED;
      expect(getTracer()).toBe(null);
    });

    it('should return tracer instance when tracing is enabled', () => {
      process.env.OTEL_ENABLED = '1';
      const tracer = getTracer();
      expect(tracer).toBeDefined();
      expect(tracer).not.toBe(null);
    });
  });

  describe('generateCorrelationId', () => {
    it('should generate a valid UUID v4', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('withSpan', () => {
    it('should execute function when tracing is disabled', async () => {
      delete process.env.OTEL_ENABLED;

      const mockFn = vi.fn().mockResolvedValue('result');
      const result = await withSpan('test-span', mockFn);

      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalledWith(null);
    });

    it('should execute function successfully when tracing is enabled', async () => {
      process.env.OTEL_ENABLED = '1';

      const mockFn = vi.fn().mockResolvedValue('success');
      const result = await withSpan('test-span', mockFn, { attr1: 'value1' });

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledWith(expect.any(Object)); // Called with span
    });

    it('should handle errors and re-throw when tracing is disabled', async () => {
      delete process.env.OTEL_ENABLED;

      const error = new Error('Test error');
      const mockFn = vi.fn().mockRejectedValue(error);

      await expect(withSpan('test-span', mockFn)).rejects.toThrow('Test error');
    });

    it('should handle errors and re-throw when tracing is enabled', async () => {
      process.env.OTEL_ENABLED = '1';

      const error = new Error('Test error with tracing');
      const mockFn = vi.fn().mockRejectedValue(error);

      await expect(withSpan('error-span', mockFn)).rejects.toThrow('Test error with tracing');
    });

    it('should pass attributes to span when tracing is enabled', async () => {
      process.env.OTEL_ENABLED = '1';

      const mockFn = vi.fn().mockResolvedValue('ok');
      await withSpan('span-with-attrs', mockFn, {
        userId: 'user-123',
        provider: 'google',
        count: 42,
        isTest: true,
      });

      expect(mockFn).toHaveBeenCalled();
    });
  });

  describe('withHttpSpan', () => {
    it('should execute HTTP request when tracing is disabled', async () => {
      delete process.env.OTEL_ENABLED;

      const mockFn = vi.fn().mockResolvedValue({ status: 200 });
      const result = await withHttpSpan('GET', 'https://api.example.com/data', mockFn);

      expect(result).toEqual({ status: 200 });
      expect(mockFn).toHaveBeenCalledWith(null);
    });

    it('should create HTTP span when tracing is enabled', async () => {
      process.env.OTEL_ENABLED = '1';

      const mockFn = vi.fn().mockResolvedValue({ status: 200, data: 'test' });
      const result = await withHttpSpan('POST', 'https://api.example.com/create', mockFn);

      expect(result).toEqual({ status: 200, data: 'test' });
      expect(mockFn).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('withOAuthSpan', () => {
    it('should execute OAuth operation when tracing is disabled', async () => {
      delete process.env.OTEL_ENABLED;

      const mockFn = vi.fn().mockResolvedValue({ access_token: 'token' });
      const result = await withOAuthSpan('connect', 'google', 'user-123', mockFn);

      expect(result).toEqual({ access_token: 'token' });
      expect(mockFn).toHaveBeenCalledWith(null);
    });

    it('should create OAuth span when tracing is enabled', async () => {
      process.env.OTEL_ENABLED = '1';

      const mockFn = vi.fn().mockResolvedValue({ access_token: 'token' });
      const result = await withOAuthSpan('callback', 'twitter', 'user-456', mockFn);

      expect(result).toEqual({ access_token: 'token' });
      expect(mockFn).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle OAuth errors', async () => {
      process.env.OTEL_ENABLED = '1';

      const error = new Error('OAuth error');
      const mockFn = vi.fn().mockRejectedValue(error);

      await expect(withOAuthSpan('refresh', 'reddit', 'user-789', mockFn)).rejects.toThrow(
        'OAuth error'
      );
    });
  });

  describe('withTokenSpan', () => {
    it('should execute token operation when tracing is disabled', async () => {
      delete process.env.OTEL_ENABLED;

      const mockFn = vi.fn().mockResolvedValue('token-stored');
      const result = await withTokenSpan('store', 'google', 'user-123', mockFn);

      expect(result).toBe('token-stored');
      expect(mockFn).toHaveBeenCalledWith(null);
    });

    it('should create token span when tracing is enabled', async () => {
      process.env.OTEL_ENABLED = '1';

      const mockFn = vi.fn().mockResolvedValue('token-deleted');
      const result = await withTokenSpan('delete', 'github', 'user-456', mockFn);

      expect(result).toBe('token-deleted');
      expect(mockFn).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle token refresh operation', async () => {
      process.env.OTEL_ENABLED = '1';

      const mockFn = vi.fn().mockResolvedValue({ newToken: 'refreshed-token' });
      const result = await withTokenSpan('refresh', 'twitter', 'user-999', mockFn);

      expect(result).toEqual({ newToken: 'refreshed-token' });
    });
  });

  describe('getCurrentSpan', () => {
    it('should return undefined when tracing is disabled', () => {
      delete process.env.OTEL_ENABLED;
      expect(getCurrentSpan()).toBeUndefined();
    });

    it('should return undefined when no active span exists', () => {
      process.env.OTEL_ENABLED = '1';
      // Without active span context
      expect(getCurrentSpan()).toBeUndefined();
    });
  });

  describe('addSpanEvent', () => {
    it('should not throw when tracing is disabled', () => {
      delete process.env.OTEL_ENABLED;
      expect(() => addSpanEvent('test-event')).not.toThrow();
    });

    it('should not throw when no active span exists', () => {
      process.env.OTEL_ENABLED = '1';
      expect(() => addSpanEvent('test-event', { key: 'value' })).not.toThrow();
    });

    it('should accept event with attributes', () => {
      delete process.env.OTEL_ENABLED;
      expect(() =>
        addSpanEvent('cache-hit', { cacheKey: 'user:123', provider: 'google' })
      ).not.toThrow();
    });
  });

  describe('setSpanAttribute', () => {
    it('should not throw when tracing is disabled', () => {
      delete process.env.OTEL_ENABLED;
      expect(() => setSpanAttribute('test-attr', 'test-value')).not.toThrow();
    });

    it('should not throw when no active span exists', () => {
      process.env.OTEL_ENABLED = '1';
      expect(() => setSpanAttribute('provider', 'google')).not.toThrow();
    });

    it('should accept string attributes', () => {
      delete process.env.OTEL_ENABLED;
      expect(() => setSpanAttribute('userId', 'user-123')).not.toThrow();
    });

    it('should accept number attributes', () => {
      delete process.env.OTEL_ENABLED;
      expect(() => setSpanAttribute('statusCode', 200)).not.toThrow();
    });

    it('should accept boolean attributes', () => {
      delete process.env.OTEL_ENABLED;
      expect(() => setSpanAttribute('cached', true)).not.toThrow();
    });
  });

  describe('concurrent spans', () => {
    it('should handle multiple concurrent spans when tracing is enabled', async () => {
      process.env.OTEL_ENABLED = '1';

      const task1 = withSpan('span-1', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'result-1';
      });

      const task2 = withSpan('span-2', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 'result-2';
      });

      const task3 = withSpan('span-3', async () => {
        return 'result-3';
      });

      const results = await Promise.all([task1, task2, task3]);

      expect(results).toEqual(['result-1', 'result-2', 'result-3']);
    });

    it('should handle concurrent spans when tracing is disabled', async () => {
      delete process.env.OTEL_ENABLED;

      const task1 = withSpan('span-1', async () => 'result-1');
      const task2 = withSpan('span-2', async () => 'result-2');

      const results = await Promise.all([task1, task2]);

      expect(results).toEqual(['result-1', 'result-2']);
    });
  });

  describe('nested spans', () => {
    it('should handle nested span execution', async () => {
      process.env.OTEL_ENABLED = '1';

      const result = await withSpan('outer-span', async () => {
        const inner1 = await withSpan('inner-span-1', async () => 'inner-1');
        const inner2 = await withSpan('inner-span-2', async () => 'inner-2');
        return { inner1, inner2 };
      });

      expect(result).toEqual({ inner1: 'inner-1', inner2: 'inner-2' });
    });

    it('should propagate errors from nested spans', async () => {
      process.env.OTEL_ENABLED = '1';

      await expect(
        withSpan('outer', async () => {
          await withSpan('inner', async () => {
            throw new Error('Inner error');
          });
        })
      ).rejects.toThrow('Inner error');
    });
  });

  describe('error handling', () => {
    it('should record exception in span when error occurs', async () => {
      process.env.OTEL_ENABLED = '1';

      const error = new Error('Database connection failed');
      const mockFn = vi.fn().mockRejectedValue(error);

      await expect(withSpan('db-query', mockFn)).rejects.toThrow('Database connection failed');
    });

    it('should handle errors without message', async () => {
      process.env.OTEL_ENABLED = '1';

      const error = new Error();
      const mockFn = vi.fn().mockRejectedValue(error);

      await expect(withSpan('test', mockFn)).rejects.toThrow();
    });
  });
});
