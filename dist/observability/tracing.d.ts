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
import { Span } from '@opentelemetry/api';
/**
 * Check if OpenTelemetry is enabled
 */
export declare function isOTelEnabled(): boolean;
/**
 * Get the global tracer instance
 */
export declare function getTracer(): import("@opentelemetry/api").Tracer | null;
/**
 * Generate a unique correlation ID for request tracing
 */
export declare function generateCorrelationId(): string;
/**
 * Execute a function within a span
 *
 * @param name - Span name
 * @param fn - Function to execute
 * @param attributes - Optional span attributes
 * @returns Result of fn
 */
export declare function withSpan<T>(name: string, fn: (span: Span | null) => Promise<T>, attributes?: Record<string, string | number | boolean>): Promise<T>;
/**
 * Create a span for HTTP requests
 *
 * @param method - HTTP method
 * @param url - Request URL
 * @param fn - Function to execute
 * @returns Result of fn
 */
export declare function withHttpSpan<T>(method: string, url: string, fn: (span: Span | null) => Promise<T>): Promise<T>;
/**
 * Create a span for OAuth operations
 *
 * @param operation - Operation name (e.g., 'connect', 'callback', 'refresh')
 * @param provider - Provider name
 * @param userId - User ID
 * @param fn - Function to execute
 * @returns Result of fn
 */
export declare function withOAuthSpan<T>(operation: string, provider: string, userId: string, fn: (span: Span | null) => Promise<T>): Promise<T>;
/**
 * Create a span for token operations
 *
 * @param operation - Operation name (e.g., 'refresh', 'store', 'delete')
 * @param provider - Provider name
 * @param userId - User ID
 * @param fn - Function to execute
 * @returns Result of fn
 */
export declare function withTokenSpan<T>(operation: string, provider: string, userId: string, fn: (span: Span | null) => Promise<T>): Promise<T>;
/**
 * Get current span from context
 */
export declare function getCurrentSpan(): Span | undefined;
/**
 * Add event to current span
 *
 * @param name - Event name
 * @param attributes - Event attributes
 */
export declare function addSpanEvent(name: string, attributes?: Record<string, any>): void;
/**
 * Set attribute on current span
 *
 * @param key - Attribute key
 * @param value - Attribute value
 */
export declare function setSpanAttribute(key: string, value: string | number | boolean): void;
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
export declare function initializeTracing(): Promise<boolean>;
//# sourceMappingURL=tracing.d.ts.map