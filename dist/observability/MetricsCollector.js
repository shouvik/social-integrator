"use strict";
// src/observability/MetricsCollector.ts
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
exports.MetricsCollector = void 0;
const prom_client_1 = require("prom-client");
const http = __importStar(require("http"));
class MetricsCollector {
    registry;
    counters = new Map();
    histograms = new Map();
    gauges = new Map();
    server;
    logger;
    constructor(config = {}, logger) {
        this.logger = logger;
        this.registry = new prom_client_1.Registry();
        if (config.enabled !== false) {
            this.initializeMetrics();
            if (config.port) {
                this.exposeMetrics(config.port, config.path ?? '/metrics');
            }
        }
    }
    initializeMetrics() {
        // HTTP metrics
        this.counters.set('http_requests_total', new prom_client_1.Counter({
            name: 'http_requests_total',
            help: 'Total HTTP requests',
            labelNames: ['provider', 'method', 'status'],
            registers: [this.registry],
        }));
        this.histograms.set('http_request_duration', new prom_client_1.Histogram({
            name: 'http_request_duration_seconds',
            help: 'HTTP request duration',
            labelNames: ['provider', 'status'],
            buckets: [0.1, 0.5, 1, 2, 5],
            registers: [this.registry],
        }));
        this.counters.set('http_cache_hits', new prom_client_1.Counter({
            name: 'http_cache_hits_total',
            help: 'HTTP cache hits',
            labelNames: ['provider'],
            registers: [this.registry],
        }));
        this.counters.set('http_errors', new prom_client_1.Counter({
            name: 'http_errors_total',
            help: 'HTTP errors',
            labelNames: ['provider', 'status'],
            registers: [this.registry],
        }));
        // Rate limiting metrics
        this.gauges.set('rate_limit_queue_size', new prom_client_1.Gauge({
            name: 'rate_limit_queue_size',
            help: 'Current rate limit queue size',
            labelNames: ['provider'],
            registers: [this.registry],
        }));
        this.counters.set('rate_limit_hits', new prom_client_1.Counter({
            name: 'rate_limit_hits_total',
            help: 'Rate limit exceeded count',
            labelNames: ['provider'],
            registers: [this.registry],
        }));
        // Token metrics (v1.1)
        this.counters.set('token_refresh_total', new prom_client_1.Counter({
            name: 'token_refresh_total',
            help: 'Token refresh attempts',
            labelNames: ['provider', 'status'],
            registers: [this.registry],
        }));
        this.counters.set('token_refresh_dedup_local', new prom_client_1.Counter({
            name: 'token_refresh_dedup_local_total',
            help: 'Token refresh deduplicated locally',
            labelNames: ['provider'],
            registers: [this.registry],
        }));
        this.counters.set('token_refresh_dedup_distributed', new prom_client_1.Counter({
            name: 'token_refresh_dedup_distributed_total',
            help: 'Token refresh deduplicated via Redis',
            labelNames: ['provider'],
            registers: [this.registry],
        }));
        this.histograms.set('token_refresh_duration', new prom_client_1.Histogram({
            name: 'token_refresh_duration_seconds',
            help: 'Token refresh duration',
            labelNames: ['provider', 'status'],
            buckets: [0.1, 0.3, 0.5, 1, 2],
            registers: [this.registry],
        }));
        this.counters.set('token_refresh_failures', new prom_client_1.Counter({
            name: 'token_refresh_failures_total',
            help: 'Token refresh failures',
            labelNames: ['provider', 'errorType'],
            registers: [this.registry],
        }));
        this.counters.set('connections_total', new prom_client_1.Counter({
            name: 'connections_total',
            help: 'Total connections established',
            labelNames: ['provider'],
            registers: [this.registry],
        }));
        this.histograms.set('fetch_duration', new prom_client_1.Histogram({
            name: 'fetch_duration_seconds',
            help: 'Fetch operation duration',
            labelNames: ['provider'],
            buckets: [0.1, 0.5, 1, 2, 5, 10],
            registers: [this.registry],
        }));
        this.gauges.set('items_fetched', new prom_client_1.Gauge({
            name: 'items_fetched',
            help: 'Number of items fetched',
            labelNames: ['provider'],
            registers: [this.registry],
        }));
    }
    incrementCounter(name, labels) {
        const counter = this.counters.get(name);
        counter?.inc(labels);
    }
    recordLatency(name, durationMs, labels) {
        const histogram = this.histograms.get(name);
        histogram?.observe(labels, durationMs / 1000);
    }
    recordGauge(name, value, labels) {
        const gauge = this.gauges.get(name);
        gauge?.set(labels, value);
    }
    async getMetrics() {
        return this.registry.metrics();
    }
    exposeMetrics(port, path) {
        this.server = http.createServer(async (req, res) => {
            if (req.url === path) {
                res.setHeader('Content-Type', this.registry.contentType);
                res.end(await this.getMetrics());
            }
            else {
                res.statusCode = 404;
                res.end('Not Found');
            }
        });
        // Handle port conflicts gracefully for tests
        this.server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                if (this.logger) {
                    this.logger.warn(`Port ${port} in use, trying next available port`);
                }
                // Try next port
                this.tryNextPort(port + 1, path);
            }
            else {
                if (this.logger) {
                    this.logger.error('MetricsCollector server error', { error: error.message });
                }
            }
        });
        this.server.listen(port, () => {
            const actualPort = this.server?.address()?.port || port;
            const message = `Metrics exposed on http://localhost:${actualPort}${path}`;
            if (this.logger) {
                this.logger.info(message);
            }
        });
    }
    tryNextPort(port, path) {
        // Limit to reasonable range to avoid infinite loops
        if (port > 9200) {
            if (this.logger) {
                this.logger.error('Unable to find available port for metrics server');
            }
            return;
        }
        this.server?.close();
        this.server = http.createServer(async (req, res) => {
            if (req.url === path) {
                res.setHeader('Content-Type', this.registry.contentType);
                res.end(await this.getMetrics());
            }
            else {
                res.statusCode = 404;
                res.end('Not Found');
            }
        });
        this.server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                this.tryNextPort(port + 1, path);
            }
        });
        this.server.listen(port, () => {
            const message = `Metrics exposed on http://localhost:${port}${path}`;
            if (this.logger) {
                this.logger.info(message);
            }
        });
    }
    async close() {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => resolve());
            });
        }
    }
}
exports.MetricsCollector = MetricsCollector;
//# sourceMappingURL=MetricsCollector.js.map