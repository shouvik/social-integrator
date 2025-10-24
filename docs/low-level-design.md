# OAuth Data Connector SDK - Low-Level Design (LLD)
**Version:** 1.1  
**Date:** October 2025  
**Based on:** HLD v1.0, PRD v1.2

---

## Changelog (v1.0 → v1.1)

**Critical Fixes:**
1. **TokenStore TTL:** Fixed calculation to keep expired tokens in store for refresh (minimum 5-minute buffer)
2. **DistributedRefreshLock:** Added async initialization with awaited Redis connection
3. **SDK Constructor:** Fixed dependency ordering to prevent `this.core` reference errors
4. **HttpCore:** Fixed ETag conditional requests and rate limiter queue execution
5. **Token Behavior:** Clarified `getToken()` to return `null` for expired tokens unless `{ includeExpired: true }`

**Status:** All design review blockers resolved. Ready for Phase 1 implementation.

---

## 0. Critical Implementation Notes (v1.1)

### ⚠️ MUST-READ Before Implementation

This section documents critical fixes from design review. **All code examples below reflect v1.1 corrections.**

#### Fix #1: TokenStore TTL Calculation
**Problem:** v1.0 used `Math.max(expiresAt - now, 0) * 1.1` which resulted in TTL=0 for expired tokens, causing immediate deletion.

**Solution:**
```typescript
// CORRECT v1.1 implementation
const bufferMs = (config.expiredTokenBufferMinutes ?? 5) * 60 * 1000;
const ttlMs = tokenSet.expiresAt 
  ? Math.max(tokenSet.expiresAt.getTime() - Date.now() + bufferMs, bufferMs)
  : undefined;
// Expired tokens kept for minimum 5 minutes to allow refresh
```

**Config Required:**
- `expiredTokenBufferMinutes` (default: 5) - Keep expired tokens for refresh

#### Fix #2: DistributedRefreshLock Redis Connection
**Problem:** Redis `connect()` not awaited, causing `ClientClosedError`.

**Solution:**
```typescript
// Constructor stores promise
constructor(redisUrl: string | undefined, logger: Logger) {
  if (redisUrl) {
    this.redis = createClient({ url: redisUrl });
    this.ready = this.redis.connect()
      .then(() => { this.connected = true; })
      .catch(() => { this.redis = undefined; }); // Graceful fallback
  }
}

// MUST call before use
async initialize(): Promise<void> {
  await this.ready;
}

// Guard all operations
private ensureConnected(): boolean {
  return this.redis && this.connected;
}
```

**SDK Initialization:**
```typescript
static async init(config: InitConfig): Promise<ConnectorSDK> {
  const sdk = new ConnectorSDK(config);
  await sdk.core.auth.initialize();
  await sdk.core.refreshLock.initialize(); // CRITICAL: Wait for Redis
  return sdk;
}
```

#### Fix #3: SDK Constructor Dependency Ordering
**Problem:** `this.core` dereferenced before assignment.

**Solution:**
```typescript
private constructor(config: InitConfig) {
  // Build ALL dependencies FIRST
  const logger = new Logger(config.logging);
  const metrics = new MetricsCollector(config.metrics);
  const normalizer = new Normalizer();
  const tokens = new TokenStore(config.tokenStore, logger);
  const auth = new AuthCore(config.providers, logger);
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
```

#### Fix #4: HttpCore ETag & Rate Limiting
**Problem:** ETag cache returned unnormalized data; rate limiter queue never executed requests.

**Solution:**
```typescript
// ETag: Send If-None-Match header
const headers = { ...config.headers };
if (config.etagKey) {
  const cached = this.etagCache.get(config.etagKey);
  if (cached?.etag) headers['If-None-Match'] = cached.etag;
}

// Handle 304 Not Modified
if (axiosResponse.status === 304 && cached) {
  return { ...cached.payload, cached: true }; // Already normalized
}

// Rate limiter: Execute task INSIDE queue
private async runThroughRateLimiter<T>(
  provider: ProviderName,
  skip: boolean | undefined,
  task: () => Promise<T>
): Promise<T> {
  const queue = this.rateLimiters.get(provider);
  if (!queue || skip) return task();
  return queue.add(task); // CRITICAL: Pass task to queue
}
```

#### Fix #5: Token Retrieval Behavior
**Problem:** Unclear when expired tokens returned.

**Solution:**
```typescript
// getToken signature
async getToken(
  userId: string,
  provider: ProviderName,
  opts: { includeExpired?: boolean } = {}
): Promise<TokenSet | null>

// Behavior:
// - Default: Returns null for expired tokens
// - { includeExpired: true }: Returns expired tokens for refresh handling

// BaseConnector usage:
protected async getAccessToken(userId: string): Promise<string> {
  // Request expired tokens explicitly
  let token = await this.deps.tokens.getToken(userId, this.name, { includeExpired: true });
  
  if (!token) throw new TokenNotFoundError();
  
  // Check if refresh needed
  const needsRefresh = token.expiresAt && token.refreshToken && 
    token.expiresAt.getTime() <= Date.now() + this.preRefreshMarginMs;
  
  if (needsRefresh) {
    token = await this.refreshWithDedup(userId, token.refreshToken);
  }
  
  return token.accessToken;
}
```

#### Provider Mapper Updates
**All mappers changed** to return ISO 8601 strings for `publishedAt`:

```typescript
// Before (v1.0)
publishedAt: raw.created_at ? new Date(raw.created_at) : undefined

// After (v1.1)
publishedAt: raw.created_at ? new Date(raw.created_at).toISOString() : undefined
```

**Zod validation:**
```typescript
publishedAt: z.string().datetime().optional() // Validates ISO 8601
```

### Implementation Checklist

Before writing any code, ensure:
- [ ] TokenStore TTL uses `Math.max(time + buffer, buffer)`
- [ ] DistributedRefreshLock awaited in `SDK.init()`
- [ ] SDK constructor builds deps before assigning `this.core`
- [ ] HttpCore rate limiter executes tasks in queue
- [ ] All `publishedAt` fields serialize to ISO 8601 strings
- [ ] Tests cover expired token refresh scenarios

---

## 1. Module Structure

