"use strict";
// src/core/http/HttpCore.ts
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpCore = void 0;
const axios_1 = __importDefault(require("axios"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const p_queue_1 = __importDefault(require("p-queue"));
const RetryHandler_1 = require("./RetryHandler");
const CircuitBreaker_1 = require("./CircuitBreaker");
const ETagCache_1 = require("./ETagCache");
const errors_1 = require("../../utils/errors");
const tracing_1 = require("../../observability/tracing");
class HttpCore {
    rateLimits;
    axiosInstance;
    rateLimiters = new Map();
    retryHandler;
    circuitBreaker;
    etagCache;
    metrics;
    logger;
    defaultTimeout;
    keepAlive;
    constructor(rateLimits, httpConfig, metrics, logger) {
        this.rateLimits = rateLimits;
        this.metrics = metrics;
        this.logger = logger;
        this.circuitBreaker = new CircuitBreaker_1.CircuitBreaker(logger);
        this.retryHandler = new RetryHandler_1.RetryHandler(httpConfig.retry, logger, this.circuitBreaker);
        this.etagCache = new ETagCache_1.ETagCache();
        this.keepAlive = httpConfig.keepAlive ?? true;
        this.defaultTimeout = httpConfig.timeout ?? 30000;
        const axiosOptions = {
            timeout: this.defaultTimeout,
            httpAgent: new http.Agent({ keepAlive: this.keepAlive }),
            httpsAgent: new https.Agent({ keepAlive: this.keepAlive }),
        };
        if (httpConfig.proxy !== undefined) {
            axiosOptions.proxy = httpConfig.proxy;
        }
        this.axiosInstance = axios_1.default.create(axiosOptions);
        this.setupInterceptors();
        this.initializeRateLimiters();
    }
    async get(url, config) {
        return this.request({ ...config, url, method: 'GET' });
    }
    async post(url, body, config) {
        return this.request({ ...config, url, method: 'POST', body });
    }
    /**
     * CRITICAL v1.1 FIX #4: Core request with ETag and rate limiting
     */
    async request(config) {
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
            throw new errors_1.CircuitBreakerOpenError(`Circuit breaker open for ${provider}`);
        }
        // Prepare headers with conditional request support (v1.1 FIX #4)
        const headers = {
            'X-Request-ID': requestId,
            'User-Agent': 'oauth-connector-sdk/1.0',
            'Accept-Encoding': 'gzip, deflate',
            ...config.headers,
        };
        // Add If-None-Match if we have cached ETag
        let cachedData;
        if (config.etagKey && config.method === 'GET') {
            cachedData = this.etagCache.get(config.etagKey);
            if (cachedData?.etag) {
                headers['If-None-Match'] = cachedData.etag;
                this.logger.debug('Conditional request', { requestId, etag: cachedData.etag });
            }
        }
        // Execute request (with rate limiting and tracing) - v1.1 FIX #4
        const execute = async () => {
            return (0, tracing_1.withHttpSpan)(method, config.url, async () => {
                const startTime = Date.now();
                try {
                    const axiosResponse = await this.retryHandler.execute(async () => {
                        return this.axiosInstance.request({
                            url: config.url,
                            method: config.method ?? 'GET',
                            headers,
                            params: config.query,
                            data: config.body,
                            timeout: config.timeout ?? this.defaultTimeout,
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
                    const result = {
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
                }
                catch (error) {
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
    async runThroughRateLimiter(provider, skip, task) {
        const queue = this.rateLimiters.get(provider);
        if (!queue || skip) {
            return task();
        }
        // CRITICAL FIX: Update queue size gauge when task is queued
        const wrappedTask = async () => {
            try {
                return await task();
            }
            finally {
                // Update gauge after task completes (queue size decreases)
                this.metrics.recordGauge('rate_limit_queue_size', queue.size, { provider });
            }
        };
        // Update gauge before queuing (queue size increases)
        this.metrics.recordGauge('rate_limit_queue_size', queue.size + 1, { provider });
        // Execute task INSIDE queue
        return (await queue.add(wrappedTask));
    }
    setupInterceptors() {
        this.axiosInstance.interceptors.response.use((response) => response, (error) => {
            if (error.response?.status === 429) {
                const retryAfter = error.response.headers['retry-after'];
                if (retryAfter) {
                    this.logger.warn('Rate limited', { retryAfter });
                }
            }
            return Promise.reject(error);
        });
    }
    initializeRateLimiters() {
        for (const [provider, config] of Object.entries(this.rateLimits)) {
            // CRITICAL FIX: Handle fractional QPS without losing precision
            let intervalCap;
            let interval;
            if (config.qps >= 1) {
                // For QPS >= 1, use 1-second intervals with multiple requests
                intervalCap = config.qps;
                interval = 1000;
            }
            else {
                // For QPS < 1, use longer intervals with single requests
                // e.g., 0.5 QPS = 1 request per 2000ms
                intervalCap = 1;
                interval = Math.floor(1000 / config.qps);
            }
            this.rateLimiters.set(provider, new p_queue_1.default({
                intervalCap,
                interval,
                concurrency: config.concurrency,
            }));
            this.logger.debug('Rate limiter initialized', {
                provider,
                originalQps: config.qps,
                intervalCap,
                interval,
                concurrency: config.concurrency,
            });
        }
    }
    extractProvider(url) {
        if (url.includes('github.com'))
            return 'github';
        if (url.includes('googleapis.com'))
            return 'google';
        if (url.includes('reddit.com'))
            return 'reddit';
        if (url.includes('twitter.com') || url.includes('api.x.com'))
            return 'twitter';
        return 'rss';
    }
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }
    toHeaderRecord(headers) {
        const record = {};
        for (const [key, value] of Object.entries(headers)) {
            if (typeof value === 'string') {
                record[key.toLowerCase()] = value;
            }
        }
        return record;
    }
    transformError(error, provider) {
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
                return new errors_1.ApiClientError(`Client error: ${status}`, {
                    provider,
                    status,
                    response: error.response.data,
                });
            }
            if (status >= 500) {
                return new errors_1.ApiServerError(`Server error: ${status}`, { provider, status });
            }
        }
        if (error.code === 'ECONNABORTED') {
            return new errors_1.NetworkTimeoutError('Request timeout', { provider });
        }
        return new errors_1.NetworkError('Network error', { provider, cause: error });
    }
}
exports.HttpCore = HttpCore;
//# sourceMappingURL=HttpCore.js.map