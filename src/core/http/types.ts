// src/core/http/types.ts

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
  cached?: boolean; // True if returned from ETag cache
}

export interface RateLimitConfig {
  qps: number; // Queries per second
  concurrency: number; // Max concurrent requests
  burst?: number; // Burst allowance
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number;
  retryableStatusCodes: number[];
}
