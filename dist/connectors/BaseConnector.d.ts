import type { Connector, FetchParams, CoreDeps } from './types';
import type { ProviderName, NormalizedItem } from '../core/normalizer/types';
import type { TokenSet } from '../core/token/types';
import type { ConnectOptions } from '../core/auth/types';
export declare abstract class BaseConnector implements Connector {
    protected deps: CoreDeps;
    abstract readonly name: ProviderName;
    private refreshLocks;
    protected preRefreshMarginMs: number;
    constructor(deps: CoreDeps);
    /**
     * Default OAuth2 connect implementation
     */
    connect(userId: string, opts?: ConnectOptions): Promise<string>;
    /**
     * Default OAuth2 callback handler
     */
    handleCallback(userId: string, params: URLSearchParams): Promise<TokenSet>;
    /**
     * Default disconnect implementation
     * CRITICAL FIX: Include expired tokens to ensure cleanup
     */
    disconnect(userId: string): Promise<void>;
    abstract fetch(userId: string, params?: FetchParams): Promise<NormalizedItem[]>;
    /**
     * CRITICAL v1.1 FIX #5: Get access token with auto-refresh
     */
    protected getAccessToken(userId: string): Promise<string>;
    /**
     * CRITICAL v1.1 FIX #1: Refresh with deduplication
     */
    private refreshWithDedup;
    /**
     * Execute actual refresh with error handling
     */
    private executeRefresh;
    protected abstract getRedirectUri(): string;
}
//# sourceMappingURL=BaseConnector.d.ts.map