```
oauth-connector-sdk/
├── src/
│   ├── index.ts                      # Public API exports
│   ├── sdk.ts                        # ConnectorSDK main class
│   │
│   ├── core/                         # Core layer
│   │   ├── auth/
│   │   │   ├── AuthCore.ts           # Main OAuth orchestrator
│   │   │   ├── OAuth2Client.ts       # OAuth2/OIDC flows
│   │   │   ├── OAuth1Client.ts       # OAuth1.0a flows
│   │   │   ├── PKCEHelper.ts         # PKCE code generation
│   │   │   └── types.ts              # Auth-related types
│   │   │
│   │   ├── http/
│   │   │   ├── HttpCore.ts           # HTTP client orchestrator
│   │   │   ├── RateLimiter.ts        # Rate limiting logic
│   │   │   ├── RetryHandler.ts       # Retry & backoff
│   │   │   ├── CircuitBreaker.ts     # Circuit breaker pattern
│   │   │   ├── ETagCache.ts          # ETag-based caching
│   │   │   └── types.ts              # HTTP-related types
│   │   │
│   │   ├── token/
│   │   │   ├── TokenStore.ts         # Token storage abstraction
│   │   │   ├── TokenEncryption.ts    # Encryption/decryption
│   │   │   ├── DistributedRefreshLock.ts  # Redis-based refresh lock
│   │   │   ├── TokenEvents.ts        # Event emitter
│   │   │   └── types.ts              # Token-related types
│   │   │
│   │   └── normalizer/
│   │       ├── Normalizer.ts         # Schema normalization
│   │       ├── ProviderMappers.ts    # Per-provider mappers
│   │       ├── Validator.ts          # Zod validation
│   │       └── types.ts              # Normalized schema
│   │
│   ├── connectors/                   # Provider layer
│   │   ├── BaseConnector.ts          # Abstract base class
│   │   ├── google/
│   │   │   ├── GoogleConnector.ts
│   │   │   ├── GmailAdapter.ts
│   │   │   ├── CalendarAdapter.ts
│   │   │   └── types.ts
│   │   ├── github/
│   │   │   ├── GitHubConnector.ts
│   │   │   ├── OctokitAdapter.ts
│   │   │   └── types.ts
│   │   ├── reddit/
│   │   │   ├── RedditConnector.ts
│   │   │   └── types.ts
│   │   ├── twitter/
│   │   │   ├── TwitterConnector.ts
│   │   │   ├── OAuth1Helper.ts
│   │   │   └── types.ts
│   │   └── rss/
│   │       ├── RSSConnector.ts
│   │       └── types.ts
│   │
│   ├── observability/                # Telemetry
│   │   ├── MetricsCollector.ts       # Prometheus metrics
│   │   ├── Logger.ts                 # Structured logging
│   │   ├── Tracer.ts                 # OpenTelemetry tracing
│   │   └── types.ts
│   │
│   ├── config/
│   │   ├── ConfigLoader.ts           # Load & validate config
│   │   ├── ProviderRegistry.ts       # Provider metadata
│   │   └── types.ts
│   │
│   └── utils/
│       ├── errors.ts                 # Custom error classes
│       ├── crypto.ts                 # Cryptographic helpers
│       ├── url.ts                    # URL manipulation
│       └── time.ts                   # Timestamp utilities
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/                     # Nock recordings
│
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## 2. Core Interfaces & Types

### 2.1 Global Types

```typescript
// src/core/normalizer/types.ts

export interface NormalizedItem {
  id: string;                          // Internal UUID
  source: string;                      // 'google', 'github', etc.
  externalId: string;                  // Provider's ID
  userId: string;                      // Our user ID
  title?: string;
  bodyText?: string;
  url?: string;
  author?: string;
  publishedAt?: string;                // ISO 8601 timestamp (CHANGED from Date)
  metadata?: Record<string, unknown>;
}

export type ProviderName = 'google' | 'github' | 'reddit' | 'x' | 'rss';
```

### 2.2 Token Types

```typescript
// src/core/token/types.ts

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
  tokenType?: string;
  idToken?: string;                    // For OIDC
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
  ttl?: number;                           // Default TTL in seconds
  preRefreshMarginMinutes?: number;       // Token refresh before expiry (default: 5)
  expiredTokenBufferMinutes?: number;     // Keep expired tokens for refresh (default: 5)
}
```

### 2.3 HTTP Types

```typescript
// src/core/http/types.ts

export interface HttpRequestConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  timeout?: number;
  etagKey?: ETagKey;
  skipRateLimit?: boolean;
}

export interface ETagKey {
  userId: string;
  provider: ProviderName;
  resource: string;
}

export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
  cached?: boolean;                    // True if returned from ETag cache
}

export interface RateLimitConfig {
  qps: number;                         // Queries per second
  concurrency: number;                 // Max concurrent requests
  burst?: number;                      // Burst allowance
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;                   // milliseconds
  maxDelay: number;
  retryableStatusCodes: number[];
}
```

### 2.4 Auth Types

```typescript
// src/core/auth/types.ts

export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  authorizationEndpoint?: string;      // Override if not discoverable
  tokenEndpoint?: string;
  scopes: string[];
  redirectUri: string;
  usePKCE: boolean;
}

export interface OAuth1Config {
  consumerKey: string;
  consumerSecret: string;
  requestTokenUrl: string;
  authorizeUrl: string;
  accessTokenUrl: string;
  callbackUrl: string;
}

export interface ConnectOptions {
  state?: string;                      // Custom state
  prompt?: string;                     // OIDC prompt param
  loginHint?: string;
  extraParams?: Record<string, string>;
}

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  method: 'S256';
}
```

### 2.5 Connector Interface

```typescript
// src/connectors/BaseConnector.ts

export interface Connector {
  readonly name: ProviderName;
  
  /**
   * Initiate OAuth connection
   * @returns Authorization URL for user redirection
   */
  connect(userId: string, opts?: ConnectOptions): Promise<string>;
  
  /**
   * Handle OAuth callback
   * @param params URL search params from redirect
   * @returns Token set
   */
  handleCallback(userId: string, params: URLSearchParams): Promise<TokenSet>;
  
  /**
   * Fetch normalized data
   */
  fetch(userId: string, params?: FetchParams): Promise<NormalizedItem[]>;
  
  /**
   * Disconnect (revoke token)
   */
  disconnect(userId: string): Promise<void>;
}

export interface FetchParams {
  limit?: number;
  offset?: number;
  since?: Date;
  type?: string;                       // Provider-specific (e.g., 'starred', 'repos')
  [key: string]: unknown;              // Allow provider-specific params
}

export interface CoreDeps {
  auth: AuthCore;
  http: HttpCore;
  tokens: TokenStore;
  normalizer: Normalizer;
  logger: Logger;
  metrics: MetricsCollector;
  refreshLock: DistributedRefreshLock;  // NEW in v1.1
}
```

---

## 3. Core Components - Detailed Design

### 3.1 AuthCore

```typescript
// src/core/auth/AuthCore.ts

import { Issuer, Client, generators } from 'openid-client';
import type { OAuth2Config, OAuth1Config, PKCEChallenge, TokenSet } from './types';

export class AuthCore {
  private oauth2Clients: Map<ProviderName, Client> = new Map();
  private pkceStore: Map<string, PKCEChallenge> = new Map(); // state → challenge
  private oauth1Client: OAuth1Client;
  private logger: Logger;
  
  constructor(
    private config: Record<ProviderName, OAuth2Config | OAuth1Config>,
    logger: Logger
  ) {
    this.logger = logger;
    this.oauth1Client = new OAuth1Client(logger);
  }
  
  /**
   * Initialize OAuth2 clients (discover endpoints)
   */
  async initialize(): Promise<void> {
    for (const [provider, cfg] of Object.entries(this.config)) {
      if (this.isOAuth2Config(cfg)) {
        const client = await this.createOAuth2Client(provider as ProviderName, cfg);
        this.oauth2Clients.set(provider as ProviderName, client);
      }
    }
    this.logger.info('AuthCore initialized', { providers: Array.from(this.oauth2Clients.keys()) });
  }
  
