/**
 * Tracing Unit Tests
 *
 * Tests span creation with different attributes, error handling in span operations,
 * context management, event and attribute setting, and span lifecycle management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as tracing from '../../src/observability/tracing';

// Mock OpenTelemetry API
const mockSpan = {
  setAttribute: vi.fn(),
  addEvent: vi.fn(),
  recordException: vi.fn(),
  setStatus: vi.fn(),
  end: vi.fn(),
};

const mockTracer = {
  startActiveSpan: vi.fn(),
};

const mockContext = {
  active: vi.fn(),
};

const mockTrace = {
  getTracer: vi.fn(),
  getSpan: vi.fn(),
};

// Mock the OpenTelemetry API
vi.mock('@opentelemetry/api', () => ({
  trace: mockTrace,
  context: mockContext,
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
  },
  SpanKind: {
    CLIENT: 1,
    SERVER: 2,
  },
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123'),
}));

// Mock dynamic imports
vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: vi.fn().mockReturnValue([]),
}));

describe('Tracing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OTEL_ENABLED;
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isOTelEnabled', () => {
    it('should return false when OTEL_ENABLED is not set', () => {
      expect(tracing.isOTelEnabled()).toBe(false);
    });

    it('should return true when OTEL_ENABLED is "1"', () => {
      process.env.OTEL_ENABLED = '1';
      expect(tracing.isOTelEnabled()).toBe(true);
    });

    it('should return true when OTEL_ENABLED is "true"', () => {
      process.env.OTEL_ENABLED = 'true';
      expect(tracing.isOTelEnabled()).toBe(true);
    });

    it('should return false when OTEL_ENABLED is "false"', () => {
      process.env.OTEL_ENABLED = 'false';
      expect(tracing.isOTelEnabled()).toBe(false);
    });

    it('should return false when OTEL_ENABLED is "0"', () => {
      process.env.OTEL_ENABLED = '0';
      expect(tracing.isOTelEnabled()).toBe(false);
    });
  });

  describe('getTracer', () => {
    it('should return null when tracing is disabled', () => {
      process.env.OTEL_ENABLED = 'false';
      mockTrace.getTracer.mockReturnValue(mockTracer);

      const result = tracing.getTracer();
      expect(result).toBeNull();
    });

    it('should return tracer when tracing is enabled', () => {
      process.env.OTEL_ENABLED = '1';
      mockTrace.getTracer.mockReturnValue(mockTracer);

      const result = tracing.getTracer();
      expect(result).toBe(mockTracer);
      expect(mockTrace.getTracer).toHaveBeenCalledWith('oauth-connector-sdk');
    });
  });

  describe('generateCorrelationId', () => {
    it('should generate a unique correlation ID', () => {
      const id1 = tracing.generateCorrelationId();
      const id2 = tracing.generateCorrelationId();

      expect(id1).toBe('test-uuid-123');
      expect(id2).toBe('test-uuid-123');
      expect(id1).toBe(id2); // Same mock value
    });
  });

  describe('withSpan', () => {
    it('should execute function without span when tracing is disabled', async () => {
      process.env.OTEL_ENABLED = 'false';
      mockTrace.getTracer.mockReturnValue(null);

      const fn = vi.fn().mockResolvedValue('test-result');
      const result = await tracing.withSpan('test-span', fn);

      expect(result).toBe('test-result');
      expect(fn).toHaveBeenCalledWith(null);
      expect(mockTracer.startActiveSpan).not.toHaveBeenCalled();
    });

    it('should execute function with span when tracing is enabled', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTrace.getTracer.mockReturnValue(mockTracer);
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(mockSpan);
        return Promise.resolve('test-result');
      });

      const testFn = vi.fn().mockResolvedValue('test-result');
      const result = await tracing.withSpan('test-span', testFn);

      expect(result).toBe('test-result');
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith('test-span', expect.any(Function));
      expect(testFn).toHaveBeenCalledWith(mockSpan);
    });

    it('should set span attributes when provided', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTrace.getTracer.mockReturnValue(mockTracer);
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(mockSpan);
        return Promise.resolve('test-result');
      });

      const attributes = { 'test.attr': 'value', 'test.number': 42, 'test.bool': true };
      const testFn = vi.fn().mockResolvedValue('test-result');

      await tracing.withSpan('test-span', testFn, attributes);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('test.attr', 'value');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('test.number', 42);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('test.bool', true);
    });

    it('should set span status to OK on success', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTrace.getTracer.mockReturnValue(mockTracer);
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(mockSpan);
        return Promise.resolve('test-result');
      });

      const testFn = vi.fn().mockResolvedValue('test-result');
      await tracing.withSpan('test-span', testFn);

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // SpanStatusCode.OK
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle errors and set span status to ERROR', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTrace.getTracer.mockReturnValue(mockTracer);
      const testError = new Error('Test error');
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(mockSpan);
        return Promise.reject(testError);
      });

      const testFn = vi.fn().mockRejectedValue(testError);

      await expect(tracing.withSpan('test-span', testFn)).rejects.toThrow('Test error');

      expect(mockSpan.recordException).toHaveBeenCalledWith(testError);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2, // SpanStatusCode.ERROR
        message: 'Test error',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle errors without message', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTrace.getTracer.mockReturnValue(mockTracer);
      const testError = new Error();
      testError.message = undefined as any;
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(mockSpan);
        return Promise.reject(testError);
      });

      const testFn = vi.fn().mockRejectedValue(testError);

      await expect(tracing.withSpan('test-span', testFn)).rejects.toThrow();

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2, // SpanStatusCode.ERROR
        message: undefined,
      });
    });
  });

  describe('withHttpSpan', () => {
    it('should create HTTP span with correct attributes', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTrace.getTracer.mockReturnValue(mockTracer);
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(mockSpan);
        return Promise.resolve('test-result');
      });

      const testFn = vi.fn().mockResolvedValue('test-result');
      await tracing.withHttpSpan('GET', 'https://api.github.com/user', testFn);

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith('HTTP GET', expect.any(Function));
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.method', 'GET');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.url', 'https://api.github.com/user');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('span.kind', 1); // SpanKind.CLIENT
    });
  });

  describe('withOAuthSpan', () => {
    it('should create OAuth span with correct attributes', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTrace.getTracer.mockReturnValue(mockTracer);
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(mockSpan);
        return Promise.resolve('test-result');
      });

      const testFn = vi.fn().mockResolvedValue('test-result');
      await tracing.withOAuthSpan('connect', 'github', 'user-123', testFn);

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'OAuth connect',
        expect.any(Function)
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('oauth.operation', 'connect');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('oauth.provider', 'github');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('oauth.user_id', 'user-123');
    });
  });

  describe('withTokenSpan', () => {
    it('should create Token span with correct attributes', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTrace.getTracer.mockReturnValue(mockTracer);
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(mockSpan);
        return Promise.resolve('test-result');
      });

      const testFn = vi.fn().mockResolvedValue('test-result');
      await tracing.withTokenSpan('refresh', 'github', 'user-123', testFn);

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'Token refresh',
        expect.any(Function)
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('token.operation', 'refresh');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('token.provider', 'github');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('token.user_id', 'user-123');
    });
  });

  describe('getCurrentSpan', () => {
    it('should return undefined when tracing is disabled', () => {
      process.env.OTEL_ENABLED = 'false';
      mockContext.active.mockReturnValue({});
      mockTrace.getSpan.mockReturnValue(mockSpan);

      const result = tracing.getCurrentSpan();
      expect(result).toBeUndefined();
    });

    it('should return current span when tracing is enabled', () => {
      process.env.OTEL_ENABLED = '1';
      const activeContext = { test: 'context' };
      mockContext.active.mockReturnValue(activeContext);
      mockTrace.getSpan.mockReturnValue(mockSpan);

      const result = tracing.getCurrentSpan();
      expect(result).toBe(mockSpan);
      expect(mockContext.active).toHaveBeenCalled();
      expect(mockTrace.getSpan).toHaveBeenCalledWith(activeContext);
    });
  });

  describe('addSpanEvent', () => {
    it('should add event to current span when available', () => {
      process.env.OTEL_ENABLED = '1';
      mockContext.active.mockReturnValue({});
      mockTrace.getSpan.mockReturnValue(mockSpan);

      const attributes = { event: 'test-event', data: 'test-data' };
      tracing.addSpanEvent('test-event', attributes);

      expect(mockSpan.addEvent).toHaveBeenCalledWith('test-event', attributes);
    });

    it('should not add event when no current span', () => {
      process.env.OTEL_ENABLED = '1';
      mockContext.active.mockReturnValue({});
      mockTrace.getSpan.mockReturnValue(undefined);

      tracing.addSpanEvent('test-event', { data: 'test' });

      expect(mockSpan.addEvent).not.toHaveBeenCalled();
    });

    it('should add event without attributes', () => {
      process.env.OTEL_ENABLED = '1';
      mockContext.active.mockReturnValue({});
      mockTrace.getSpan.mockReturnValue(mockSpan);

      tracing.addSpanEvent('test-event');

      expect(mockSpan.addEvent).toHaveBeenCalledWith('test-event', undefined);
    });
  });

  describe('setSpanAttribute', () => {
    it('should set attribute on current span when available', () => {
      process.env.OTEL_ENABLED = '1';
      mockContext.active.mockReturnValue({});
      mockTrace.getSpan.mockReturnValue(mockSpan);

      tracing.setSpanAttribute('test.key', 'test-value');

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('test.key', 'test-value');
    });

    it('should not set attribute when no current span', () => {
      process.env.OTEL_ENABLED = '1';
      mockContext.active.mockReturnValue({});
      mockTrace.getSpan.mockReturnValue(undefined);

      tracing.setSpanAttribute('test.key', 'test-value');

      expect(mockSpan.setAttribute).not.toHaveBeenCalled();
    });

    it('should handle different attribute types', () => {
      process.env.OTEL_ENABLED = '1';
      mockContext.active.mockReturnValue({});
      mockTrace.getSpan.mockReturnValue(mockSpan);

      tracing.setSpanAttribute('string.attr', 'string-value');
      tracing.setSpanAttribute('number.attr', 42);
      tracing.setSpanAttribute('boolean.attr', true);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('string.attr', 'string-value');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('number.attr', 42);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('boolean.attr', true);
    });
  });

  describe('initializeTracing', () => {
    beforeEach(() => {
      // Mock console.log and console.error
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return false when tracing is disabled', async () => {
      process.env.OTEL_ENABLED = 'false';

      const result = await tracing.initializeTracing();
      expect(result).toBe(false);
    });

    it('should initialize tracing with default configuration', async () => {
      process.env.OTEL_ENABLED = '1';

      const result = await tracing.initializeTracing();
      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        '[OTEL] Tracing initialized: oauth-connector-sdk -> http://localhost:4318/v1/traces'
      );
    });

    it('should initialize tracing with custom configuration', async () => {
      process.env.OTEL_ENABLED = '1';
      process.env.OTEL_SERVICE_NAME = 'custom-service';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://custom-endpoint:4318/v1/traces';

      const result = await tracing.initializeTracing();
      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        '[OTEL] Tracing initialized: custom-service -> http://custom-endpoint:4318/v1/traces'
      );
    });

    it('should handle initialization errors', async () => {
      process.env.OTEL_ENABLED = '1';

      // Mock dynamic import to throw error
      vi.doMock('@opentelemetry/sdk-node', () => {
        throw new Error('SDK initialization failed');
      });

      const result = await tracing.initializeTracing();
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        '[OTEL] Failed to initialize tracing:',
        'SDK initialization failed'
      );
    });

    it('should set up graceful shutdown handler', async () => {
      process.env.OTEL_ENABLED = '1';
      const mockProcessOn = vi.spyOn(process, 'on').mockImplementation(() => process);

      await tracing.initializeTracing();

      expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

      // Test the SIGTERM handler
      const sigtermHandler = mockProcessOn.mock.calls.find((call) => call[0] === 'SIGTERM')?.[1];
      expect(sigtermHandler).toBeDefined();

      // Mock the SDK shutdown method
      const mockSDK = { shutdown: vi.fn().mockResolvedValue(undefined) };
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      vi.mocked(require('@opentelemetry/sdk-node').NodeSDK).mockReturnValue(mockSDK);

      if (sigtermHandler) {
        await sigtermHandler();
        expect(console.log).toHaveBeenCalledWith('[OTEL] Tracing terminated');
      }
    });

    it('should handle shutdown errors', async () => {
      process.env.OTEL_ENABLED = '1';
      const mockProcessOn = vi.spyOn(process, 'on').mockImplementation(() => process);

      await tracing.initializeTracing();

      const sigtermHandler = mockProcessOn.mock.calls.find((call) => call[0] === 'SIGTERM')?.[1];

      // Mock the SDK shutdown method to throw error
      const mockSDK = { shutdown: vi.fn().mockRejectedValue(new Error('Shutdown failed')) };
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      vi.mocked(require('@opentelemetry/sdk-node').NodeSDK).mockReturnValue(mockSDK);

      if (sigtermHandler) {
        await sigtermHandler();
        expect(console.error).toHaveBeenCalledWith(
          '[OTEL] Error terminating tracing',
          expect.any(Error)
        );
      }
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle null span in withSpan', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTrace.getTracer.mockReturnValue(mockTracer);
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(null); // Pass null span
        return Promise.resolve('test-result');
      });

      const testFn = vi.fn().mockResolvedValue('test-result');
      const result = await tracing.withSpan('test-span', testFn);

      expect(result).toBe('test-result');
      expect(testFn).toHaveBeenCalledWith(null);
    });

    it('should handle span operations with null span', () => {
      process.env.OTEL_ENABLED = '1';
      mockContext.active.mockReturnValue({});
      mockTrace.getSpan.mockReturnValue(null);

      // Should not throw when span is null
      expect(() => {
        tracing.addSpanEvent('test-event');
        tracing.setSpanAttribute('test.key', 'value');
      }).not.toThrow();
    });

    it('should handle concurrent span operations', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTrace.getTracer.mockReturnValue(mockTracer);
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(mockSpan);
        return Promise.resolve('test-result');
      });

      const operations = Array.from({ length: 10 }, (_, i) =>
        tracing.withSpan(`span-${i}`, async () => `result-${i}`)
      );

      const results = await Promise.all(operations);
      expect(results).toHaveLength(10);
      expect(mockTracer.startActiveSpan).toHaveBeenCalledTimes(10);
    });

    it('should handle very long span names', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTrace.getTracer.mockReturnValue(mockTracer);
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(mockSpan);
        return Promise.resolve('test-result');
      });

      const longName = 'a'.repeat(1000);
      const result = await tracing.withSpan(longName, async () => 'test-result');

      expect(result).toBe('test-result');
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(longName, expect.any(Function));
    });

    it('should handle special characters in span names and attributes', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTrace.getTracer.mockReturnValue(mockTracer);
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(mockSpan);
        return Promise.resolve('test-result');
      });

      const specialName = 'span-with-special-chars-!@#$%^&*()';
      const specialAttributes = {
        'attr.with.dots': 'value',
        'attr-with-dashes': 'value',
        attr_with_underscores: 'value',
        attrWithCamelCase: 'value',
      };

      const result = await tracing.withSpan(
        specialName,
        async () => 'test-result',
        specialAttributes
      );

      expect(result).toBe('test-result');
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(specialName, expect.any(Function));
    });
  });
});
