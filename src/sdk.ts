// src/sdk.ts

import type { ProviderName, NormalizedItem } from './core/normalizer/types';
import type { TokenSet, TokenStoreConfig } from './core/token/types';
import type { ConnectOptions, OAuth2Config, OAuth1Config } from './core/auth/types';
import type { FetchParams, Connector, CoreDeps } from './connectors/types';
import type { RetryConfig, RateLimitConfig } from './core/http/types';
import { AuthCore } from './core/auth/AuthCore';
import { HttpCore } from './core/http/HttpCore';
import { TokenStore } from './core/token/TokenStore';
import { Normalizer } from './core/normalizer/Normalizer';
import { Logger, LoggerConfig } from './observability/Logger';
import { MetricsCollector, MetricsConfig } from './observability/MetricsCollector';
import { DistributedRefreshLock } from './core/token/DistributedRefreshLock';
import { GitHubConnector } from './connectors/github/GitHubConnector';
import { GoogleConnector } from './connectors/google/GoogleConnector';
import { RedditConnector } from './connectors/reddit/RedditConnector';
import { RSSConnector } from './connectors/rss/RSSConnector';
import { TwitterConnector } from './connectors/twitter/TwitterConnector';
import { validateConfig } from './config/ConfigValidator';

export interface InitConfig {
  tokenStore: TokenStoreConfig;
  http: {
    timeout?: number;
    retry: RetryConfig;
    keepAlive?: boolean;
  };
  rateLimits: Record<ProviderName, RateLimitConfig>;
  providers: Partial<Record<ProviderName, OAuth2Config | OAuth1Config>>;
  metrics?: MetricsConfig;
  logging?: LoggerConfig;
  useOctokit?: boolean;
}

export class ConnectorSDK {
  private connectors: Map<ProviderName, Connector> = new Map();
  private core: CoreDeps;
  
  /**
   * CRITICAL v1.1 FIX #3: Build dependencies before assigning this.core
   */
  private constructor(config: InitConfig) {
    // Build ALL dependencies FIRST
    const logger = new Logger(config.logging);
    const metrics = new MetricsCollector(config.metrics, logger);
    const normalizer = new Normalizer();
    const tokens = new TokenStore(config.tokenStore, logger);
    const auth = new AuthCore(config.providers as Record<ProviderName, OAuth2Config | OAuth1Config>, logger);
    const http = new HttpCore(config.rateLimits, config.http.retry, metrics, logger);
    const refreshLock = new DistributedRefreshLock(
      config.tokenStore.backend === 'redis' ? config.tokenStore.url : undefined,
      logger
    );
    
    // THEN assign this.core
    this.core = { logger, metrics, normalizer, tokens, auth, http, refreshLock };
    
    // NOW safe to use this.core
    this.registerDefaultConnectors(config);
  }
  
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
  static async init(config: InitConfig): Promise<ConnectorSDK> {
    // Validate configuration (fail-fast with clear errors)
    const validatedConfig = validateConfig(config) as InitConfig;
    
    const sdk = new ConnectorSDK(validatedConfig);
    
    await sdk.core.auth.initialize();
    await sdk.core.refreshLock.initialize(); // CRITICAL: Wait for Redis
    
    sdk.core.logger.info('SDK initialized', {
      providers: Array.from(sdk.connectors.keys())
    });
    
    return sdk;
  }
  
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
  async connect(
    provider: ProviderName,
    userId: string,
    opts?: ConnectOptions
  ): Promise<string> {
    const connector = this.getConnector(provider);
    return connector.connect(userId, opts);
  }
  
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
  async handleCallback(
    provider: ProviderName,
    userId: string,
    params: URLSearchParams
  ): Promise<TokenSet> {
    const connector = this.getConnector(provider);
    return connector.handleCallback(userId, params);
  }
  
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
  async fetch(
    provider: ProviderName,
    userId: string,
    params?: FetchParams
  ): Promise<NormalizedItem[]> {
    const connector = this.getConnector(provider);
    
    const startTime = Date.now();
    try {
      const items = await connector.fetch(userId, params);
      
      this.core.metrics.recordLatency(
        'fetch_duration',
        Date.now() - startTime,
        { provider }
      );
      this.core.metrics.recordGauge('items_fetched', items.length, { provider });
      
      return items;
    } catch (error) {
      this.core.logger.error('Fetch failed', { provider, userId, error });
      throw error;
    }
  }
  
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
  async disconnect(provider: ProviderName, userId: string): Promise<void> {
    const connector = this.getConnector(provider);
    await connector.disconnect(userId);
  }
  
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
  } {
    return {
      distributedLocks: this.core.refreshLock.getConnectionStatus()
    };
  }
  
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
  registerConnector(provider: ProviderName, connector: Connector): void {
    this.connectors.set(provider, connector);
    this.core.logger.info('Connector registered', { provider });
  }
  
  private getConnector(provider: ProviderName): Connector {
    const connector = this.connectors.get(provider);
    if (!connector) {
      throw new Error(`Provider ${provider} not registered`);
    }
    return connector;
  }
  
  private registerDefaultConnectors(config: InitConfig): void {
    const deps: CoreDeps = this.core;
    
    if (config.providers.github) {
      this.registerConnector('github', new GitHubConnector(deps));
    }
    
    if (config.providers.google) {
      this.registerConnector('google', new GoogleConnector(deps));
    }
    
    if (config.providers.reddit) {
      this.registerConnector('reddit', new RedditConnector(deps));
    }
    
    // Register Twitter connector for both 'twitter' and 'x' aliases
    if (config.providers.twitter || config.providers.x) {
      const twitterConnector = new TwitterConnector(deps);
      this.registerConnector('twitter', twitterConnector);
      this.registerConnector('x', twitterConnector); // Alias support
    }
    
    // RSS is always available (no OAuth required)
    this.registerConnector('rss', new RSSConnector(deps));
  }
}