  /**
   * Create authorization URL with PKCE
   */
  createAuthUrl(provider: ProviderName, userId: string, opts?: ConnectOptions): string {
    const client = this.oauth2Clients.get(provider);
    if (!client) throw new Error(`Provider ${provider} not configured`);
    
    const state = opts?.state ?? generators.state();
    const nonce = generators.nonce();
    const pkce = this.generatePKCE();
    
    this.pkceStore.set(state, pkce);
    
    const authUrl = client.authorizationUrl({
      scope: this.config[provider].scopes.join(' '),
      state,
      nonce,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: pkce.method,
      ...opts?.extraParams
    });
    
    this.logger.debug('Created auth URL', { provider, userId, state });
    return authUrl;
  }
  
  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(
    provider: ProviderName,
    code: string,
    state: string,
    redirectUri: string
  ): Promise<TokenSet> {
    const client = this.oauth2Clients.get(provider);
    if (!client) throw new OAuthConfigError(`Provider ${provider} not configured`);
    
    const pkce = this.pkceStore.get(state);
    if (!pkce) throw new OAuthError('Invalid state parameter');
    
    try {
      const tokenSet = await client.oauthCallback(
        redirectUri,
        { code, state },
        { code_verifier: pkce.codeVerifier }
      );
      
      this.pkceStore.delete(state);
      
      return {
        accessToken: tokenSet.access_token!,
        refreshToken: tokenSet.refresh_token,
        expiresAt: tokenSet.expires_at ? new Date(tokenSet.expires_at * 1000) : undefined,
        scope: tokenSet.scope,
        tokenType: tokenSet.token_type,
        idToken: tokenSet.id_token
      };
    } catch (error) {
      this.logger.error('Token exchange failed', { provider, error });
      throw new OAuthError('Failed to exchange authorization code', { cause: error });
    }
  }
  
  /**
   * Refresh access token
   */
  async refreshToken(provider: ProviderName, refreshToken: string): Promise<TokenSet> {
    const client = this.oauth2Clients.get(provider);
    if (!client) throw new OAuthConfigError(`Provider ${provider} not configured`);
    
    try {
      const tokenSet = await client.refresh(refreshToken);
      
      return {
        accessToken: tokenSet.access_token!,
        refreshToken: tokenSet.refresh_token ?? refreshToken, // Some providers don't rotate
        expiresAt: tokenSet.expires_at ? new Date(tokenSet.expires_at * 1000) : undefined,
        scope: tokenSet.scope,
        tokenType: tokenSet.token_type
      };
    } catch (error) {
      this.logger.error('Token refresh failed', { provider, error });
      throw new TokenRefreshError('Failed to refresh token', { cause: error });
    }
  }
  
  /**
   * Revoke token
   */
  async revokeToken(provider: ProviderName, token: string): Promise<void> {
    const client = this.oauth2Clients.get(provider);
    if (!client) return;
    
    try {
      await client.revoke(token);
      this.logger.info('Token revoked', { provider });
    } catch (error) {
      this.logger.warn('Token revocation failed', { provider, error });
      // Non-critical, continue
    }
  }
  
  /**
   * OAuth1.0a flows (delegated)
   */
  async createOAuth1AuthUrl(provider: ProviderName, userId: string): Promise<string> {
    const cfg = this.config[provider] as OAuth1Config;
    return this.oauth1Client.getAuthorizationUrl(cfg);
  }
  
  async exchangeOAuth1Token(
    provider: ProviderName,
    oauthToken: string,
    oauthVerifier: string
  ): Promise<TokenSet> {
    const cfg = this.config[provider] as OAuth1Config;
    return this.oauth1Client.getAccessToken(cfg, oauthToken, oauthVerifier);
  }
  
  // Private helpers
  
  private async createOAuth2Client(provider: ProviderName, cfg: OAuth2Config): Promise<Client> {
    let issuer: Issuer;
    
    // Attempt OIDC discovery or use manual config
    if (provider === 'google') {
      issuer = await Issuer.discover('https://accounts.google.com');
    } else if (cfg.authorizationEndpoint && cfg.tokenEndpoint) {
      issuer = new Issuer({
        issuer: provider,
        authorization_endpoint: cfg.authorizationEndpoint,
        token_endpoint: cfg.tokenEndpoint
      });
    } else {
      throw new OAuthConfigError(`Cannot configure OAuth2 for ${provider}`);
    }
    
    return new issuer.Client({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uris: [cfg.redirectUri],
      response_types: ['code']
    });
  }
  
  private generatePKCE(): PKCEChallenge {
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    return {
      codeVerifier,
      codeChallenge,
      method: 'S256'
    };
  }
  
  private isOAuth2Config(cfg: OAuth2Config | OAuth1Config): cfg is OAuth2Config {
    return 'clientId' in cfg;
  }
}
```

### 3.2 HttpCore

```typescript
// src/core/http/HttpCore.ts

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import PQueue from 'p-queue';
import type { HttpRequestConfig, HttpResponse, RateLimitConfig, RetryConfig } from './types';

export class HttpCore {
  private axiosInstance: AxiosInstance;
  private rateLimiters: Map<ProviderName, PQueue> = new Map();
  private retryHandler: RetryHandler;
  private circuitBreaker: CircuitBreaker;
  private etagCache: ETagCache;
  private metrics: MetricsCollector;
  private logger: Logger;
  
