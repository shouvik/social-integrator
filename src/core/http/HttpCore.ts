// src/core/http/HttpCore.ts

import axios, { AxiosInstance } from 'axios';
import * as http from 'http';
import * as https from 'https';
import PQueue from 'p-queue';
import type { HttpRequestConfig, HttpResponse, RateLimitConfig, RetryConfig } from './types';
import type { ProviderName } from '../normalizer/types';
import type { MetricsCollector } from '../../observability/MetricsCollector';
import type { Logger } from '../../observability/Logger';
import { RetryHandler } from './RetryHandler';
import { CircuitBreaker } from './CircuitBreaker';
import { ETagCache } from './ETagCache';
import {
  ApiClientError,
  ApiServerError,
  NetworkTimeoutError,
  NetworkError,
  CircuitBreakerOpenError,
} from '../../utils/errors';
import { withHttpSpan } from '../../observability/tracing';

export class HttpCore {
  private axiosInstance: AxiosInstance;
  private rateLimiters: Map<ProviderName, PQueue> = new Map();
  private retryHandler: RetryHandler;
  private circuitBreaker: CircuitBreaker;
  private etagCache: ETagCache;
  private metrics: MetricsCollector;
  private logger: Logger;

  constructor(
    private rateLimits: Record<ProviderName, RateLimitConfig>,
    retryConfig: RetryConfig,
    metrics: MetricsCollector,
    logger: Logger
  ) {
    this.metrics = metrics;
    this.logger = logger;
    this.circuitBreaker = new CircuitBreaker(logger);
    this.retryHandler = new RetryHandler(retryConfig, logger, this.circuitBreaker);
    this.etagCache = new ETagCache();

    this.axiosInstance = axios.create({
      timeout: 30000,
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),
    });

