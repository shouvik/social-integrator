// src/core/http/CircuitBreaker.ts

import type { Logger } from '../../observability/Logger';

export class CircuitBreaker {
  private failures: Map<string, number> = new Map();
  private lastFailureTime: Map<string, number> = new Map();
  private threshold = 5;
  private resetTimeout = 60000; // 1 minute

  constructor(private logger: Logger) {}

  canExecute(provider: string): boolean {
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

  recordSuccess(provider: string): void {
    this.failures.set(provider, 0);
  }

  recordFailure(provider: string): void {
    const current = this.failures.get(provider) || 0;
    this.failures.set(provider, current + 1);
    this.lastFailureTime.set(provider, Date.now());
  }
}
