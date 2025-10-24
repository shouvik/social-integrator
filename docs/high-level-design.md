# OAuth Data Connector SDK - High-Level Design (HLD)
**Version:** 1.1  
**Date:** October 2025  
**Based on:** PRD v1.2

---

## Version 1.1 Updates

**Critical Fixes Applied:**
1. Token lifecycle corrected to support auto-refresh of expired tokens
2. Distributed refresh locking via Redis to prevent concurrent refresh storms
3. ETag-based conditional requests properly implemented
4. Rate limiting fixed to enforce provider QPS limits
5. All timestamps standardized to ISO 8601 strings

**Implementation Status:** Design review complete. All blockers resolved. See LLD v1.1 Section 0 for detailed implementation notes.

---

## 1. Executive Summary

The OAuth Data Connector SDK is a TypeScript-based unified platform for managing OAuth flows, token lifecycle, rate-limited API calls, and normalized data retrieval across multiple providers (Google, GitHub, Reddit, X/Twitter, RSS). 

**Key Design Principles:**
- **Consolidation over Duplication**: Single AuthCore, HttpCore, and TokenStore
- **Plugin Architecture**: Provider-specific logic in isolated connectors
- **Security First**: Centralized token management with encryption
- **Observability**: Comprehensive metrics and tracing
- **Cloud Native**: Docker-ready, horizontally scalable

---

## 2. System Architecture

### 2.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Application Layer                            │
│  (Consumer Apps: AI Agents, Dashboards, Backends)                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    OAuth Connector SDK (Package)                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │                        SDK Manager                              │ │
│ │  - Initialization & Configuration                               │ │
│ │  - Connector Registry                                          │ │
│ │  - Public API Surface                                          │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │                      Core Layer                               │    │
│ │ ┌──────────────┬──────────────┬──────────────┬─────────────┐ │    │
│ │ │  AuthCore    │  HttpCore    │ TokenStore   │ Normalizer  │ │    │
│ │ │              │              │              │             │ │    │
│ │ │ • OAuth2/    │ • Axios      │ • Keyv       │ • Schema    │ │    │
│ │ │   OIDC       │ • p-queue    │ • Encryption │   Mapping   │ │    │
│ │ │ • PKCE       │ • Retry      │ • Multi-     │ • Validator │ │    │
│ │ │ • Device     │ • Rate Limit │   backend    │             │ │    │
│ │ │   Code       │ • Telemetry  │ • Events     │             │ │    │
│ │ │ • OAuth1.0a  │              │              │             │ │    │
│ │ └──────────────┴──────────────┴──────────────┴─────────────┘ │    │
│ └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │                    Provider Layer                             │    │
│ │ ┌────────────┬────────────┬────────────┬────────────────────┐│    │
│ │ │  Google    │  GitHub    │  Reddit    │  X/Twitter   RSS   ││    │
│ │ │  Connector │ Connector  │ Connector  │  Connectors        ││    │
│ │ └────────────┴────────────┴────────────┴────────────────────┘│    │
│ └──────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    External Dependencies                             │
│  ┌──────────────┬──────────────┬──────────────────────────────┐    │
│  │ Token Store  │   Metrics    │    Provider APIs              │    │
│  │              │   System     │                               │    │
│  │ • Redis      │              │ • GitHub API                  │    │
│  │ • Postgres   │ • Prometheus │ • Google APIs                 │    │
│  │ • Memory     │ • OpenTelemetry│ • Reddit API                │    │
│  │              │              │ • Twitter API                 │    │
│  └──────────────┴──────────────┴──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Core Components

#### 2.2.1 AuthCore
**Responsibility:** Unified OAuth flow management

- **OAuth 2.0 / OIDC Support**
  - Authorization Code + PKCE
  - Client Credentials
  - Device Code Flow
  - Refresh token handling
- **OAuth 1.0a Support** (for legacy Twitter)
- **Token Lifecycle Management**
  - Automatic refresh before expiry
  - Concurrent refresh deduplication
  - Token rotation
