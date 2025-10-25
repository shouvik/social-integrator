"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOTelEnabled = isOTelEnabled;
exports.getTracer = getTracer;
exports.generateCorrelationId = generateCorrelationId;
exports.withSpan = withSpan;
exports.withHttpSpan = withHttpSpan;
exports.withOAuthSpan = withOAuthSpan;
exports.withTokenSpan = withTokenSpan;
exports.getCurrentSpan = getCurrentSpan;
exports.addSpanEvent = addSpanEvent;
exports.setSpanAttribute = setSpanAttribute;
exports.initializeTracing = initializeTracing;
const api_1 = require("@opentelemetry/api");
const uuid_1 = require("uuid");
const TRACER_NAME = 'oauth-connector-sdk';
/**
 * Check if OpenTelemetry is enabled
 */
function isOTelEnabled() {
    return process.env.OTEL_ENABLED === '1' || process.env.OTEL_ENABLED === 'true';
}
/**
 * Get the global tracer instance
 */
function getTracer() {
    if (!isOTelEnabled()) {
        return null;
    }
    return api_1.trace.getTracer(TRACER_NAME);
}
/**
 * Generate a unique correlation ID for request tracing
 */
function generateCorrelationId() {
    return (0, uuid_1.v4)();
}
/**
 * Execute a function within a span
 *
 * @param name - Span name
 * @param fn - Function to execute
 * @param attributes - Optional span attributes
 * @returns Result of fn
 */
async function withSpan(name, fn, attributes) {
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
            span.setStatus({ code: api_1.SpanStatusCode.OK });
            return result;
        }
        catch (error) {
            // Record error
            span.recordException(error);
            span.setStatus({
                code: api_1.SpanStatusCode.ERROR,
                message: error.message,
            });
            // Re-throw error
            throw error;
        }
        finally {
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
async function withHttpSpan(method, url, fn) {
    return withSpan(`HTTP ${method}`, fn, {
        'http.method': method,
        'http.url': url,
        'span.kind': api_1.SpanKind.CLIENT,
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
async function withOAuthSpan(operation, provider, userId, fn) {
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
async function withTokenSpan(operation, provider, userId, fn) {
    return withSpan(`Token ${operation}`, fn, {
        'token.operation': operation,
        'token.provider': provider,
        'token.user_id': userId,
    });
}
/**
 * Get current span from context
 */
function getCurrentSpan() {
    if (!isOTelEnabled()) {
        return undefined;
    }
    return api_1.trace.getSpan(api_1.context.active());
}
/**
 * Add event to current span
 *
 * @param name - Event name
 * @param attributes - Event attributes
 */
function addSpanEvent(name, attributes) {
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
function setSpanAttribute(key, value) {
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
async function initializeTracing() {
    if (!isOTelEnabled()) {
        return false;
    }
    try {
        // Dynamic import to avoid loading OTEL SDK when not needed
        const { NodeSDK } = await Promise.resolve().then(() => __importStar(require('@opentelemetry/sdk-node')));
        const { OTLPTraceExporter } = await Promise.resolve().then(() => __importStar(require('@opentelemetry/exporter-trace-otlp-http')));
        const { getNodeAutoInstrumentations } = await Promise.resolve().then(() => __importStar(require('@opentelemetry/auto-instrumentations-node')));
        const serviceName = process.env.OTEL_SERVICE_NAME || 'oauth-connector-sdk';
        const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';
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
                .catch((error) => console.error('[OTEL] Error terminating tracing', error));
        });
        return true;
    }
    catch (error) {
        console.error('[OTEL] Failed to initialize tracing:', error.message);
        return false;
    }
}
//# sourceMappingURL=tracing.js.map