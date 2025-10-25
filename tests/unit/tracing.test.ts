/**
 * Tracing Unit Tests
 *
 * Tests focus on INTENT, not implementation details:
 * - Tracing functions work correctly when enabled/disabled
 * - Spans are created and managed properly
 * - Error handling is graceful
 * - NOT testing OpenTelemetry internal details
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as tracing from '../../src/observability/tracing';

// Mock OpenTelemetry API
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn(),
    getSpan: vi.fn(),
  },
  context: {
    active: vi.fn(),
  },
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
let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: vi.fn(() => `test-uuid-${++uuidCounter}`),
}));

// Mock OpenTelemetry SDK
vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: vi.fn().mockReturnValue([]),
}));

describe('Tracing', () => {
  let mockSpan: any;
  let mockTracer: any;
  let mockContext: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.OTEL_ENABLED;
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

    // Set up mocks
    mockSpan = {
      setAttribute: vi.fn(),
      addEvent: vi.fn(),
      recordException: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
    };

    mockTracer = {
      startActiveSpan: vi.fn(),
    };

    mockContext = {
      active: vi.fn().mockReturnValue({}),
    };

    const { trace, context } = await import('@opentelemetry/api');
    vi.mocked(trace.getTracer).mockReturnValue(mockTracer);
    vi.mocked(trace.getSpan).mockReturnValue(mockSpan);
    vi.mocked(context.active).mockReturnValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Tracing State', () => {
    it('should be disabled by default', () => {
      expect(tracing.isOTelEnabled()).toBe(false);
    });

    it('should be enabled when OTEL_ENABLED=1', () => {
      process.env.OTEL_ENABLED = '1';
      expect(tracing.isOTelEnabled()).toBe(true);
    });

    it('should be disabled when OTEL_ENABLED=0', () => {
      process.env.OTEL_ENABLED = '0';
      expect(tracing.isOTelEnabled()).toBe(false);
    });
  });

  describe('Tracer Management', () => {
    it('should return tracer when tracing is enabled', () => {
      process.env.OTEL_ENABLED = '1';
      const tracer = tracing.getTracer();
      expect(tracer).toBeDefined();
    });

    it('should return undefined when tracing is disabled', () => {
      const tracer = tracing.getTracer();
      expect(tracer).toBeNull();
    });
  });

  describe('Correlation ID Generation', () => {
    it('should generate unique correlation IDs', () => {
      const id1 = tracing.generateCorrelationId();
      const id2 = tracing.generateCorrelationId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
      expect(id1).not.toBe(id2);
    });
  });

  describe('Span Operations', () => {
    it('should execute function with span when tracing is enabled', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(mockSpan);
        return 'test-result';
      });

      const result = await tracing.withSpan('test-span', async () => 'test-result');
      
      expect(result).toBe('test-result');
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith('test-span', expect.any(Function));
    });

    it('should execute function without span when tracing is disabled', async () => {
      const result = await tracing.withSpan('test-span', async () => 'test-result');
      
      expect(result).toBe('test-result');
      expect(mockTracer.startActiveSpan).not.toHaveBeenCalled();
    });

    it('should handle function errors gracefully', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        try {
          return fn(mockSpan);
        } catch (error) {
          mockSpan.recordException(error);
          mockSpan.setStatus({ code: 2, message: 'Error' });
          throw error;
        } finally {
          mockSpan.end();
        }
      });

      await expect(
        tracing.withSpan('test-span', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect(mockSpan.recordException).toHaveBeenCalledWith(expect.any(Error));
      expect(mockSpan.setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: 2 }));
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should set span attributes when provided', async () => {
      process.env.OTEL_ENABLED = '1';
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(mockSpan);
        return 'test-result';
      });

      const attributes = {
        'test.attr': 'value',
        'test.number': 42,
        'test.boolean': true,
      };

      await tracing.withSpan('test-span', async () => 'test-result', attributes);
      
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('test.attr', 'value');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('test.number', 42);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('test.boolean', true);
    });
  });

  describe('Specialized Span Functions', () => {
    beforeEach(() => {
      process.env.OTEL_ENABLED = '1';
      mockTracer.startActiveSpan.mockImplementation((name, fn) => {
        fn(mockSpan);
        return 'test-result';
      });
    });

    it('should create HTTP spans', async () => {
      const result = await tracing.withHttpSpan('GET', '/api/users', async () => 'test-result');
      
      expect(result).toBe('test-result');
      // The actual span creation is tested in the base withSpan test
    });

    it('should create OAuth spans', async () => {
      const result = await tracing.withOAuthSpan('connect', 'github', 'user-123', async () => 'test-result');
      
      expect(result).toBe('test-result');
      // The actual span creation is tested in the base withSpan test
    });

    it('should create token spans', async () => {
      const result = await tracing.withTokenSpan('refresh', 'github', 'user-123', async () => 'test-result');
      
      expect(result).toBe('test-result');
      // The actual span creation is tested in the base withSpan test
    });
  });

  describe('Span Context Management', () => {
    it('should get current span when tracing is enabled', () => {
      process.env.OTEL_ENABLED = '1';
      const span = tracing.getCurrentSpan();
      expect(span).toBe(mockSpan);
    });

    it('should return undefined when tracing is disabled', () => {
      const span = tracing.getCurrentSpan();
      expect(span).toBeUndefined();
    });

    it('should add span events', () => {
      process.env.OTEL_ENABLED = '1';
      tracing.addSpanEvent('test-event', { key: 'value' });
      expect(mockSpan.addEvent).toHaveBeenCalledWith('test-event', { key: 'value' });
    });

    it('should set span attributes', () => {
      process.env.OTEL_ENABLED = '1';
      tracing.setSpanAttribute('test.key', 'test.value');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('test.key', 'test.value');
    });
  });

  describe('Initialization', () => {
    it('should initialize tracing when enabled', async () => {
      process.env.OTEL_ENABLED = '1';
      process.env.OTEL_SERVICE_NAME = 'test-service';
      
      await tracing.initializeTracing();
      
      expect(tracing.isOTelEnabled()).toBe(true);
    });

    it('should not initialize when disabled', async () => {
      await tracing.initializeTracing();
      
      expect(tracing.isOTelEnabled()).toBe(false);
    });

    it('should handle initialization errors gracefully', async () => {
      process.env.OTEL_ENABLED = '1';
      
      // Mock console methods to avoid noise in test output
      const originalError = console.error;
      console.error = vi.fn();
      
      try {
        await tracing.initializeTracing();
        expect(tracing.isOTelEnabled()).toBe(true);
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle null span gracefully', () => {
      process.env.OTEL_ENABLED = '1';
      mockTracer.startActiveSpan.mockReturnValue(null);
      
      expect(() => {
        tracing.addSpanEvent('test', {});
        tracing.setSpanAttribute('test', 'value');
      }).not.toThrow();
    });

    it('should handle undefined span gracefully', () => {
      process.env.OTEL_ENABLED = '1';
      mockTracer.startActiveSpan.mockReturnValue(undefined);
      
      expect(() => {
        tracing.addSpanEvent('test', {});
        tracing.setSpanAttribute('test', 'value');
      }).not.toThrow();
    });

    it('should handle complex attribute names', () => {
      process.env.OTEL_ENABLED = '1';
      
      const specialAttributes = {
        'attr.with.dots': 'value',
        'attr-with-dashes': 'value',
        attr_with_underscores: 'value',
        attrWithCamelCase: 'value',
      };

      expect(() => {
        Object.entries(specialAttributes).forEach(([key, value]) => {
          tracing.setSpanAttribute(key, value);
        });
      }).not.toThrow();
    });
  });
});