- **Provider Configuration**
  - Client credentials management
  - Scopes per provider
  - Redirect URI handling

**Technology:**
- `openid-client` - OAuth2/OIDC
- Custom OAuth1.0a signer module
- `jose` - JWT validation

#### 2.2.2 HttpCore
**Responsibility:** Centralized HTTP communication with quality-of-service features

- **Request Handling**
  - Axios-based HTTP client
  - Automatic authentication headers
  - Request/response interceptors
- **Rate Limiting**
  - Per-provider rate buckets
  - Concurrent request limiting via `p-queue`
  - Adaptive backoff
- **Resilience**
  - Exponential retry with jitter
  - Circuit breaker pattern
  - 429/5xx automatic retry
- **Optimization**
  - HTTP keep-alive
  - ETag/If-None-Match support
  - Request compression
- **Observability**
  - Request ID propagation
  - Latency tracking
  - Error categorization

**Technology:**
- `axios` - HTTP client
- `p-queue` - Concurrency control
- `axios-retry` - Retry logic
- Custom rate limiter

#### 2.2.3 TokenStore
**Responsibility:** Secure, persistent token storage abstraction

- **Storage Operations**
  - CRUD for token sets (access, refresh, metadata)
  - Multi-user, multi-provider indexing
  - TTL management
- **Security**
  - At-rest encryption (AES-256-GCM)
  - Key rotation support
  - Token masking in logs
- **Events**
  - `tokenRefreshed`
  - `tokenExpiredSoon`
  - `tokenDeleted`
- **Backend Support**
  - Memory (development)
  - Redis (production cache)
  - PostgreSQL (production persistence)

**Technology:**
- `keyv` - Storage abstraction
- `@keyv/redis`, `@keyv/postgres` - Backends
- `crypto` (Node.js) - Encryption

#### 2.2.4 Normalizer
**Responsibility:** Transform provider-specific responses to unified schema

- **Schema Mapping**
  - Provider → NormalizedItem
  - Validation using Zod
  - Metadata preservation
- **Data Enrichment**
  - URL construction
  - Timestamp normalization
  - Author extraction

**Technology:**
- `zod` - Schema validation
- Custom transformer registry

### 2.3 Provider Connectors

Each connector implements the `Connector` interface and uses Core components:

```typescript
interface Connector {
  fetch(userId: string, params?: FetchParams): Promise<NormalizedItem[]>;
  connect(userId: string, opts?: ConnectOptions): Promise<string>;
  handleCallback(userId: string, params: URLSearchParams): Promise<TokenSet>;
  disconnect(userId: string): Promise<void>;
}
```

**Provider-Specific Notes:**

| Provider | Primary SDK | Auth Method | Special Features |
|----------|-------------|-------------|------------------|
| Google | REST via HttpCore | OAuth2 + PKCE | Gmail/Calendar APIs |
| GitHub | Octokit (optional) | OAuth2 + PKCE | GraphQL, ETags, pagination |
| Reddit | REST via HttpCore | OAuth2 (script/web) | Rate limit headers |
| X/Twitter | twitter-api-v2 (optional) | OAuth2 + PKCE / OAuth1.0a | Dual auth support |
| RSS | rss-parser | None | Public feeds |

---

## 3. Deployment Architecture

### 3.1 Containerized Deployment (Docker)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Host / K8s Cluster                 │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Application Container (Node.js)                       │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │  Your App (Express/Fastify/etc.)                 │  │    │
│  │  │  + OAuth Connector SDK                           │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  │  Ports: 3000 (app), 9090 (metrics)                    │    │
│  └────────────────────────────────────────────────────────┘    │
│                          │                                      │
│                          ├────────────────┬───────────────┐     │
│                          ▼                ▼               ▼     │
│  ┌────────────────┐  ┌───────────────┐  ┌──────────────┐      │
│  │ Redis          │  │ PostgreSQL    │  │ Prometheus   │      │
│  │ (Token Cache)  │  │ (Token Store) │  │ (Metrics)    │      │
│  │                │  │               │  │              │      │
│  │ Port: 6379     │  │ Port: 5432    │  │ Port: 9091   │      │
│  └────────────────┘  └───────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Docker Compose Configuration