  constructor(
    private rateLimits: Record<ProviderName, RateLimitConfig>,
    private retryConfig: RetryConfig,
    metrics: MetricsCollector,
    logger: Logger
  ) {
    this.metrics = metrics;
    this.logger = logger;
    this.retryHandler = new RetryHandler(retryConfig, logger);
    this.circuitBreaker = new CircuitBreaker(logger);
    this.etagCache = new ETagCache();
    
    this.axiosInstance = axios.create({
      timeout: 30000,
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true })
    });
    
    this.setupInterceptors();
    this.initializeRateLimiters();
  }
  
  /**
   * Execute GET request
   */
  async get<T = unknown>(
    url: string,
    config: Omit<HttpRequestConfig, 'url' | 'method'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: 'GET' });
  }
  
  /**
   * Execute POST request
   */
  async post<T = unknown>(
    url: string,
    body: unknown,
    config?: Omit<HttpRequestConfig, 'url' | 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: 'POST', body });
  }
  
  /**
   * Core request method
   */
  async request<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const provider = this.extractProvider(config.url);
    const requestId = this.generateRequestId();
    
    this.logger.debug('HTTP request', { requestId, provider, url: config.url });
    
    // Check circuit breaker
    if (!this.circuitBreaker.canExecute(provider)) {
      throw new CircuitBreakerOpenError(`Circuit breaker open for ${provider}`);
    }
    
    // Check ETag cache
    if (config.etagKey && config.method === 'GET') {
      const cached = this.etagCache.get(config.etagKey);
      if (cached) {
        this.metrics.incrementCounter('http_cache_hits', { provider });
        return { ...cached, cached: true };
      }
    }
    
    // Rate limit
    const queue = this.rateLimiters.get(provider);
    if (queue && !config.skipRateLimit) {
      await queue.add(async () => {
        // Actual request happens here
      });
    }
    
    // Execute with retry
    try {
      const response = await this.retryHandler.execute(async () => {
        return this.axiosInstance.request<T>({
          url: config.url,
          method: config.method ?? 'GET',
          headers: {
            'X-Request-ID': requestId,
            ...config.headers
          },
          params: config.query,
          data: config.body,
          timeout: config.timeout
        });
      }, provider);
      
      this.circuitBreaker.recordSuccess(provider);
      this.metrics.recordLatency('http_request_duration', Date.now() - startTime, { provider });
      
      const result: HttpResponse<T> = {
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string>
      };
      
      // Cache with ETag
      if (config.etagKey && response.headers.etag) {
        this.etagCache.set(config.etagKey, result, response.headers.etag);
      }
      
      return result;
      
    } catch (error) {
      this.circuitBreaker.recordFailure(provider);
      this.metrics.incrementCounter('http_errors', { provider, status: error.response?.status });
      throw this.transformError(error, provider);
    }
  }
  
  // Private helpers
  
  private setupInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use((config) => {
      config.headers['User-Agent'] = 'oauth-connector-sdk/1.0';
      config.headers['Accept-Encoding'] = 'gzip, deflate';
      return config;
    });
    
    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          if (retryAfter) {
            this.logger.warn('Rate limited', { retryAfter });
          }
        }
        return Promise.reject(error);
      }
    );
  }
  
  private initializeRateLimiters(): void {
    for (const [provider, config] of Object.entries(this.rateLimits)) {
      this.rateLimiters.set(provider as ProviderName, new PQueue({
        intervalCap: Math.ceil(config.qps),
        interval: 1000,
        concurrency: config.concurrency
      }));
    }
  }
  
  private extractProvider(url: string): ProviderName {
    if (url.includes('github.com')) return 'github';
    if (url.includes('googleapis.com')) return 'google';
    if (url.includes('reddit.com')) return 'reddit';
    if (url.includes('twitter.com') || url.includes('api.x.com')) return 'x';
    return 'rss'; // default
  }
  
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
  
  private transformError(error: any, provider: ProviderName): Error {
    if (error.response) {
      const status = error.response.status;
      if (status >= 400 && status < 500) {
        return new ApiClientError(`Client error: ${status}`, { provider, status });
      }
      if (status >= 500) {
        return new ApiServerError(`Server error: ${status}`, { provider, status });
      }
    }
    if (error.code === 'ECONNABORTED') {
      return new NetworkTimeoutError('Request timeout', { provider });
    }
    return new NetworkError('Network error', { provider, cause: error });
  }
}
```

### 3.3 TokenStore

```typescript
// src/core/token/TokenStore.ts

import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import KeyvPostgres from '@keyv/postgres';
import { EventEmitter } from 'events';
import type { TokenSet, StoredToken, TokenStoreConfig } from './types';

export class TokenStore extends EventEmitter {
  private store: Keyv;
  private encryption: TokenEncryption;
  private logger: Logger;
  
  constructor(config: TokenStoreConfig, logger: Logger) {
    super();
    this.logger = logger;
    
    // Initialize backend
    if (config.backend === 'redis') {
      this.store = new Keyv({ store: new KeyvRedis(config.url!) });
    } else if (config.backend === 'postgres') {
      this.store = new Keyv({ store: new KeyvPostgres(config.url!) });
    } else {
      this.store = new Keyv(); // Memory
    }
    
    // Initialize encryption
    if (config.encryption) {
      this.encryption = new TokenEncryption(
        config.encryption.key,
        config.encryption.algorithm
      );
    }
  }
  
  /**
   * Get token for user + provider
   */
  async getToken(userId: string, provider: ProviderName): Promise<TokenSet | null> {
    const key = this.createKey(userId, provider);
    const encrypted = await this.store.get(key);
    
    if (!encrypted) {
      this.logger.debug('Token not found', { userId, provider });
      return null;
    }
    
    const stored: StoredToken = this.encryption
      ? JSON.parse(this.encryption.decrypt(encrypted))
      : encrypted;
    
    // Check expiry
    if (stored.tokenSet.expiresAt && new Date() >= stored.tokenSet.expiresAt) {
      this.logger.warn('Token expired', { userId, provider });
      this.emit('tokenExpired', { userId, provider });
      return null;
    }
    
    // Emit warning if expiring soon (< 5 minutes)
    if (stored.tokenSet.expiresAt) {
      const minutesUntilExpiry = (stored.tokenSet.expiresAt.getTime() - Date.now()) / 60000;
      if (minutesUntilExpiry < 5 && minutesUntilExpiry > 0) {
        this.emit('tokenExpiringSoon', { userId, provider, minutesUntilExpiry });
      }
    }
    
    return stored.tokenSet;
  }
  
  /**
   * Save token
   */
  async setToken(
    userId: string,
    provider: ProviderName,
    tokenSet: TokenSet,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const key = this.createKey(userId, provider);
    const now = new Date();
    
    const stored: StoredToken = {
      userId,
      provider,
      tokenSet,
      createdAt: now,
      updatedAt: now,
      metadata
    };
    
    const toStore = this.encryption
      ? this.encryption.encrypt(JSON.stringify(stored))
      : stored;
    
    await this.store.set(key, toStore, tokenSet.expiresAt?.getTime());
    
    this.logger.info('Token saved', { 
      userId, 
      provider, 
      expiresAt: tokenSet.expiresAt?.toISOString() 
    });
    
    this.emit('tokenSaved', { userId, provider });
  }
  
  /**
   * Update existing token (for refresh)
   */
  async updateToken(
    userId: string,
    provider: ProviderName,
    tokenSet: TokenSet
  ): Promise<void> {
    const existing = await this.getStoredToken(userId, provider);
    if (!existing) {
      throw new TokenNotFoundError(`No token found for ${userId}@${provider}`);
    }
    
    const updated: StoredToken = {
      ...existing,
      tokenSet,
      updatedAt: new Date()
    };
    
    const key = this.createKey(userId, provider);
    const toStore = this.encryption
      ? this.encryption.encrypt(JSON.stringify(updated))
      : updated;
    
    await this.store.set(key, toStore, tokenSet.expiresAt?.getTime());
    
    this.logger.info('Token refreshed', { userId, provider });
    this.emit('tokenRefreshed', { userId, provider });
  }
  
  /**
   * Delete token
   */
  async deleteToken(userId: string, provider: ProviderName): Promise<void> {
    const key = this.createKey(userId, provider);
    await this.store.delete(key);
    
    this.logger.info('Token deleted', { userId, provider });
    this.emit('tokenDeleted', { userId, provider });
  }
  
  /**
   * List all tokens for a user
   */
  async listTokens(userId: string): Promise<ProviderName[]> {
    const providers: ProviderName[] = ['google', 'github', 'reddit', 'x', 'rss'];
    const results: ProviderName[] = [];
    
    for (const provider of providers) {
      const token = await this.getToken(userId, provider);
      if (token) results.push(provider);
    }
    
    return results;
  }
  
