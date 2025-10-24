/**
 * OpenTelemetry Tracing (Opt-in)
 *
 * Provides distributed tracing with correlation IDs for enterprise observability.
 *
 * Features:
 * - Span creation for HTTP requests, token refresh, OAuth exchanges
 * - Correlation IDs for log tracing
 * - OTLP HTTP exporter for standard backends (Jaeger, Tempo, etc.)
 * - No-op by default (must explicitly enable)
 *
 * Enable via environment variables:
 * - OTEL_ENABLED=1
 * - OTEL_SERVICE_NAME=oauth-connector-sdk
 * - OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
 */

import { trace, context, SpanStatusCode, SpanKind, Span } from '@opentelemetry/api';
import { v4 as uuidv4 } from 'uuid';

const TRACER_NAME = 'oauth-connector-sdk';

/**
 * Check if OpenTelemetry is enabled
 */
export function isOTelEnabled(): boolean {
  return process.env.OTEL_ENABLED === '1' || process.env.OTEL_ENABLED === 'true';
}

/**
 * Get the global tracer instance
 */
export function getTracer() {
  if (!isOTelEnabled()) {
    return null;
  }
  return trace.getTracer(TRACER_NAME);
}

/**
 * Generate a unique correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return uuidv4();
}

/**
 * Execute a function within a span
 *
 * @param name - Span name
 * @param fn - Function to execute
 * @param attributes - Optional span attributes
 * @returns Result of fn
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span | null) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = getTracer();

  // If tracing disabled, execute without span
  if (!tracer) {
    return fn(null);
  }

  return tracer.startActiveSpan(name, async (span) => {
    try {
      // Set span attributes
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          span.setAttribute(key, value);
        });
      }

      // Execute function
      const result = await fn(span);

      // Mark span as successful
      span.setStatus({ code: SpanStatusCode.OK });

      return result;
    } catch (error: any) {
      // Record error
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });

      // Re-throw error
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Create a span for HTTP requests
 *
 * @param method - HTTP method
 * @param url - Request URL
 * @param fn - Function to execute
 * @returns Result of fn
 */
export async function withHttpSpan<T>(
  method: string,
  url: string,
  fn: (span: Span | null) => Promise<T>
): Promise<T> {
  return withSpan(`HTTP ${method}`, fn, {
    'http.method': method,
    'http.url': url,
    'span.kind': SpanKind.CLIENT,
  });
}

/**
 * Create a span for OAuth operations
 *
 * @param operation - Operation name (e.g., 'connect', 'callback', 'refresh')
 * @param provider - Provider name
 * @param userId - User ID
 * @param fn - Function to execute
 * @returns Result of fn
 */
export async function withOAuthSpan<T>(
  operation: string,
  provider: string,
  userId: string,
  fn: (span: Span | null) => Promise<T>
): Promise<T> {
  return withSpan(`OAuth ${operation}`, fn, {
    'oauth.operation': operation,
    'oauth.provider': provider,
    'oauth.user_id': userId,
  });
}

/**
 * Create a span for token operations
 *
 * @param operation - Operation name (e.g., 'refresh', 'store', 'delete')
 * @param provider - Provider name
 * @param userId - User ID
 * @param fn - Function to execute
 * @returns Result of fn
 */
export async function withTokenSpan<T>(
  operation: string,
  provider: string,
  userId: string,
  fn: (span: Span | null) => Promise<T>
): Promise<T> {
  return withSpan(`Token ${operation}`, fn, {
    'token.operation': operation,
    'token.provider': provider,
    'token.user_id': userId,
  });
}

/**
 * Get current span from context
 */
export function getCurrentSpan(): Span | undefined {
  if (!isOTelEnabled()) {
    return undefined;
  }
  return trace.getSpan(context.active());
}

/**
 * Add event to current span
 *
 * @param name - Event name
 * @param attributes - Event attributes
 */
export function addSpanEvent(name: string, attributes?: Record<string, any>): void {
  const span = getCurrentSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Set attribute on current span
 *
 * @param key - Attribute key
 * @param value - Attribute value
 */
export function setSpanAttribute(key: string, value: string | number | boolean): void {
  const span = getCurrentSpan();
  if (span) {
    span.setAttribute(key, value);
  }
}

/**
 * Initialize OpenTelemetry SDK (call once at app startup)
 *
 * This should be called before any other SDK operations.
 * Reads configuration from environment variables:
 * - OTEL_ENABLED: Enable tracing (default: false)
 * - OTEL_SERVICE_NAME: Service name (default: oauth-connector-sdk)
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP endpoint (default: http://localhost:4318/v1/traces)
 *
 * @returns true if initialized, false if disabled
 */
export async function initializeTracing(): Promise<boolean> {
  if (!isOTelEnabled()) {
    return false;
  }

  try {
    // Dynamic import to avoid loading OTEL SDK when not needed
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { getNodeAutoInstrumentations } = await import(
      '@opentelemetry/auto-instrumentations-node'
    );

    const serviceName = process.env.OTEL_SERVICE_NAME || 'oauth-connector-sdk';
    const otlpEndpoint =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

    const sdk = new NodeSDK({
      serviceName,
      traceExporter: new OTLPTraceExporter({
        url: otlpEndpoint,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable default HTTP instrumentation (we do it manually for better control)
          '@opentelemetry/instrumentation-http': {
            enabled: false,
          },
        }),
      ],
    });

    sdk.start();

    console.log(`[OTEL] Tracing initialized: ${serviceName} -> ${otlpEndpoint}`);

    // Graceful shutdown
    process.on('SIGTERM', () => {
      sdk
        .shutdown()
        .then(() => console.log('[OTEL] Tracing terminated'))
        .catch((error: any) => console.error('[OTEL] Error terminating tracing', error));
    });

    return true;
  } catch (error: any) {
    console.error('[OTEL] Failed to initialize tracing:', error.message);
    return false;
  }
}
