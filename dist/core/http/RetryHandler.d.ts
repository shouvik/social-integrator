import type { RetryConfig } from './types';
import type { Logger } from '../../observability/Logger';
import type { CircuitBreaker } from './CircuitBreaker';
export declare class RetryHandler {
    private config;
    private logger;
    private circuitBreaker?;
    constructor(config: RetryConfig, logger: Logger, circuitBreaker?: CircuitBreaker | undefined);
    execute<T>(task: () => Promise<T>, provider: string): Promise<T>;
}
//# sourceMappingURL=RetryHandler.d.ts.map