```yaml
# docker-compose.yml structure
services:
  app:
    - SDK package embedded
    - Environment variables for provider credentials
    - Volume mounts for logs
  
  redis:
    - Token cache (L1)
    - Ephemeral data OK
  
  postgres:
    - Token persistence (L2)
    - Encrypted volume
  
  prometheus:
    - Metrics scraping
    - SDK exposes /metrics endpoint
```

### 3.3 Scalability Considerations

- **Horizontal Scaling**: SDK is stateless; tokens in shared Redis/Postgres
- **Load Balancing**: Sticky sessions NOT required
- **Rate Limiting**: Distributed rate limiter using Redis (if needed)
- **Token Refresh**: Distributed lock to prevent duplicate refreshes

---

## 4. Data Flow Scenarios

### 4.1 Initial OAuth Connection

```
User                App              SDK               AuthCore          Provider
 │                   │                │                    │                │
 │  Connect GitHub   │                │                    │                │
 ├──────────────────>│                │                    │                │
 │                   │ connect()      │                    │                │
 │                   ├───────────────>│                    │                │
 │                   │                │ createAuthURL()    │                │
 │                   │                ├───────────────────>│                │
 │                   │                │ (PKCE code verifier stored)         │
 │                   │                │<───────────────────┤                │
 │<──────────────────┤ auth URL       │                    │                │
 │                   │                │                    │                │
 │  (User clicks, redirected to GitHub)                   │                │
 ├────────────────────────────────────────────────────────────────────────>│
 │                   │                │                    │   Authorize    │
 │<────────────────────────────────────────────────────────────────────────┤
 │  (Redirect back with code)         │                    │                │
 │                   │                │                    │                │
 │  Callback w/code  │                │                    │                │
 ├──────────────────>│ handleCallback()│                   │                │
 │                   ├───────────────>│                    │                │
 │                   │                │ exchangeCode()     │                │
 │                   │                ├───────────────────>│   POST /token  │
 │                   │                │                    ├───────────────>│
 │                   │                │                    │<───────────────┤
 │                   │                │<─────TokenSet──────┤                │
 │                   │                │                    │                │
 │                   │                │  TokenStore.set()  │                │
 │                   │                ├───────────────────>│                │
 │                   │                │  (encrypted save)  │                │
 │<──────────────────┤  Success       │                    │                │
```

### 4.2 Data Fetch with Token Refresh

```
App              SDK             HttpCore        TokenStore      AuthCore       Provider
 │                │                  │               │               │              │
 │ fetch()        │                  │               │               │              │
 ├───────────────>│                  │               │               │              │
 │                │ getToken()       │               │               │              │
 │                ├─────────────────────────────────>│               │              │
 │                │<────────────────────────────Token│               │              │
 │                │ (check expiry)   │               │               │              │
 │                │                  │               │               │              │
 │                │ [if expired]     │               │               │              │
 │                │ refresh()        │               │               │              │
 │                ├─────────────────────────────────────────────────>│              │
 │                │                  │               │  POST /token  │              │
 │                │                  │               │  (refresh_token)             │
 │                │                  │               │               ├─────────────>│
 │                │                  │               │               │<─────────────┤
 │                │                  │               │<─────New Token───────────────┤
 │                │                  │  saveToken()  │               │              │
 │                │                  ├──────────────>│               │              │
 │                │                  │               │               │              │
 │                │ GET /api/resource│               │               │              │
 │                ├─────────────────>│               │               │              │
 │                │                  │  (with fresh token)           │              │
 │                │                  ├───────────────────────────────────────────────>│
 │                │                  │<──────────────────────────────────────────────┤
 │                │<─────────────────┤               │               │              │
 │                │ normalize()      │               │               │              │
 │<───────────────┤                  │               │               │              │
```

---

## 5. Security Architecture

### 5.1 Token Security