  // Private helpers
  
  private createKey(userId: string, provider: ProviderName): string {
    return `token:${userId}:${provider}`;
  }
  
  private async getStoredToken(userId: string, provider: ProviderName): Promise<StoredToken | null> {
    const key = this.createKey(userId, provider);
    const encrypted = await this.store.get(key);
    
    if (!encrypted) return null;
    
    return this.encryption
      ? JSON.parse(this.encryption.decrypt(encrypted))
      : encrypted;
  }
}
```

### 3.4 Normalizer

```typescript
// src/core/normalizer/Normalizer.ts

import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import type { NormalizedItem, ProviderName } from './types';

// Validation schema
const NormalizedItemSchema = z.object({
  id: z.string().uuid(),
  source: z.string(),
  externalId: z.string(),
  userId: z.string(),
  title: z.string().optional(),
  bodyText: z.string().optional(),
  url: z.string().url().optional(),
  author: z.string().optional(),
  publishedAt: z.date().optional(),
  metadata: z.record(z.unknown()).optional()
});

export class Normalizer {
  private mappers: ProviderMappers;
  private validator: Validator;
  
  constructor() {
    this.mappers = new ProviderMappers();
    this.validator = new Validator(NormalizedItemSchema);
  }
  
  /**
   * Normalize provider-specific data
   */
  normalize(
    provider: ProviderName,
    userId: string,
    rawData: unknown[]
  ): NormalizedItem[] {
    const mapper = this.mappers.get(provider);
    if (!mapper) {
      throw new Error(`No mapper found for provider: ${provider}`);
    }
    
    return rawData.map((item) => {
      const normalized = mapper(item, userId);
      this.validator.validate(normalized);
      return normalized;
    });
  }
}

// Provider-specific mappers
export class ProviderMappers {
  private mappers: Map<ProviderName, (raw: any, userId: string) => NormalizedItem>;
  
  constructor() {
    this.mappers = new Map([
      ['github', this.mapGitHub],
      ['google', this.mapGoogle],
      ['reddit', this.mapReddit],
      ['x', this.mapTwitter],
      ['rss', this.mapRSS]
    ]);
  }
  
  get(provider: ProviderName) {
    return this.mappers.get(provider);
  }
  
  // GitHub mapper (starred repos)
  private mapGitHub(raw: any, userId: string): NormalizedItem {
    return {
      id: uuidv4(),
      source: 'github',
      externalId: String(raw.id),
      userId,
      title: raw.name,
      bodyText: raw.description,
      url: raw.html_url,
      author: raw.owner?.login,
      publishedAt: raw.created_at ? new Date(raw.created_at) : undefined,
      metadata: {
        stars: raw.stargazers_count,
        language: raw.language,
        topics: raw.topics
      }
    };
  }
  
  // Google Gmail mapper
  private mapGoogle(raw: any, userId: string): NormalizedItem {
    const headers = raw.payload?.headers || [];
    const getHeader = (name: string) => 
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value;
    
    return {
      id: uuidv4(),
      source: 'google',
      externalId: raw.id,
      userId,
      title: getHeader('Subject'),
      bodyText: raw.snippet,
      url: `https://mail.google.com/mail/u/0/#inbox/${raw.id}`,
      author: getHeader('From'),
      publishedAt: raw.internalDate ? new Date(parseInt(raw.internalDate)) : undefined,
      metadata: {
        labelIds: raw.labelIds,
        threadId: raw.threadId
      }
    };
  }
  
  // Reddit mapper
  private mapReddit(raw: any, userId: string): NormalizedItem {
    const data = raw.data || raw;
    return {
      id: uuidv4(),
      source: 'reddit',
      externalId: data.id,
      userId,
      title: data.title,
      bodyText: data.selftext || data.body,
      url: data.url || `https://reddit.com${data.permalink}`,
      author: data.author,
      publishedAt: data.created_utc ? new Date(data.created_utc * 1000) : undefined,
      metadata: {
        subreddit: data.subreddit,
        score: data.score,
        numComments: data.num_comments
      }
    };
  }
  
  // Twitter/X mapper
  private mapTwitter(raw: any, userId: string): NormalizedItem {
    return {
      id: uuidv4(),
      source: 'x',
      externalId: raw.id_str || raw.id,
      userId,
      title: undefined,
      bodyText: raw.text || raw.full_text,
      url: `https://twitter.com/i/web/status/${raw.id_str || raw.id}`,
      author: raw.user?.screen_name || raw.author_id,
      publishedAt: raw.created_at ? new Date(raw.created_at) : undefined,
      metadata: {
        retweets: raw.retweet_count,
        likes: raw.favorite_count,
        hashtags: raw.entities?.hashtags
      }
    };
  }
  
  // RSS mapper
  private mapRSS(raw: any, userId: string): NormalizedItem {
    return {
      id: uuidv4(),
      source: 'rss',
      externalId: raw.guid || raw.link,
      userId,
      title: raw.title,
      bodyText: raw.contentSnippet || raw.content,
      url: raw.link,
      author: raw.creator || raw.author,
      publishedAt: raw.pubDate ? new Date(raw.pubDate) : undefined,
      metadata: {
        categories: raw.categories,
        feedTitle: raw.feedTitle
      }
    };
  }
}
```

---

## 4. Connector Implementations

### 4.1 Base Connector

```typescript
// src/connectors/BaseConnector.ts

export abstract class BaseConnector implements Connector {
  abstract readonly name: ProviderName;
  
  constructor(protected deps: CoreDeps) {}
  
  /**
   * Default OAuth2 connect implementation
   */
  async connect(userId: string, opts?: ConnectOptions): Promise<string> {
    const authUrl = this.deps.auth.createAuthUrl(this.name, userId, opts);
    this.deps.logger.info('Connect initiated', { provider: this.name, userId });
    return authUrl;
  }
  
  /**
   * Default OAuth2 callback handler
   */
  async handleCallback(userId: string, params: URLSearchParams): Promise<TokenSet> {
    const code = params.get('code');
    const state = params.get('state');
    
    if (!code || !state) {
      throw new OAuthError('Missing code or state parameter');
    }
    
    const tokenSet = await this.deps.auth.exchangeCode(
      this.name,
      code,
      state,
      this.getRedirectUri()
    );
    
    await this.deps.tokens.setToken(userId, this.name, tokenSet);
    
    this.deps.metrics.incrementCounter('connections_total', { provider: this.name });
    return tokenSet;
  }
  
  /**
   * Default disconnect implementation
   */
  async disconnect(userId: string): Promise<void> {
    const token = await this.deps.tokens.getToken(userId, this.name);
    if (token) {
      await this.deps.auth.revokeToken(this.name, token.accessToken);
      await this.deps.tokens.deleteToken(userId, this.name);
    }
    this.deps.logger.info('Disconnected', { provider: this.name, userId });
  }
  
  /**
   * Abstract fetch method (provider-specific)
   */
  abstract fetch(userId: string, params?: FetchParams): Promise<NormalizedItem[]>;
  
