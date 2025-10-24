# OAuth Connector SDK - Configuration Guide

This guide provides comprehensive documentation for all configuration options available in the OAuth Connector SDK.

---

## Table of Contents

1. [InitConfig Overview](#initconfig-overview)
2. [Token Store Configuration](#token-store-configuration)
3. [HTTP Configuration](#http-configuration)
4. [Rate Limits Configuration](#rate-limits-configuration)
5. [Provider Configuration](#provider-configuration)
6. [Metrics Configuration](#metrics-configuration)
7. [Logging Configuration](#logging-configuration)
8. [Environment Variables](#environment-variables)
9. [Examples](#examples)

---

## InitConfig Overview

The `InitConfig` object is passed to `ConnectorSDK.init()` and configures all aspects of the SDK.

```typescript
interface InitConfig {
  tokenStore: TokenStoreConfig;
  http: HttpConfig;
  rateLimits: Record<ProviderName, RateLimitConfig>;
  providers: Partial<Record<ProviderName, OAuth2Config | OAuth1Config>>;
  metrics?: MetricsConfig;
  logging?: LoggerConfig;
  useOctokit?: boolean;
}
```

---

## Token Store Configuration

Controls how and where OAuth tokens are stored.

### TokenStoreConfig

```typescript
interface TokenStoreConfig {
  backend: 'memory' | 'redis' | 'postgres';
  url?: string;
  encryption: {
    key: string;
    algorithm: 'aes-256-gcm' | 'aes-192-gcm' | 'aes-128-gcm';
  };
  preRefreshMarginMinutes?: number;
  expiredTokenBufferMinutes?: number;
}
```

### Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `backend` | string | Yes | - | Storage backend: `memory`, `redis`, or `postgres` |
| `url` | string | Conditional | - | Connection URL (required for redis/postgres) |
| `encryption.key` | string | Yes | - | Encryption key (32+ characters hex string) |
| `encryption.algorithm` | string | Yes | - | AES-GCM variant to use |
| `preRefreshMarginMinutes` | number | No | 5 | Minutes before expiry to trigger refresh |
| `expiredTokenBufferMinutes` | number | No | 5 | Minutes to keep expired tokens for refresh |

### Examples

**Memory (Development):**
```typescript
tokenStore: {
  backend: 'memory',
  encryption: {
    key: process.env.ENCRYPTION_KEY,
    algorithm: 'aes-256-gcm'
  }
}
```

**Redis (Production):**
```typescript
tokenStore: {
  backend: 'redis',
  url: process.env.REDIS_URL, // 'redis://localhost:6379'
  encryption: {
    key: process.env.ENCRYPTION_KEY,
    algorithm: 'aes-256-gcm'
  },
  preRefreshMarginMinutes: 10,
  expiredTokenBufferMinutes: 5
}
```

**PostgreSQL (Enterprise):**
```typescript
tokenStore: {
  backend: 'postgres',
  url: process.env.POSTGRES_URL, // 'postgresql://user:pass@localhost:5432/oauth_sdk'
  encryption: {
    key: process.env.ENCRYPTION_KEY,
    algorithm: 'aes-256-gcm'
  }
}
```

### Security Notes

- **Encryption Key:** Generate with `openssl rand -hex 32`
- **Key Rotation:** Store multiple keys for zero-downtime rotation
- **Never commit keys:** Use environment variables

---

## HTTP Configuration

Controls HTTP client behavior including retries and timeouts.

### HttpConfig

```typescript
interface HttpConfig {
  timeout?: number;
  retry: RetryConfig;
  keepAlive?: boolean;
}

interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}
```

### Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `timeout` | number | No | 30000 | Request timeout in ms |
| `retry.maxAttempts` | number | Yes | - | Maximum retry attempts |
| `retry.baseDelayMs` | number | Yes | - | Initial retry delay in ms |
| `retry.maxDelayMs` | number | Yes | - | Maximum retry delay in ms (cap) |
| `keepAlive` | boolean | No | true | Enable HTTP keep-alive |

### Example

```typescript
http: {
  timeout: 30000,
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000
  },
  keepAlive: true
}
```

### Retry Strategy

- **Exponential Backoff:** `baseDelayMs * (2 ^ attempt)` capped at `maxDelayMs`
- **Jitter:** Random delay to prevent thundering herd
- **Retryable Errors:** 5xx, 429, network timeouts
- **Non-Retryable:** 4xx client errors

---

## Rate Limits Configuration

Per-provider rate limiting to prevent API throttling.

### RateLimitConfig

```typescript
interface RateLimitConfig {
  qps: number;          // Queries per second
  concurrency: number;  // Max concurrent requests
}
```

### Provider Recommendations

```typescript
rateLimits: {
  github: { 
    qps: 10,          // GitHub: 5,000 req/hour = ~1.4/sec (be conservative)
    concurrency: 5 
  },
  google: { 
    qps: 10,          // Google: varies by service, 10/sec is safe
    concurrency: 5 
  },
  reddit: { 
    qps: 1,           // Reddit: 60 req/minute = 1/sec
    concurrency: 2 
  },
  twitter: { 
    qps: 5,           // Twitter: varies by tier, 5/sec is safe
    concurrency: 3 
  },
  rss: { 
    qps: 1,           // RSS: be gentle with origin servers
    concurrency: 2 
  }
}
```

### Tuning Guidelines

- **Start Conservative:** Begin with low limits and increase based on monitoring
- **Monitor Metrics:** Watch `rate_limit_queue_depth` in Grafana
- **Respect Provider Limits:** Stay well below documented API limits
- **Burst Handling:** `concurrency` allows bursts within `qps` average

---

## Provider Configuration

OAuth configuration for each provider.

### OAuth2Config

```typescript
interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  discoveryUrl?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  scopes: string[];
  redirectUri?: string;
  usePKCE?: boolean;
}
```

### Provider-Specific Configurations

**GitHub:**
```typescript
github: {
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  discoveryUrl: 'https://token.actions.githubusercontent.com/.well-known/openid-configuration',
  scopes: ['user', 'repo'],
  redirectUri: 'http://localhost:3000/callback/github',
  usePKCE: true  // Recommended
}
```

**Google:**
```typescript
google: {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
  scopes: [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.readonly'
  ],
  redirectUri: 'http://localhost:3000/callback/google'
}
```

**Reddit:**
```typescript
reddit: {
  clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET,
  discoveryUrl: 'https://www.reddit.com/.well-known/openid-configuration',
  scopes: ['identity', 'read', 'history', 'save'],
  redirectUri: 'http://localhost:3000/callback/reddit'
}
```

**Twitter:**
```typescript
twitter: {
  clientId: process.env.TWITTER_CLIENT_ID,
  clientSecret: process.env.TWITTER_CLIENT_SECRET,
  discoveryUrl: 'https://api.twitter.com/.well-known/openid-configuration',
  scopes: ['tweet.read', 'users.read', 'offline.access'],
  redirectUri: 'http://localhost:3000/callback/twitter'
}
```

**RSS:**
```typescript
// RSS doesn't require OAuth configuration
// Just register in rateLimits
```

### Required Scopes by Feature

| Provider | Feature | Required Scopes |
|----------|---------|----------------|
| GitHub | Starred repos | `user`, `repo` |
| GitHub | User repos | `user`, `repo` |
| Google | Gmail | `gmail.readonly` |
| Google | Calendar | `calendar.readonly` |
| Reddit | Saved posts | `identity`, `read`, `history` |
| Reddit | User posts | `identity`, `read` |
| Twitter | Timeline | `tweet.read`, `users.read` |
| Twitter | Search | `tweet.read` |
| RSS | Any feed | None |

---

## Metrics Configuration

Prometheus metrics collection settings.

### MetricsConfig

```typescript
interface MetricsConfig {
  enabled: boolean;
  port?: number;
}
```

### Example

```typescript
metrics: {
  enabled: true,
  port: 9090  // Prometheus scrape endpoint
}
```

### Available Metrics

- `http_requests_total` - Total HTTP requests (counter)
- `http_request_errors_total` - HTTP errors (counter)
- `http_request_duration` - Request latency (histogram)
- `http_cache_hits` - ETag cache hits (counter)
- `token_refresh_total` - Token refreshes (counter)
- `connections_total` - Active connections (counter)
- `rate_limit_queue_depth` - Queue depth by provider (gauge)
- `circuit_breaker_state` - Circuit breaker state (gauge)

---

## Logging Configuration

Structured logging with Winston.

### LoggerConfig

```typescript
interface LoggerConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format?: 'json' | 'simple';
}
```

### Example

```typescript
logging: {
  level: process.env.LOG_LEVEL || 'info',
  format: 'json'  // JSON for production, 'simple' for development
}
```

### Log Levels

- `error` - Only errors
- `warn` - Errors + warnings
- `info` - Errors + warnings + info (recommended for production)
- `debug` - All logs including debug info (development only)

### Sensitive Data Redaction

The SDK automatically redacts:
- Access tokens
- Refresh tokens
- Client secrets
- Encryption keys

Example log output:
```json
{
  "level": "info",
  "message": "Token refreshed",
  "userId": "user123",
  "provider": "github",
  "token": "[REDACTED]"
}
```

---

## Environment Variables

Recommended environment variables for configuration.

### Required

```bash
# Encryption
ENCRYPTION_KEY=your-32-character-hex-key-here

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-secret

# Google OAuth
GOOGLE_CLIENT_ID=your-google-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-secret

# Reddit OAuth
REDDIT_CLIENT_ID=your-reddit-client-id
REDDIT_CLIENT_SECRET=your-reddit-secret

# Twitter OAuth  
TWITTER_CLIENT_ID=your-twitter-client-id
TWITTER_CLIENT_SECRET=your-twitter-secret
```

### Optional

```bash
# Redis (if using redis backend)
REDIS_URL=redis://localhost:6379

# PostgreSQL (if using postgres backend)
POSTGRES_URL=postgresql://user:pass@localhost:5432/oauth_sdk

# Logging
LOG_LEVEL=info

# Metrics
METRICS_PORT=9090
METRICS_ENABLED=true

# Redirect URIs (defaults to localhost:3000)
GITHUB_REDIRECT_URI=https://yourdomain.com/callback/github
GOOGLE_REDIRECT_URI=https://yourdomain.com/callback/google
REDDIT_REDIRECT_URI=https://yourdomain.com/callback/reddit
TWITTER_REDIRECT_URI=https://yourdomain.com/callback/twitter
```

---

## Examples

### Complete Configuration (Production)

```typescript
import { ConnectorSDK } from 'oauth-connector-sdk';

const sdk = await ConnectorSDK.init({
  // Token Storage (Redis for production)
  tokenStore: {
    backend: 'redis',
    url: process.env.REDIS_URL!,
    encryption: {
      key: process.env.ENCRYPTION_KEY!,
      algorithm: 'aes-256-gcm'
    },
    preRefreshMarginMinutes: 10,
    expiredTokenBufferMinutes: 5
  },

  // HTTP Client
  http: {
    timeout: 30000,
    retry: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000
    },
    keepAlive: true
  },

  // Rate Limiting
  rateLimits: {
    github: { qps: 10, concurrency: 5 },
    google: { qps: 10, concurrency: 5 },
    reddit: { qps: 1, concurrency: 2 },
    twitter: { qps: 5, concurrency: 3 },
    rss: { qps: 1, concurrency: 2 }
  },

  // OAuth Providers
  providers: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      discoveryUrl: 'https://token.actions.githubusercontent.com/.well-known/openid-configuration',
      scopes: ['user', 'repo'],
      usePKCE: true
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
      scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly']
    },
    reddit: {
      clientId: process.env.REDDIT_CLIENT_ID!,
      clientSecret: process.env.REDDIT_CLIENT_SECRET!,
      discoveryUrl: 'https://www.reddit.com/.well-known/openid-configuration',
      scopes: ['identity', 'read', 'history']
    },
    twitter: {
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      discoveryUrl: 'https://api.twitter.com/.well-known/openid-configuration',
      scopes: ['tweet.read', 'users.read', 'offline.access']
    }
  },

  // Observability
  metrics: {
    enabled: true,
    port: 9090
  },

  logging: {
    level: 'info',
    format: 'json'
  }
});
```

### Minimal Configuration (Development)

```typescript
const sdk = await ConnectorSDK.init({
  tokenStore: {
    backend: 'memory',
    encryption: {
      key: 'dev-key-32-characters-minimum!',
      algorithm: 'aes-256-gcm'
    }
  },

  http: {
    retry: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000
    }
  },

  rateLimits: {
    github: { qps: 5, concurrency: 3 },
    google: { qps: 5, concurrency: 3 },
    reddit: { qps: 1, concurrency: 1 },
    twitter: { qps: 3, concurrency: 2 },
    rss: { qps: 1, concurrency: 1 }
  },

  providers: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      discoveryUrl: 'https://token.actions.githubusercontent.com/.well-known/openid-configuration',
      scopes: ['user']
    }
  }
});
```

---

## Best Practices

### Security

1. **Never hardcode secrets** - Use environment variables
2. **Rotate encryption keys** - Plan for key rotation
3. **Use strong keys** - Minimum 32 characters
4. **Enable PKCE** - For OAuth2 flows (prevents CSRF)
5. **Validate redirect URIs** - Match exactly with provider config

### Performance

1. **Use Redis** - For production (distributed, persistent)
2. **Tune rate limits** - Start conservative, increase based on monitoring
3. **Enable caching** - ETag caching is enabled by default
4. **Monitor queue depth** - Watch rate_limit_queue_depth metric
5. **Set appropriate timeouts** - Balance responsiveness vs resilience

### Reliability

1. **Configure retries** - 3 attempts with exponential backoff
2. **Set reasonable timeouts** - 30 seconds default
3. **Monitor circuit breakers** - Watch for OPEN states
4. **Use refresh margins** - 5-10 minutes before expiry
5. **Enable metrics** - Monitor in production

### Scalability

1. **Use Redis or PostgreSQL** - For multi-instance deployments
2. **Enable distributed locks** - Prevent refresh storms
3. **Configure connection pools** - For database backends
4. **Monitor latency** - p95, p99 percentiles
5. **Scale horizontally** - Multiple SDK instances with shared Redis

---

## Configuration Validation

The SDK validates configuration at initialization using Zod schemas.

### Validation Errors

```typescript
try {
  const sdk = await ConnectorSDK.init(config);
} catch (error) {
  if (error instanceof ZodError) {
    console.error('Configuration validation failed:', error.errors);
  }
}
```

### Common Validation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Encryption key must be at least 32 characters` | Short key | Generate with `openssl rand -hex 32` |
| `Invalid backend type` | Wrong backend value | Use `memory`, `redis`, or `postgres` |
| `Missing required field: clientId` | OAuth config incomplete | Add all required OAuth fields |
| `Invalid scope format` | Scopes not array | Provide array of strings |
| `QPS must be positive` | Invalid rate limit | Set qps >= 1 |

---

## Provider Setup Guides

### GitHub

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Set callback URL: `http://localhost:3000/callback/github`
4. Copy Client ID and Secret

### Google

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URI: `http://localhost:3000/callback/google`
4. Enable Gmail API and Calendar API
5. Copy Client ID and Secret

### Reddit

1. Go to https://www.reddit.com/prefs/apps
2. Create app (select "web app")
3. Set redirect URI: `http://localhost:3000/callback/reddit`
4. Copy Client ID and Secret

### Twitter

1. Go to https://developer.twitter.com/en/portal/dashboard
2. Create new project and app
3. Enable OAuth 2.0
4. Set callback URL: `http://localhost:3000/callback/twitter`
5. Copy Client ID and Secret

---

## See Also

- [README.md](../README.md) - Quick start guide
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions
- [Example Application](../examples/express-app/README.md) - Working example
- [Deployment Guide](../README.md#docker-deployment) - Production deployment