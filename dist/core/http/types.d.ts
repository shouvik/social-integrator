import type { ProviderName } from '../normalizer/types';
export interface HttpRequestConfig {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers?: Record<string, string>;
    query?: Record<string, string | number | boolean>;
    body?: unknown;
    timeout?: number;
    etagKey?: ETagKey;
    skipRateLimit?: boolean;
}
export interface ETagKey {
    userId: string;
    provider: ProviderName;
    resource: string;
}
export interface HttpResponse<T = unknown> {
    data: T;
    status: number;
    headers: Record<string, string>;
    cached?: boolean;
}
export interface RateLimitConfig {
    qps: number;
    concurrency: number;
    burst?: number;
}
export interface RetryConfig {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    retryableStatusCodes: number[];
}
export interface HttpProxyConfig {
    host: string;
    port: number;
    protocol?: 'http' | 'https';
    auth?: {
        username: string;
        password: string;
    };
}
export interface HttpCoreConfig {
    timeout?: number;
    keepAlive?: boolean;
    retry: RetryConfig;
    proxy?: false | HttpProxyConfig;
}
//# sourceMappingURL=types.d.ts.map