  /**
   * Helper: Get access token (with auto-refresh)
   */
  protected async getAccessToken(userId: string): Promise<string> {
    let token = await this.deps.tokens.getToken(userId, this.name);
    
    // Auto-refresh if expired or expiring soon (< 5 min)
    if (token?.expiresAt) {
      const minutesUntilExpiry = (token.expiresAt.getTime() - Date.now()) / 60000;
      if (minutesUntilExpiry < 5) {
        this.deps.logger.info('Auto-refreshing token', { provider: this.name, userId });
        
        if (!token.refreshToken) {
          throw new TokenExpiredError('Token expired and no refresh token available');
        }
        
        const newToken = await this.deps.auth.refreshToken(this.name, token.refreshToken);
        await this.deps.tokens.updateToken(userId, this.name, newToken);
        token = newToken;
      }
    }
    
    if (!token) {
      throw new TokenNotFoundError(`No token found for ${this.name}`);
    }
    
    return token.accessToken;
  }
  
  /**
   * Provider-specific redirect URI
   */
  protected abstract getRedirectUri(): string;
}
```

### 4.2 GitHub Connector Example

```typescript
// src/connectors/github/GitHubConnector.ts

export class GitHubConnector extends BaseConnector {
  readonly name: ProviderName = 'github';
  private octokitAdapter?: OctokitAdapter;
  
  constructor(deps: CoreDeps, useOctokit = false) {
    super(deps);
    if (useOctokit) {
      this.octokitAdapter = new OctokitAdapter(deps);
    }
  }
  
  async fetch(userId: string, params?: GitHubFetchParams): Promise<NormalizedItem[]> {
    const type = params?.type ?? 'starred';
    
    // Use Octokit adapter if available (better pagination)
    if (this.octokitAdapter) {
      return this.octokitAdapter.fetch(userId, type, params);
    }
    
    // Otherwise, use HttpCore directly
    return this.fetchViaREST(userId, type, params);
  }
  
  private async fetchViaREST(
    userId: string,
    type: 'starred' | 'repos',
    params?: GitHubFetchParams
  ): Promise<NormalizedItem[]> {
    const token = await this.getAccessToken(userId);
    const url = type === 'starred'
      ? 'https://api.github.com/user/starred'
      : 'https://api.github.com/user/repos';
    
    const response = await this.deps.http.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      query: {
        per_page: params?.limit ?? 30,
        page: params?.page ?? 1,
        sort: params?.sort ?? 'updated',
        direction: 'desc'
      },
      etagKey: { userId, provider: 'github', resource: type }
    });
    
    // Check for 304 Not Modified
    if (response.cached) {
      this.deps.logger.debug('Returned cached GitHub data', { userId, type });
      return response.data as NormalizedItem[];
    }
    
    return this.deps.normalizer.normalize('github', userId, response.data);
  }
  
  protected getRedirectUri(): string {
    return process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/callback/github';
  }
}

interface GitHubFetchParams extends FetchParams {
  type?: 'starred' | 'repos';
  page?: number;
  sort?: 'created' | 'updated' | 'pushed' | 'full_name';
}
```

### 4.3 Google Connector Example

```typescript
// src/connectors/google/GoogleConnector.ts

export class GoogleConnector extends BaseConnector {
  readonly name: ProviderName = 'google';
  
  async fetch(userId: string, params?: GoogleFetchParams): Promise<NormalizedItem[]> {
    const service = params?.service ?? 'gmail';
    
    if (service === 'gmail') {
      return this.fetchGmail(userId, params);
    } else if (service === 'calendar') {
      return this.fetchCalendar(userId, params);
    }
    
    throw new Error(`Unsupported Google service: ${service}`);
  }
  
  private async fetchGmail(userId: string, params?: GoogleFetchParams): Promise<NormalizedItem[]> {
    const token = await this.getAccessToken(userId);
    
    // First, get message IDs
    const listResponse = await this.deps.http.get(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages',
      {
        headers: { Authorization: `Bearer ${token}` },
        query: {
          maxResults: params?.limit ?? 20,
          q: params?.query ?? 'is:unread'
        }
      }
    );
    
    const messageIds = listResponse.data.messages?.map((m: any) => m.id) || [];
    
    // Fetch full messages in parallel (rate-limited by HttpCore)
    const messages = await Promise.all(
      messageIds.map((id: string) =>
        this.deps.http.get(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          query: { format: 'full' }
        })
      )
    );
    
    const rawMessages = messages.map((r) => r.data);
    return this.deps.normalizer.normalize('google', userId, rawMessages);
  }
  
  private async fetchCalendar(userId: string, params?: GoogleFetchParams): Promise<NormalizedItem[]> {
    const token = await this.getAccessToken(userId);
    
    const response = await this.deps.http.get(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        headers: { Authorization: `Bearer ${token}` },
        query: {
          maxResults: params?.limit ?? 20,
          singleEvents: true,
          orderBy: 'startTime',
          timeMin: params?.since?.toISOString() ?? new Date().toISOString()
        }
      }
    );
    
    return this.deps.normalizer.normalize('google', userId, response.data.items || []);
  }
  
  protected getRedirectUri(): string {
    return process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/callback/google';
  }
}

interface GoogleFetchParams extends FetchParams {
  service?: 'gmail' | 'calendar';
  query?: string;  // Gmail search query
}
```

---

## 5. SDK Manager (Public API)

```typescript
// src/sdk.ts

export class ConnectorSDK {
  private connectors: Map<ProviderName, Connector> = new Map();
  private core: {
    auth: AuthCore;
    http: HttpCore;
    tokens: TokenStore;
    normalizer: Normalizer;
    logger: Logger;
    metrics: MetricsCollector;
  };
  
  private constructor(config: InitConfig) {
    // Initialize core components
    this.core = {
      logger: new Logger(config.logging),
      metrics: new MetricsCollector(config.metrics),
      normalizer: new Normalizer(),
      tokens: new TokenStore(config.tokenStore, this.core.logger),
      auth: new AuthCore(config.providers, this.core.logger),
      http: new HttpCore(config.rateLimits, config.http.retry, this.core.metrics, this.core.logger)
    };
    
    // Register default connectors
    this.registerDefaultConnectors(config);
  }
  
  /**
   * Initialize SDK
   */
  static async init(config: InitConfig): Promise<ConnectorSDK> {
    const sdk = new ConnectorSDK(config);
    await sdk.core.auth.initialize();
    
    sdk.core.logger.info('SDK initialized', {
      providers: Array.from(sdk.connectors.keys())
    });
    
    return sdk;
  }
  
  /**
   * Connect a provider for a user
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
   * Handle OAuth callback
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
   * Fetch data from provider
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
   * Disconnect provider
   */
  async disconnect(provider: ProviderName, userId: string): Promise<void> {
    const connector = this.getConnector(provider);
    await connector.disconnect(userId);
  }
  
