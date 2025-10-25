import type { OAuth2Config, ConnectOptions } from './types';
import type { ProviderName } from '../normalizer/types';
import type { TokenSet } from '../token/types';
import type { Logger } from '../../observability/Logger';
export declare class AuthCore {
    private config;
    private oauth2Clients;
    private pkceStore;
    private readonly PKCE_TTL;
    private cleanupInterval;
    private logger;
    constructor(config: Record<ProviderName, OAuth2Config>, logger: Logger);
    /**
     * Initialize OAuth2 clients (discover endpoints)
     */
    initialize(): Promise<void>;
    /**
     * Create authorization URL with PKCE
     */
    createAuthUrl(provider: ProviderName, userId: string, opts?: ConnectOptions): string;
    /**
     * Exchange authorization code for tokens
     */
    exchangeCode(provider: ProviderName, code: string, state: string, redirectUri: string): Promise<TokenSet>;
    /**
     * Refresh access token
     */
    refreshToken(provider: ProviderName, refreshToken: string): Promise<TokenSet>;
    /**
     * Revoke token
     */
    revokeToken(provider: ProviderName, token: string): Promise<void>;
    /**
     * Get provider configuration
     * CRITICAL FIX: Allow connectors to access provider config instead of env vars
     */
    getProviderConfig(provider: ProviderName): OAuth2Config;
    private createOAuth2Client;
    private generatePKCE;
    private cleanupExpiredChallenges;
    destroy(): void;
}
//# sourceMappingURL=AuthCore.d.ts.map