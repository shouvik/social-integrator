import type { Logger } from '../../observability/Logger';
export declare class DistributedRefreshLock {
    private redis?;
    private ready;
    private connected;
    private lockTTL;
    private logger;
    constructor(redisUrl: string | undefined, logger: Logger);
    /**
     * Get Redis connection status for health checks
     * @returns Object with connection status and mode
     */
    getConnectionStatus(): {
        connected: boolean;
        mode: 'distributed' | 'local-only';
        healthy: boolean;
    };
    /**
     * CRITICAL: Must be called after construction
     */
    initialize(): Promise<void>;
    private ensureConnected;
    tryAcquire(userId: string, provider: string): Promise<boolean>;
    waitForRelease(userId: string, provider: string, timeoutMs?: number): Promise<void>;
    release(userId: string, provider: string): Promise<void>;
    disconnect(): Promise<void>;
}
//# sourceMappingURL=DistributedRefreshLock.d.ts.map