**Storage:**
- Tokens encrypted at rest using AES-256-GCM
- Encryption key from environment variable (rotatable)
- Redis: encrypted value storage
- PostgreSQL: encrypted column

**Transport:**
- HTTPS only for all OAuth flows
- TLS 1.2+ for Redis/Postgres connections
- No tokens in URLs or query params

**Lifecycle:**
- Automatic rotation before expiry
- Secure deletion on disconnect
- No plaintext logging (masked)

### 5.2 Secrets Management

```
Environment Variables (Docker secrets / K8s secrets)
├── ENCRYPTION_KEY (32-byte hex)
├── GITHUB_CLIENT_ID
├── GITHUB_CLIENT_SECRET
├── GOOGLE_CLIENT_ID
├── GOOGLE_CLIENT_SECRET
├── REDIS_URL (with auth)
└── POSTGRES_URL (with SSL)
```

### 5.3 OAuth Security

- **PKCE**: Required for all OAuth2 flows (S256 challenge method)
- **State Parameter**: CSRF protection
- **Nonce**: OIDC replay protection
- **Redirect URI Validation**: Strict whitelist
- **Scope Minimization**: Request only necessary permissions

---

## 6. Observability & Monitoring

### 6.1 Metrics (Prometheus Format)

```
# Request metrics
http_requests_total{provider, method, status}
http_request_duration_seconds{provider, endpoint, quantile}

# Rate limiting
rate_limit_hits_total{provider}
rate_limit_queue_size{provider}

# Token operations
token_refresh_total{provider, status}
token_refresh_duration_seconds{provider}

# Errors
sdk_errors_total{provider, error_type}
```

### 6.2 Logging

**Structured JSON Logs:**
```json
{
  "timestamp": "2025-10-21T10:30:00Z",
  "level": "info",
  "requestId": "req_abc123",
  "userId": "user_456",
  "provider": "github",
  "action": "fetch",
  "duration_ms": 245,
  "itemCount": 50
}
```

**Log Levels:**
- ERROR: OAuth failures, API errors, token refresh failures
- WARN: Rate limit hits, retries, token expiry warnings
- INFO: Successful operations, connections, disconnections
- DEBUG: Detailed request/response (sanitized)

### 6.3 Tracing (OpenTelemetry)

Distributed tracing for:
- OAuth flow (connect → callback → token exchange)
- Fetch operations (get token → API call → normalize)
- Token refresh operations

---

## 7. Technology Stack

### 7.1 Core Dependencies

| Category | Library | Version | Purpose |
|----------|---------|---------|---------|
| OAuth | openid-client | ^5.x | OAuth2/OIDC client |
| HTTP | axios | ^1.6.x | HTTP client |
| Concurrency | p-queue | ^8.x | Rate limiting & queue |
| Storage | keyv | ^4.x | Token store abstraction |
| Storage | @keyv/redis | ^2.x | Redis backend |
| Storage | @keyv/postgres | ^2.x | PostgreSQL backend |
| Validation | zod | ^3.x | Schema validation |
| Crypto | jose | ^5.x | JWT handling |
| RSS | rss-parser | ^3.x | Feed parsing |

### 7.2 Optional Provider SDKs

| Provider | SDK | Usage |
|----------|-----|-------|
| GitHub | @octokit/core, @octokit/plugin-retry | Pagination, ETags |
| Reddit | snoowrap | Optional (prefer REST) |
| Twitter | twitter-api-v2 | Endpoint helpers |

### 7.3 Development & Testing

| Category | Tool | Purpose |
|----------|------|---------|
| Runtime | Node.js | v20+ LTS |
| Language | TypeScript | ^5.x |
| Testing | Vitest | Unit tests |
| HTTP Mocking | Nock | API mocking |
| Linting | ESLint | Code quality |
| Formatting | Prettier | Code style |

---

## 8. Configuration Management

### 8.1 SDK Initialization

