// src/core/http/RetryHandler.ts

import type { RetryConfig } from './types';
import type { Logger } from '../../observability/Logger';
import type { CircuitBreaker } from './CircuitBreaker';

export class RetryHandler {
  constructor(
    private config: RetryConfig,
    private logger: Logger,
    private circuitBreaker?: CircuitBreaker
  ) {}

  async execute<T>(task: () => Promise<T>, provider: string): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      // Check circuit breaker before each retry attempt (not just first attempt)
      if (attempt > 0 && this.circuitBreaker && !this.circuitBreaker.canExecute(provider)) {
        this.logger.warn('Circuit breaker open, skipping retry', { provider, attempt });
        throw lastError; // Don't retry if circuit is open
      }

      try {
        return await task();
      } catch (error: any) {
        lastError = error;

        const status = error.response?.status;
        const isRetryable = this.config.retryableStatusCodes.includes(status);

        if (!isRetryable || attempt === this.config.maxRetries) {
          throw error;
        }

        // Check for Retry-After header (seconds or HTTP date)
        let delay: number;
        const retryAfter = error.response?.headers?.['retry-after'];

        if (retryAfter) {
          // Parse Retry-After header
          const retryAfterNum = parseInt(retryAfter, 10);
          if (!isNaN(retryAfterNum)) {
            // Retry-After is in seconds
            delay = retryAfterNum * 1000;
          } else {
            // Retry-After is an HTTP date, calculate difference
            const retryDate = new Date(retryAfter);
            delay = Math.max(0, retryDate.getTime() - Date.now());
          }

          this.logger.warn('Retrying with Retry-After', {
            provider,
            attempt: attempt + 1,
            delay,
            status,
            retryAfter,
          });
        } else {
          // Use exponential backoff with jitter
          delay = Math.min(
            this.config.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
            this.config.maxDelay
          );

          this.logger.warn('Retrying request', {
            provider,
            attempt: attempt + 1,
            delay,
            status,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}
