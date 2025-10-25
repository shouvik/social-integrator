import type { HttpCoreConfig, HttpRequestConfig, HttpResponse, RateLimitConfig } from './types';
import type { ProviderName } from '../normalizer/types';
import type { MetricsCollector } from '../../observability/MetricsCollector';
import type { Logger } from '../../observability/Logger';
export declare class HttpCore {
    private rateLimits;
    private axiosInstance;
    private rateLimiters;
    private retryHandler;
    private circuitBreaker;
    private etagCache;
    private metrics;
    private logger;
    private defaultTimeout;
    private keepAlive;
    constructor(rateLimits: Record<ProviderName, RateLimitConfig>, httpConfig: HttpCoreConfig, metrics: MetricsCollector, logger: Logger);
    get<T = unknown>(url: string, config: Omit<HttpRequestConfig, 'url' | 'method'>): Promise<HttpResponse<T>>;
    post<T = unknown>(url: string, body: unknown, config?: Omit<HttpRequestConfig, 'url' | 'method' | 'body'>): Promise<HttpResponse<T>>;
    /**
     * CRITICAL v1.1 FIX #4: Core request with ETag and rate limiting
     */
    request<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>>;
    /**
     * CRITICAL v1.1 FIX #4: Actually execute task in queue with metrics
     */
    private runThroughRateLimiter;
    private setupInterceptors;
    private initializeRateLimiters;
    private extractProvider;
    private generateRequestId;
    private toHeaderRecord;
    private transformError;
}
//# sourceMappingURL=HttpCore.d.ts.map