    this.setupInterceptors();
    this.initializeRateLimiters();
  }

  async get<T = unknown>(
    url: string,
    config: Omit<HttpRequestConfig, 'url' | 'method'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: 'GET' });
  }

  async post<T = unknown>(
    url: string,
    body: unknown,
    config?: Omit<HttpRequestConfig, 'url' | 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: 'POST', body });
  }

  /**
   * CRITICAL v1.1 FIX #4: Core request with ETag and rate limiting
   */
  async request<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const provider = this.extractProvider(config.url);
    const requestId = this.generateRequestId();
    const method = config.method ?? 'GET';

    // CRITICAL FIX: Increment http_requests_total counter
    this.metrics.incrementCounter('http_requests_total', {
      provider,
      method,
      status: 'initiated',
    });

    this.logger.debug('HTTP request', {
      requestId,
      provider,
      url: config.url,
      method,
      query: config.query,
      headerKeys: Object.keys(config.headers || {}),
    });

    // Check circuit breaker
    if (!this.circuitBreaker.canExecute(provider)) {
      throw new CircuitBreakerOpenError(`Circuit breaker open for ${provider}`);
    }

    // Prepare headers with conditional request support (v1.1 FIX #4)
    const headers: Record<string, string> = {
      'X-Request-ID': requestId,
      'User-Agent': 'oauth-connector-sdk/1.0',
      'Accept-Encoding': 'gzip, deflate',
      ...config.headers,
    };

    // Add If-None-Match if we have cached ETag
    let cachedData: any;
    if (config.etagKey && config.method === 'GET') {
      cachedData = this.etagCache.get<T>(config.etagKey);
      if (cachedData?.etag) {
        headers['If-None-Match'] = cachedData.etag;
        this.logger.debug('Conditional request', { requestId, etag: cachedData.etag });
      }
    }

    // Execute request (with rate limiting and tracing) - v1.1 FIX #4
    const execute = async (): Promise<HttpResponse<T>> => {
      return withHttpSpan(method, config.url, async () => {
        const startTime = Date.now();

        try {
          const axiosResponse = await this.retryHandler.execute(async () => {
            return this.axiosInstance.request<T>({
              url: config.url,
              method: config.method ?? 'GET',
              headers,
              params: config.query,
              data: config.body,
              timeout: config.timeout,
              validateStatus: (status) => status < 400 || status === 304,
            });
          }, provider);

          this.circuitBreaker.recordSuccess(provider);

          // CRITICAL FIX: Record final http_requests_total with actual status
          this.metrics.incrementCounter('http_requests_total', {
            provider,
            method,
            status: axiosResponse.status.toString(),
          });

          this.metrics.recordLatency('http_request_duration', Date.now() - startTime, {
            provider,
            status: axiosResponse.status,
          });

          // Handle 304 Not Modified (v1.1 FIX #4)
          if (axiosResponse.status === 304 && cachedData) {
            this.logger.debug('304 Not Modified, using cache', { requestId });
            this.metrics.incrementCounter('http_cache_hits', { provider });
            return {
              ...cachedData.payload,
              status: 304, // Preserve 304 status, not the cached 200
              cached: true,
            };
          }

          // Normal 200 response
          const result: HttpResponse<T> = {
            data: axiosResponse.data,
            status: axiosResponse.status,
            headers: this.toHeaderRecord(axiosResponse.headers),
          };

          // Update cache if ETag present
          const etag = result.headers.etag || result.headers['etag'];
          if (config.etagKey && etag) {
            this.etagCache.set(config.etagKey, result, etag);
            this.logger.debug('Cached with ETag', { requestId, etag });
          }

          return result;
        } catch (error: any) {
          this.circuitBreaker.recordFailure(provider);

          // CRITICAL FIX: Record final http_requests_total for errors
          const errorStatus = error.response?.status ?? 'error';
          this.metrics.incrementCounter('http_requests_total', {
            provider,
            method,
            status: errorStatus.toString(),
          });

          this.metrics.incrementCounter('http_errors', {
            provider,
            status: errorStatus,
          });
          throw this.transformError(error, provider);
        }
      });
    };

    // CRITICAL v1.1 FIX #4: Execute inside rate limiter queue
    return this.runThroughRateLimiter(provider, config.skipRateLimit, execute);
  }

  /**
   * CRITICAL v1.1 FIX #4: Actually execute task in queue with metrics
   */
  private async runThroughRateLimiter<T>(
    provider: ProviderName,
    skip: boolean | undefined,
    task: () => Promise<T>
  ): Promise<T> {
    const queue = this.rateLimiters.get(provider);

    if (!queue || skip) {
      return task();
    }

    // CRITICAL FIX: Update queue size gauge when task is queued
    const wrappedTask = async () => {
      try {
        return await task();
      } finally {
        // Update gauge after task completes (queue size decreases)
        this.metrics.recordGauge('rate_limit_queue_size', queue.size, { provider });
      }
    };

    // Update gauge before queuing (queue size increases)
    this.metrics.recordGauge('rate_limit_queue_size', queue.size + 1, { provider });

    // Execute task INSIDE queue
    return (await queue.add(wrappedTask)) as T;
  }

  private setupInterceptors(): void {
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          if (retryAfter) {
            this.logger.warn('Rate limited', { retryAfter });
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private initializeRateLimiters(): void {
    for (const [provider, config] of Object.entries(this.rateLimits)) {
      // CRITICAL FIX: Handle fractional QPS without losing precision
      let intervalCap: number;
      let interval: number;

      if (config.qps >= 1) {
        // For QPS >= 1, use 1-second intervals with multiple requests
        intervalCap = config.qps;
        interval = 1000;
      } else {
        // For QPS < 1, use longer intervals with single requests
        // e.g., 0.5 QPS = 1 request per 2000ms
        intervalCap = 1;
        interval = Math.floor(1000 / config.qps);
      }

      this.rateLimiters.set(
        provider as ProviderName,
        new PQueue({
          intervalCap,
          interval,
          concurrency: config.concurrency,
        })
      );

      this.logger.debug('Rate limiter initialized', {
        provider,
        originalQps: config.qps,
        intervalCap,
        interval,
        concurrency: config.concurrency,
      });
    }
  }

  private extractProvider(url: string): ProviderName {
    if (url.includes('github.com')) return 'github';
    if (url.includes('googleapis.com')) return 'google';
    if (url.includes('reddit.com')) return 'reddit';
    if (url.includes('twitter.com') || url.includes('api.x.com')) return 'twitter';
    return 'rss';
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private toHeaderRecord(headers: any): Record<string, string> {
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') {
        record[key.toLowerCase()] = value;
      }
    }
    return record;
  }

  private transformError(error: any, provider: ProviderName): Error {
    if (error.response) {
      const status = error.response.status;

      // Log response body for debugging
      this.logger.debug('HTTP error response', {
        provider,
        status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers,
      });

      if (status >= 400 && status < 500) {
        return new ApiClientError(`Client error: ${status}`, {
          provider,
          status,
          response: error.response.data,
        });
      }
      if (status >= 500) {
        return new ApiServerError(`Server error: ${status}`, { provider, status });
      }
    }
    if (error.code === 'ECONNABORTED') {
      return new NetworkTimeoutError('Request timeout', { provider });
    }
    return new NetworkError('Network error', { provider, cause: error });
  }
}
