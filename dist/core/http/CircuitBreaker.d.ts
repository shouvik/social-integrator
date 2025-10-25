import type { Logger } from '../../observability/Logger';
export declare class CircuitBreaker {
    private logger;
    private failures;
    private lastFailureTime;
    private threshold;
    private resetTimeout;
    constructor(logger: Logger);
    canExecute(provider: string): boolean;
    recordSuccess(provider: string): void;
    recordFailure(provider: string): void;
}
//# sourceMappingURL=CircuitBreaker.d.ts.map