  /**
   * Manually refresh token
   */
  async refresh(provider: ProviderName, userId: string): Promise<TokenSet> {
    const token = await this.core.tokens.getToken(userId, provider);
    if (!token?.refreshToken) {
      throw new TokenRefreshError('No refresh token available');
    }
    
    const newToken = await this.core.auth.refreshToken(provider, token.refreshToken);
    await this.core.tokens.updateToken(userId, provider, newToken);
    
    return newToken;
  }
  
  /**
   * Register custom connector
   */
  registerConnector(provider: ProviderName, connector: Connector): void {
    this.connectors.set(provider, connector);
    this.core.logger.info('Connector registered', { provider });
  }
  
  /**
   * Get connector instance
   */
  private getConnector(provider: ProviderName): Connector {
    const connector = this.connectors.get(provider);
    if (!connector) {
      throw new Error(`Provider ${provider} not registered`);
    }
    return connector;
  }
  
  /**
   * Register default connectors
   */
  private registerDefaultConnectors(config: InitConfig): void {
    const deps: CoreDeps = this.core;
    
    if (config.providers.google) {
      this.registerConnector('google', new GoogleConnector(deps));
    }
    if (config.providers.github) {
      this.registerConnector('github', new GitHubConnector(deps, config.useOctokit));
    }
    if (config.providers.reddit) {
      this.registerConnector('reddit', new RedditConnector(deps));
    }
    if (config.providers.x) {
      this.registerConnector('x', new TwitterConnector(deps));
    }
    if (config.providers.rss) {
      this.registerConnector('rss', new RSSConnector(deps));
    }
  }
}

// Public exports
export type { ProviderName, NormalizedItem, TokenSet, FetchParams, ConnectOptions };
export { ConnectorSDK };
```

---

## 6. Error Hierarchy

```typescript
// src/utils/errors.ts

export class SDKError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// OAuth errors
export class OAuthError extends SDKError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'OAUTH_ERROR', details);
  }
}

export class OAuthConfigError extends OAuthError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.code = 'OAUTH_CONFIG_ERROR';
  }
}

export class OAuthDeniedError extends OAuthError {
  constructor(message: string = 'User denied authorization', details?: Record<string, unknown>) {
    super(message, details);
    this.code = 'OAUTH_DENIED';
  }
}

// Token errors
export class TokenError extends SDKError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TOKEN_ERROR', details);
  }
}

export class TokenExpiredError extends TokenError {
  constructor(message: string = 'Token expired', details?: Record<string, unknown>) {
    super(message, details);
    this.code = 'TOKEN_EXPIRED';
  }
}

export class TokenRefreshError extends TokenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.code = 'TOKEN_REFRESH_FAILED';
  }
}

export class TokenNotFoundError extends TokenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.code = 'TOKEN_NOT_FOUND';
  }
}

// API errors
export class ApiError extends SDKError {
  constructor(
    message: string,
    public status: number,
    details?: Record<string, unknown>
  ) {
    super(message, 'API_ERROR', { ...details, status });
  }
}

export class ApiClientError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details?.status as number ?? 400, details);
    this.code = 'API_CLIENT_ERROR';
  }
}

export class ApiServerError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details?.status as number ?? 500, details);
    this.code = 'API_SERVER_ERROR';
  }
}

export class RateLimitError extends ApiError {
  constructor(
    message: string = 'Rate limit exceeded',
    public retryAfter?: number,
    details?: Record<string, unknown>
  ) {
    super(message, 429, { ...details, retryAfter });
    this.code = 'RATE_LIMIT_EXCEEDED';
  }
}

// Network errors
export class NetworkError extends SDKError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'NETWORK_ERROR', details);
  }
}

export class NetworkTimeoutError extends NetworkError {
  constructor(message: string = 'Request timeout', details?: Record<string, unknown>) {
    super(message, details);
    this.code = 'NETWORK_TIMEOUT';
  }
}

export class CircuitBreakerOpenError extends NetworkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.code = 'CIRCUIT_BREAKER_OPEN';
  }
}
```

---

## 7. Configuration Types

```typescript
// src/config/types.ts

export interface InitConfig {
  // Token storage
  tokenStore: TokenStoreConfig;
  
  // HTTP configuration
  http: {
    timeout?: number;
    retry: RetryConfig;
    keepAlive?: boolean;
  };
  
  // Rate limits per provider
  rateLimits: Record<ProviderName, RateLimitConfig>;
  
  // Provider credentials
  providers: Partial<Record<ProviderName, OAuth2Config | OAuth1Config>>;
  
  // Observability
  metrics?: {
    enabled: boolean;
    port?: number;
    path?: string;
  };
  
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'pretty';
  };
  
  // Feature flags
  useOctokit?: boolean;  // Use Octokit for GitHub
}
```

---

## 8. Sequence Diagrams

### 8.1 OAuth Connection Flow

```
User → App: Click "Connect GitHub"
App → SDK: connect('github', userId)
SDK → GitHubConnector: connect(userId)
GitHubConnector → AuthCore: createAuthUrl('github', userId)
AuthCore → AuthCore: Generate PKCE challenge
AuthCore → PKCEStore: Save challenge with state
AuthCore → GitHubConnector: Return auth URL
GitHubConnector → SDK: Return auth URL
SDK → App: Return auth URL
App → User: Redirect to auth URL

User → GitHub: Authorize app
GitHub → App: Redirect with code + state
App → SDK: handleCallback('github', userId, params)
SDK → GitHubConnector: handleCallback(userId, params)
GitHubConnector → AuthCore: exchangeCode('github', code, state)
AuthCore → PKCEStore: Retrieve challenge for state
AuthCore → GitHub: POST /token (code + verifier)
GitHub → AuthCore: Return token set
AuthCore → GitHubConnector: Return token set
GitHubConnector → TokenStore: setToken(userId, 'github', tokenSet)
TokenStore → TokenEncryption: Encrypt token
TokenEncryption → Redis/Postgres: Save encrypted token
TokenStore → GitHubConnector: Success
GitHubConnector → SDK: Return token set
SDK → App: Connection successful
```

### 8.2 Data Fetch with Auto-Refresh

```
App → SDK: fetch('github', userId)
SDK → GitHubConnector: fetch(userId)
GitHubConnector → GitHubConnector: getAccessToken(userId)
GitHubConnector → TokenStore: getToken(userId, 'github')
TokenStore → Redis/Postgres: Retrieve encrypted token
Redis/Postgres → TokenStore: Encrypted token
TokenStore → TokenEncryption: Decrypt token
TokenEncryption → TokenStore: Decrypted token set
TokenStore → GitHubConnector: Token set
GitHubConnector → GitHubConnector: Check expiry (< 5 min?)
GitHubConnector → AuthCore: refreshToken('github', refreshToken)
AuthCore → GitHub: POST /token (refresh_token)
GitHub → AuthCore: New token set
AuthCore → GitHubConnector: New token set
GitHubConnector → TokenStore: updateToken(userId, 'github', newTokenSet)
TokenStore → Redis/Postgres: Save updated token
GitHubConnector → HttpCore: get(url, { headers: { Authorization } })
HttpCore → RateLimiter: Check rate limit
RateLimiter → HttpCore: Proceed
HttpCore → GitHub API: GET /user/starred
GitHub API → HttpCore: Response (starred repos)
HttpCore → GitHubConnector: Raw data
GitHubConnector → Normalizer: normalize('github', userId, rawData)
Normalizer → GitHubConnector: NormalizedItem[]
GitHubConnector → SDK: NormalizedItem[]
SDK → App: NormalizedItem[]
```

---

## 9. Database Schema (PostgreSQL Token Store)

```sql
-- Token storage table
CREATE TABLE oauth_tokens (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  encrypted_token_set TEXT NOT NULL,  -- AES-256-GCM encrypted JSON
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  
  UNIQUE(user_id, provider),
  INDEX idx_user_provider (user_id, provider),
  INDEX idx_expires_at (expires_at)
);