```typescript
const sdk = ConnectorSDK.init({
  // Token storage
  tokenStore: {
    backend: 'redis',
    url: process.env.REDIS_URL,
    encryption: {
      key: process.env.ENCRYPTION_KEY,
      algorithm: 'aes-256-gcm'
    }
  },
  
  // HTTP configuration
  http: {
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
    keepAlive: true
  },
  
  // Rate limiting (per provider)
  rateLimits: {
    github: { qps: 5000 / 3600, concurrency: 10 },
    google: { qps: 10000 / 60, concurrency: 20 },
    reddit: { qps: 60 / 60, concurrency: 5 },
    x: { qps: 300 / 900, concurrency: 5 }
  },
  
  // Provider credentials
  providers: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      scopes: ['user', 'repo', 'read:org']
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly']
    }
    // ... other providers
  },
  
  // Observability
  metrics: {
    enabled: true,
    port: 9090,
    path: '/metrics'
  },
  
  logging: {
    level: 'info',
    format: 'json'
  }
});
```

---

## 9. Scalability & Performance

### 9.1 Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| OAuth flow completion | < 3s | End-to-end (user click to token stored) |
| Fetch latency (p95) | < 1s | Excluding provider API time |
| Token refresh | < 500ms | Cached provider discovery |
| Concurrent requests | 100+ | Per instance |
| Memory footprint | < 512MB | Base + 100 active users |

### 9.2 Scaling Strategy

**Vertical Scaling:**
- Node.js event loop efficiency
- Connection pooling (Redis/Postgres)
- HTTP keep-alive

**Horizontal Scaling:**
- Stateless SDK instances
- Shared Redis/Postgres
- Distributed rate limiter (Redis-based)

**Caching:**
- OAuth discovery documents (5min TTL)
- Provider metadata (1hr TTL)
- ETag-based API responses (HttpCore)

---

## 10. Error Handling Strategy

### 10.1 Error Categories

1. **OAuth Errors**
   - Invalid credentials → throw `OAuthConfigError`
   - User denial → throw `OAuthDeniedError`
   - Invalid grant → automatic retry or re-auth prompt

2. **API Errors**
   - 4xx client errors → throw `ApiClientError`
   - 5xx server errors → retry → throw `ApiServerError`
   - 429 rate limit → queue → retry → throw `RateLimitError`

3. **Token Errors**
   - Expired + refresh fails → throw `TokenExpiredError` → trigger re-auth
   - Invalid token → revoke → re-auth

4. **Network Errors**
   - Timeout → retry with backoff → throw `NetworkTimeoutError`
   - Connection refused → circuit breaker → throw `NetworkError`

### 10.2 Error Response Format

```typescript
class SDKError extends Error {
  code: string;
  provider?: string;
  userId?: string;
  retryable: boolean;
  details?: Record<string, any>;
}
```

---

## 11. Migration & Versioning

### 11.1 Semantic Versioning

- **Major (1.x → 2.x)**: Breaking API changes
- **Minor (1.1 → 1.2)**: New providers, backward-compatible features
- **Patch (1.1.1 → 1.1.2)**: Bug fixes

### 11.2 Backward Compatibility

- Provider connectors versioned independently
- Core API stable across minor versions
- Deprecation warnings (1 major version ahead)

---

## 12. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Provider API changes | High | Medium | Versioned adapters, contract tests |
| Token store failure | Critical | Low | Redis + Postgres redundancy |
| Rate limit violations | Medium | Medium | Adaptive rate limiting, circuit breaker |
| OAuth spec changes | Medium | Low | Use maintained `openid-client` library |
| Encryption key leak | Critical | Low | Key rotation, access controls, auditing |

---

## 13. Success Criteria (HLD Level)

- ✅ Single codebase supports 5+ providers
- ✅ < 150 LOC per new connector
- ✅ 99.9% OAuth flow success rate
- ✅ < 1% token refresh failures
- ✅ Horizontal scalability validated (10+ instances)
- ✅ Security audit passing (OWASP Top 10)

---

**Next Steps:**
1. Review and approve HLD
2. Proceed to Low-Level Design (LLD) with detailed class diagrams
3. Create implementation roadmap with milestones

**Author:** System Architect  
**Document Version:** 1.0  
**Date:** October 2025

