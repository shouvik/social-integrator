import type { ProviderName } from '../normalizer/types';
export interface TokenSet {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    scope?: string;
    tokenType?: string;
    idToken?: string;
}
export interface StoredToken {
    userId: string;
    provider: ProviderName;
    tokenSet: TokenSet;
    createdAt: Date;
    updatedAt: Date;
    metadata?: Record<string, unknown>;
}
export interface TokenStoreConfig {
    backend: 'memory' | 'redis' | 'postgres';
    url?: string;
    encryption?: {
        key: string;
        algorithm: 'aes-256-gcm';
    };
    ttl?: number;
    preRefreshMarginMinutes?: number;
    expiredTokenBufferMinutes?: number;
}
//# sourceMappingURL=types.d.ts.map