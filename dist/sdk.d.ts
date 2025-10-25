import type { ProviderName, NormalizedItem } from './core/normalizer/types';
import type { TokenSet, TokenStoreConfig } from './core/token/types';
import type { ConnectOptions, OAuth2Config } from './core/auth/types';
import type { FetchParams, Connector } from './connectors/types';
import type { HttpCoreConfig, RateLimitConfig } from './core/http/types';
import { LoggerConfig } from './observability/Logger';
import { MetricsConfig } from './observability/MetricsCollector';
export interface InitConfig {
    tokenStore: TokenStoreConfig;
    http: HttpCoreConfig;
    rateLimits: Record<ProviderName, RateLimitConfig>;
    providers: Partial<Record<ProviderName, OAuth2Config>>;
    metrics?: MetricsConfig;
    logging?: LoggerConfig;
    useOctokit?: boolean;
}
export declare class ConnectorSDK {
    private connectors;
    private core;
    /**
     * CRITICAL v1.1 FIX #3: Build dependencies before assigning this.core
     */
    private constructor();
    /**
     * Initialize the OAuth Data Connector SDK
     *
     * CRITICAL: This method must be awaited. It initializes all core components,
     * discovers OAuth endpoints, and establishes Redis connection for distributed locks.
     *
     * @param config - SDK configuration including providers, token store, rate limits
     * @returns Promise that resolves to initialized SDK instance
     * @throws {OAuthConfigError} If provider configuration is invalid or endpoints unreachable
     *
     * @example
     * ```typescript
     * const sdk = await ConnectorSDK.init({
     *   tokenStore: {
     *     backend: 'redis',
     *     url: process.env.REDIS_URL,
     *     encryption: {
     *       key: process.env.ENCRYPTION_KEY,
     *       algorithm: 'aes-256-gcm'
     *     }
     *   },
     *   providers: {
     *     github: {
     *       clientId: process.env.GITHUB_CLIENT_ID,
     *       clientSecret: process.env.GITHUB_CLIENT_SECRET,
     *       scopes: ['user', 'repo'],
     *       redirectUri: 'http://localhost:3000/callback/github',
     *       usePKCE: true
     *     }
     *   },
     *   rateLimits: {
     *     github: { qps: 5000/3600, concurrency: 10 }
     *   },
     *   http: {
     *     retry: {
     *       maxRetries: 3,
     *       baseDelay: 1000,
     *       maxDelay: 10000,
     *       retryableStatusCodes: [429, 500, 502, 503, 504]
     *     }
     *   }
     * });
     * ```
     */
    static init(config: InitConfig): Promise<ConnectorSDK>;
    /**
     * Initiate OAuth connection for a user with a provider
     *
     * Generates an authorization URL with PKCE challenge for the user to visit.
     * After user authorizes, they'll be redirected back with a code to exchange via handleCallback().
     *
     * @param provider - Provider name ('github', 'google', 'reddit', 'twitter', 'rss')
     * @param userId - User identifier (your application's user ID)
     * @param opts - Optional connection parameters (state, prompt, loginHint, etc.)
     * @returns Promise resolving to authorization URL for user redirection
     * @throws {OAuthConfigError} If provider not configured
     *
     * @example
     * ```typescript
     * const authUrl = await sdk.connect('github', 'user123');
     * res.redirect(authUrl);  // Redirect user to GitHub OAuth
     * ```
     */
    connect(provider: ProviderName, userId: string, opts?: ConnectOptions): Promise<string>;
    /**
     * Handle OAuth callback after user authorization
     *
     * Exchanges the authorization code for access and refresh tokens, validates PKCE,
     * and stores the encrypted tokens in the configured backend.
     *
     * @param provider - Provider name that initiated the OAuth flow
     * @param userId - User identifier (same as used in connect())
     * @param params - URL search parameters from OAuth callback (contains code and state)
     * @returns Promise resolving to token set (access + refresh tokens)
     * @throws {OAuthError} If code exchange fails or PKCE validation fails
     *
     * @example
     * ```typescript
     * // In your callback route handler
     * app.get('/callback/:provider', async (req, res) => {
     *   const params = new URLSearchParams(req.query);
     *   await sdk.handleCallback(req.params.provider, req.session.userId, params);
     *   res.redirect('/dashboard');
     * });
     * ```
     */
    handleCallback(provider: ProviderName, userId: string, params: URLSearchParams): Promise<TokenSet>;
    /**
     * Fetch normalized data from a provider
     *
     * Automatically handles token refresh if expired or expiring within 5 minutes.
     * Returns data in consistent NormalizedItem[] format regardless of provider.
     * Supports ETag caching for bandwidth optimization.
     *
     * @param provider - Provider name ('github', 'google', 'reddit', 'twitter', 'rss')
     * @param userId - User identifier
     * @param params - Provider-specific fetch parameters (limit, offset, type, etc.)
     * @returns Promise resolving to array of normalized items
     * @throws {TokenNotFoundError} If no token found for user (need to connect first)
     * @throws {TokenExpiredError} If refresh token invalid (need to re-authenticate)
     * @throws {ApiError} If provider API returns error
     * @throws {RateLimitError} If rate limit exceeded (will retry automatically)
     *
     * @example
     * ```typescript
     * // GitHub: Fetch starred repositories
     * const starred = await sdk.fetch('github', 'user123', {
     *   type: 'starred',
     *   limit: 50,
     *   page: 2
     * });
     *
     * // Google: Fetch Gmail messages
     * const emails = await sdk.fetch('google', 'user123', {
     *   service: 'gmail',
     *   query: 'is:unread',
     *   limit: 20
     * });
     *
     * // All return same schema: NormalizedItem[]
     * starred.forEach(item => {
     *   console.log(item.title, item.author, item.publishedAt);
     * });
     * ```
     */
    fetch(provider: ProviderName, userId: string, params?: FetchParams): Promise<NormalizedItem[]>;
    /**
     * Disconnect a user from a provider
     *
     * Revokes the access token with the provider and deletes stored tokens.
     * User will need to re-authenticate to access this provider again.
     *
     * @param provider - Provider name to disconnect from
     * @param userId - User identifier
     * @returns Promise that resolves when disconnection complete
     *
     * @example
     * ```typescript
     * await sdk.disconnect('github', 'user123');
     * // User's GitHub token revoked and deleted
     * ```
     */
    disconnect(provider: ProviderName, userId: string): Promise<void>;
    /**
     * Get system health status
     *
     * Returns health information about the SDK's infrastructure components,
     * useful for monitoring and health check endpoints.
     *
     * @returns Health status object
     *
     * @example
     * ```typescript
     * const health = sdk.getHealth();
     * console.log('Distributed locks:', health.distributedLocks.mode);
     * console.log('Healthy:', health.distributedLocks.healthy);
     * ```
     */
    getHealth(): {
        distributedLocks: {
            connected: boolean;
            mode: 'distributed' | 'local-only';
            healthy: boolean;
        };
    };
    /**
     * Register a custom connector implementation
     *
     * Allows extending the SDK with custom provider connectors.
     * The connector must implement the Connector interface.
     *
     * @param provider - Provider name to register
     * @param connector - Connector implementation (must extend BaseConnector or implement Connector)
     *
     * @example
     * ```typescript
     * class CustomConnector extends BaseConnector {
     *   readonly name = 'custom';
     *   async fetch(userId, params) {
     *     // Custom implementation
     *   }
     * }
     *
     * sdk.registerConnector('custom', new CustomConnector(sdk.core));
     * ```
     */
    registerConnector(provider: ProviderName, connector: Connector): void;
    private getConnector;
    private registerDefaultConnectors;
}
//# sourceMappingURL=sdk.d.ts.map