"use strict";
// src/core/http/RetryHandler.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryHandler = void 0;
class RetryHandler {
    config;
    logger;
    circuitBreaker;
    constructor(config, logger, circuitBreaker) {
        this.config = config;
        this.logger = logger;
        this.circuitBreaker = circuitBreaker;
    }
    async execute(task, provider) {
        let lastError;
        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            // Check circuit breaker before each retry attempt (not just first attempt)
            if (attempt > 0 && this.circuitBreaker && !this.circuitBreaker.canExecute(provider)) {
                this.logger.warn('Circuit breaker open, skipping retry', { provider, attempt });
                throw lastError; // Don't retry if circuit is open
            }
            try {
                return await task();
            }
            catch (error) {
                lastError = error;
                const status = error.response?.status;
                const isRetryable = this.config.retryableStatusCodes.includes(status);
                if (!isRetryable || attempt === this.config.maxRetries) {
                    throw error;
                }
                // Check for Retry-After header (seconds or HTTP date)
                let delay;
                const retryAfter = error.response?.headers?.['retry-after'];
                if (retryAfter) {
                    // Parse Retry-After header
                    const retryAfterNum = parseInt(retryAfter, 10);
                    if (!isNaN(retryAfterNum)) {
                        // Retry-After is in seconds
                        delay = retryAfterNum * 1000;
                    }
                    else {
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
                }
                else {
                    // Use exponential backoff with jitter
                    delay = Math.min(this.config.baseDelay * Math.pow(2, attempt) + Math.random() * 1000, this.config.maxDelay);
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
exports.RetryHandler = RetryHandler;
//# sourceMappingURL=RetryHandler.js.map