-- Audit log (optional)
CREATE TABLE oauth_audit_log (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,  -- 'connected', 'refreshed', 'disconnected'
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB,
  
  INDEX idx_user_audit (user_id, timestamp),
  INDEX idx_provider_audit (provider, timestamp)
);
```

---

## 10. Testing Strategy

### 10.1 Unit Tests

```typescript
// tests/unit/core/auth/AuthCore.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthCore } from '@/core/auth/AuthCore';

describe('AuthCore', () => {
  let authCore: AuthCore;
  
  beforeEach(() => {
    authCore = new AuthCore({
      github: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        authorizationEndpoint: 'https://github.com/login/oauth/authorize',
        tokenEndpoint: 'https://github.com/login/oauth/access_token',
        scopes: ['user', 'repo'],
        redirectUri: 'http://localhost:3000/callback',
        usePKCE: true
      }
    }, mockLogger);
    
    await authCore.initialize();
  });
  
  it('should generate PKCE challenge', () => {
    const authUrl = authCore.createAuthUrl('github', 'user123');
    expect(authUrl).toContain('code_challenge=');
    expect(authUrl).toContain('code_challenge_method=S256');
  });
  
  it('should exchange code for tokens', async () => {
    // Mock OAuth2 client
    const tokenSet = await authCore.exchangeCode('github', 'test-code', 'test-state', redirectUri);
    expect(tokenSet.accessToken).toBeDefined();
  });
  
  it('should refresh expired token', async () => {
    const newToken = await authCore.refreshToken('github', 'refresh-token-123');
    expect(newToken.accessToken).toBeDefined();
  });
});
```

### 10.2 Integration Tests (with Nock)

```typescript
// tests/integration/connectors/GitHubConnector.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { GitHubConnector } from '@/connectors/github/GitHubConnector';

describe('GitHubConnector Integration', () => {
  beforeEach(() => {
    // Mock GitHub API
    nock('https://api.github.com')
      .get('/user/starred')
      .query({ per_page: 30, page: 1, sort: 'updated', direction: 'desc' })
      .reply(200, [
        {
          id: 123456,
          name: 'awesome-repo',
          description: 'An awesome repository',
          html_url: 'https://github.com/user/awesome-repo',
          owner: { login: 'user' },
          created_at: '2025-01-01T00:00:00Z',
          stargazers_count: 1000,
          language: 'TypeScript'
        }
      ]);
  });
  
  afterEach(() => {
    nock.cleanAll();
  });
  
  it('should fetch and normalize starred repos', async () => {
    const connector = new GitHubConnector(mockCoreDeps);
    const items = await connector.fetch('user123', { type: 'starred' });
    
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('github');
    expect(items[0].title).toBe('awesome-repo');
    expect(items[0].metadata.stars).toBe(1000);
  });
});
```

---

## 11. Docker Configuration

### 11.1 Dockerfile

```dockerfile
# Multi-stage build for SDK application

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose metrics port
EXPOSE 9090

CMD ["node", "dist/index.js"]
```

### 11.2 docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
      - "9090:9090"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - POSTGRES_URL=postgresql://postgres:password@postgres:5432/oauth_sdk
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
      - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
    depends_on:
      - redis
      - postgres
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=oauth_sdk
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9091:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    restart: unless-stopped

volumes:
  redis_data:
  postgres_data:
  prometheus_data:
```

---

## 12. Package.json

```json
{
  "name": "oauth-connector-sdk",
  "version": "1.0.0",
  "description": "Unified OAuth connector SDK for Google, GitHub, Reddit, Twitter, and RSS",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts"
  },
  "dependencies": {
    "openid-client": "^5.6.1",
    "axios": "^1.6.2",
    "p-queue": "^8.0.1",
    "keyv": "^4.5.4",
    "@keyv/redis": "^2.8.0",
    "@keyv/postgres": "^2.1.0",
    "zod": "^3.22.4",
    "jose": "^5.1.3",
    "rss-parser": "^3.13.0",
    "uuid": "^9.0.1",
    "prom-client": "^15.1.0",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.5",
    "typescript": "^5.3.3",
    "vitest": "^1.0.4",
    "nock": "^13.4.0",
    "tsx": "^4.7.0",
    "eslint": "^8.55.0",
    "prettier": "^3.1.1",
    "@octokit/core": "^5.0.2",
    "twitter-api-v2": "^1.15.2"
  },
  "optionalDependencies": {
    "@octokit/core": "^5.0.2",
    "@octokit/plugin-retry": "^6.0.1",
    "twitter-api-v2": "^1.15.2"
  }
}
```

---

## 13. Implementation Checklist

### Phase 1: Core Foundation (v0.1)
- [ ] Project setup (TypeScript, linting, testing)
- [ ] AuthCore implementation (OAuth2 + PKCE)
- [ ] HttpCore implementation (Axios + retries)
- [ ] TokenStore implementation (Memory + Redis)
- [ ] Normalizer implementation
- [ ] Error hierarchy
- [ ] Logger & metrics collector
- [ ] SDK manager class
- [ ] Unit tests for core components

### Phase 2: Initial Providers (v0.1)
- [ ] GoogleConnector (Gmail + Calendar)
- [ ] GitHubConnector (REST + optional Octokit)
- [ ] Integration tests with Nock
- [ ] End-to-end example app

### Phase 3: Additional Providers (v0.2)
- [ ] RedditConnector
- [ ] RSSConnector
- [ ] Device Code flow support (AuthCore)
- [ ] PostgreSQL TokenStore backend

### Phase 4: Twitter & Advanced Features (v0.3)
- [ ] OAuth1.0a client implementation
- [ ] TwitterConnector (OAuth2 + OAuth1)
- [ ] Circuit breaker implementation
- [ ] Advanced rate limiting (Redis-based distributed)

### Phase 5: Production Readiness (v0.4)
- [ ] Docker configuration
- [ ] OpenTelemetry tracing
- [ ] Prometheus metrics endpoint
- [ ] Security audit
- [ ] Performance benchmarks
- [ ] Documentation (API, examples, guides)

### Phase 6: GA Release (v1.0)
- [ ] Plugin marketplace template
- [ ] Browser support (PKCE-only flows)
- [ ] Admin dashboard (token monitoring)
- [ ] Migration guides
- [ ] Production deployment examples

---

**Author:** Technical Lead  
**Document Version:** 1.0  
**Date:** October 2025  
**Status:** Ready for Implementation

