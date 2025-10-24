// src/observability/MetricsCollector.ts

import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import * as http from 'http';
import type { Logger } from './Logger';

export interface MetricsConfig {
  enabled?: boolean;
  port?: number;
  path?: string;
}

export class MetricsCollector {
  private registry: Registry;
  private counters: Map<string, Counter> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private server?: http.Server;
  private logger?: Logger;

  constructor(config: MetricsConfig = {}, logger?: Logger) {
    this.logger = logger;
    this.registry = new Registry();

    if (config.enabled !== false) {
      this.initializeMetrics();

      if (config.port) {
        this.exposeMetrics(config.port, config.path ?? '/metrics');
      }
    }
  }

  private initializeMetrics(): void {
    // HTTP metrics
    this.counters.set(
      'http_requests_total',
      new Counter({
        name: 'http_requests_total',
        help: 'Total HTTP requests',
        labelNames: ['provider', 'method', 'status'],
        registers: [this.registry],
      })
    );

    this.histograms.set(
      'http_request_duration',
      new Histogram({
        name: 'http_request_duration_seconds',
        help: 'HTTP request duration',
        labelNames: ['provider', 'status'],
        buckets: [0.1, 0.5, 1, 2, 5],
        registers: [this.registry],
      })
    );

    this.counters.set(
      'http_cache_hits',
      new Counter({
        name: 'http_cache_hits_total',
        help: 'HTTP cache hits',
        labelNames: ['provider'],
        registers: [this.registry],
      })
    );

    this.counters.set(
      'http_errors',
      new Counter({
        name: 'http_errors_total',
        help: 'HTTP errors',
        labelNames: ['provider', 'status'],
        registers: [this.registry],
      })
    );

    // Rate limiting metrics
    this.gauges.set(
      'rate_limit_queue_size',
      new Gauge({
        name: 'rate_limit_queue_size',
        help: 'Current rate limit queue size',
        labelNames: ['provider'],
        registers: [this.registry],
      })
    );

    this.counters.set(
      'rate_limit_hits',
      new Counter({
        name: 'rate_limit_hits_total',
        help: 'Rate limit exceeded count',
        labelNames: ['provider'],
        registers: [this.registry],
      })
    );

    // Token metrics (v1.1)
    this.counters.set(
      'token_refresh_total',
      new Counter({
        name: 'token_refresh_total',
        help: 'Token refresh attempts',
        labelNames: ['provider', 'status'],
        registers: [this.registry],
      })
    );

    this.counters.set(
      'token_refresh_dedup_local',
      new Counter({
        name: 'token_refresh_dedup_local_total',
        help: 'Token refresh deduplicated locally',
        labelNames: ['provider'],
        registers: [this.registry],
      })
    );

    this.counters.set(
      'token_refresh_dedup_distributed',
      new Counter({
        name: 'token_refresh_dedup_distributed_total',
        help: 'Token refresh deduplicated via Redis',
        labelNames: ['provider'],
        registers: [this.registry],
      })
    );

    this.histograms.set(
      'token_refresh_duration',
      new Histogram({
        name: 'token_refresh_duration_seconds',
        help: 'Token refresh duration',
        labelNames: ['provider', 'status'],
        buckets: [0.1, 0.3, 0.5, 1, 2],
        registers: [this.registry],
      })
    );

    this.counters.set(
      'token_refresh_failures',
      new Counter({
        name: 'token_refresh_failures_total',
        help: 'Token refresh failures',
        labelNames: ['provider', 'errorType'],
        registers: [this.registry],
      })
    );

    this.counters.set(
      'connections_total',
      new Counter({
        name: 'connections_total',
        help: 'Total connections established',
        labelNames: ['provider'],
        registers: [this.registry],
      })
    );

    this.histograms.set(
      'fetch_duration',
      new Histogram({
        name: 'fetch_duration_seconds',
        help: 'Fetch operation duration',
        labelNames: ['provider'],
        buckets: [0.1, 0.5, 1, 2, 5, 10],
        registers: [this.registry],
      })
    );

    this.gauges.set(
      'items_fetched',
      new Gauge({
        name: 'items_fetched',
        help: 'Number of items fetched',
        labelNames: ['provider'],
        registers: [this.registry],
      })
    );
  }

  incrementCounter(name: string, labels: Record<string, string | number>): void {
    const counter = this.counters.get(name);
    counter?.inc(labels);
  }

  recordLatency(name: string, durationMs: number, labels: Record<string, string | number>): void {
    const histogram = this.histograms.get(name);
    histogram?.observe(labels, durationMs / 1000);
  }

  recordGauge(name: string, value: number, labels: Record<string, string | number>): void {
    const gauge = this.gauges.get(name);
    gauge?.set(labels, value);
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  private exposeMetrics(port: number, path: string): void {
    this.server = http.createServer(async (req, res) => {
      if (req.url === path) {
        res.setHeader('Content-Type', this.registry.contentType);
        res.end(await this.getMetrics());
      } else {
        res.statusCode = 404;
        res.end('Not Found');
      }
    });

    // Handle port conflicts gracefully for tests
    this.server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        if (this.logger) {
          this.logger.warn(`Port ${port} in use, trying next available port`);
        }
        // Try next port
        this.tryNextPort(port + 1, path);
      } else {
        if (this.logger) {
          this.logger.error('MetricsCollector server error', { error: error.message });
        }
      }
    });

    this.server.listen(port, () => {
      const actualPort = (this.server?.address() as any)?.port || port;
      const message = `Metrics exposed on http://localhost:${actualPort}${path}`;
      if (this.logger) {
        this.logger.info(message);
      }
    });
  }

  private tryNextPort(port: number, path: string): void {
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
      } else {
        res.statusCode = 404;
        res.end('Not Found');
      }
    });

    this.server.on('error', (error: any) => {
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

  async close(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => resolve());
      });
    }
  }
}
