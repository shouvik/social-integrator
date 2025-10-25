"use strict";
// src/core/http/CircuitBreaker.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreaker = void 0;
class CircuitBreaker {
    logger;
    failures = new Map();
    lastFailureTime = new Map();
    threshold = 5;
    resetTimeout = 60000; // 1 minute
    constructor(logger) {
        this.logger = logger;
    }
    canExecute(provider) {
        const failures = this.failures.get(provider) || 0;
        const lastFailure = this.lastFailureTime.get(provider) || 0;
        if (failures >= this.threshold) {
            const timeSinceLastFailure = Date.now() - lastFailure;
            if (timeSinceLastFailure < this.resetTimeout) {
                this.logger.warn('Circuit breaker open', { provider, failures });
                return false;
            }
            // Reset after timeout
            this.failures.set(provider, 0);
        }
        return true;
    }
    recordSuccess(provider) {
        this.failures.set(provider, 0);
    }
    recordFailure(provider) {
        const current = this.failures.get(provider) || 0;
        this.failures.set(provider, current + 1);
        this.lastFailureTime.set(provider, Date.now());
    }
}
exports.CircuitBreaker = CircuitBreaker;
//# sourceMappingURL=CircuitBreaker.js.map