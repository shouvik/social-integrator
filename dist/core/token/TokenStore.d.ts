import { EventEmitter } from 'events';
import type { TokenSet, TokenStoreConfig } from './types';
import type { ProviderName } from '../normalizer/types';
import type { Logger } from '../../observability/Logger';
export declare class TokenStore extends EventEmitter {
    private configuredProviders?;
    private store;
    private encryption?;
    private logger;
    private preRefreshMarginMinutes;
    private expiredTokenBufferMs;
    constructor(config: TokenStoreConfig, logger: Logger, configuredProviders?: ProviderName[] | undefined);
    /**
     * Get token for user + provider
     * CRITICAL: v1.1 - Added includeExpired option
     */
    getToken(userId: string, provider: ProviderName, opts?: {
        includeExpired?: boolean;
    }): Promise<TokenSet | null>;
    /**
     * Save token
     * CRITICAL: v1.1 FIX #1 - Buffered TTL calculation
     */
    setToken(userId: string, provider: ProviderName, tokenSet: TokenSet, metadata?: Record<string, unknown>): Promise<void>;
    /**
     * Update existing token (for refresh)
     * CRITICAL: v1.1 - Same buffered TTL logic
     */
    updateToken(userId: string, provider: ProviderName, tokenSet: TokenSet): Promise<void>;
    deleteToken(userId: string, provider: ProviderName): Promise<void>;
    listTokens(userId: string): Promise<ProviderName[]>;
    private createKey;
    private getStoredToken;
}
//# sourceMappingURL=TokenStore.d.ts.map