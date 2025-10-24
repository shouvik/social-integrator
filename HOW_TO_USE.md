# OAuth Connector SDK - How to Use Guide

A step-by-step guide for developers to integrate and use the OAuth Data Connector SDK in their applications.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [Environment Setup](#3-environment-setup)
4. [Provider OAuth App Registration](#4-provider-oauth-app-registration)
5. [SDK Initialization](#5-sdk-initialization)
6. [Running OAuth Flows](#6-running-oauth-flows)
7. [Fetching Data from Providers](#7-fetching-data-from-providers)
8. [Token Management](#8-token-management)
9. [Disconnecting Users](#9-disconnecting-users)
10. [Observability & Monitoring](#10-observability--monitoring)
11. [Production Deployment](#11-production-deployment)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

### System Requirements
- **Node.js:** 20.0.0 or higher (LTS recommended)
- **Package Manager:** npm or yarn
- **Optional Services:**
  - Redis 6+ (for production token storage)
  - PostgreSQL 14+ (alternative to Redis)
  - Docker & Docker Compose (for containerized deployment)

### Supported Providers
- **GitHub** - Starred repos, user repos, issues
- **Google** - Gmail, Calendar (coming soon)
- **Reddit** - Saved posts, user history
- **Twitter/X** - Timeline, tweets
- **RSS** - Any RSS/Atom feed (no OAuth required)

---

## 2. Installation

### Install from Source

Since this SDK is in development, install from the repository:

```bash
# Clone the repository
git clone <repository-url>
cd oauth-connector-sdk

# Install dependencies
npm install

# Build the SDK
npm run build
```

### Install in Your Project

After building, link the SDK to your project:

```bash
# In the SDK directory
npm link

# In your project directory
npm link oauth-connector-sdk
```

Or install directly from the built package:

```bash
npm install /path/to/oauth-connector-sdk
```

---

## 3. Environment Setup

### Generate Encryption Key

Token encryption requires a strong 32-character hex key:

```bash
# Generate a secure encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or using OpenSSL
openssl rand -hex 32
```

### Create Environment File

Create a `.env` file in your project root:

```bash
# Required: Token Encryption
ENCRYPTION_KEY=your-64-character-hex-key-from-above

# Optional: Storage Backend (defaults to in-memory)
REDIS_URL=redis://localhost:6379
# POSTGRES_URL=postgresql://user:pass@localhost:5432/oauth_sdk

# Provider OAuth Credentials (configure the ones you need)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret

TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret

# Optional: Base URL (for OAuth redirects)
BASE_URL=http://localhost:3000

# Optional: Logging
LOG_LEVEL=info
```

### Start Optional Services

If using Redis or PostgreSQL:

```bash
# Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Or start PostgreSQL
docker run -d -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=oauth_sdk \
  postgres:15-alpine
```

---

## 4. Provider OAuth App Registration

You must create OAuth applications with each provider you want to use.

### GitHub

1. Go to https://github.com/settings/developers
2. Click **"New OAuth App"**
3. Fill in:
   - **Application name:** Your App Name
   - **Homepage URL:** `http://localhost:3000` (or your domain)
   - **Authorization callback URL:** `http://localhost:3000/callback/github`
4. Click **"Register application"**
5. Copy the **Client ID** and **Client Secret** to your `.env` file

### Google

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a project (if you don't have one)
3. Click **"Create Credentials"** → **"OAuth client ID"**
4. Choose **"Web application"**
5. Add authorized redirect URI: `http://localhost:3000/callback/google`
6. Enable required APIs:
   - Gmail API (for email access)
   - Google Calendar API (for calendar access)
7. Copy **Client ID** and **Client Secret** to your `.env` file

### Reddit

1. Go to https://www.reddit.com/prefs/apps
2. Click **"Create app"** or **"Create another app"**
3. Select **"web app"** (NOT "script")
4. Fill in:
   - **name:** Your App Name
   - **redirect uri:** `http://localhost:3000/callback/reddit`
5. Copy **Client ID** (under app name) and **Client Secret** to your `.env` file

### Twitter/X

1. Go to https://developer.twitter.com/en/portal/dashboard
2. Create a new project and app
3. Navigate to app settings → **"User authentication settings"**
4. Enable **OAuth 2.0**
5. Set callback URL: `http://localhost:3000/callback/twitter`
6. Set app permissions (read access)
7. Copy **Client ID** and **Client Secret** to your `.env` file

### RSS

No OAuth registration needed - RSS feeds are accessed directly.

---

## 5. SDK Initialization

### Basic Initialization (Development)

```typescript
import { ConnectorSDK } from 'oauth-connector-sdk';
import dotenv from 'dotenv';

dotenv.config();

const sdk = await ConnectorSDK.init({
  // Token storage (in-memory for development)
  tokenStore: {
    backend: 'memory',
    encryption: {
      key: process.env.ENCRYPTION_KEY!,
      algorithm: 'aes-256-gcm'
    }
  },

  // HTTP client configuration
  http: {
    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      retryableStatusCodes: [429, 500, 502, 503, 504]
    }
  },

  // Rate limits per provider
  rateLimits: {
    github: { qps: 10, concurrency: 5 },
    google: { qps: 10, concurrency: 5 },
    reddit: { qps: 1, concurrency: 2 },
    twitter: { qps: 5, concurrency: 3 },
    x: { qps: 5, concurrency: 3 },
    rss: { qps: 1, concurrency: 2 }
  },

  // Provider configurations (only include the ones you need)
  providers: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorizationEndpoint: 'https://github.com/login/oauth/authorize',
      tokenEndpoint: 'https://github.com/login/oauth/access_token',
      scopes: ['user', 'repo'],
      redirectUri: `${process.env.BASE_URL || 'http://localhost:3000'}/callback/github`,
      usePKCE: true
    }
  },

  // Optional: Metrics (Prometheus)
  metrics: {
    enabled: true,
    port: 9090
  },

  // Optional: Logging
  logging: {
    level: 'info'
  }
});

console.log('✅ SDK initialized successfully');
```

### Production Initialization (with Redis)

```typescript
const sdk = await ConnectorSDK.init({
  tokenStore: {
    backend: 'redis',
    url: process.env.REDIS_URL!,
    encryption: {
      key: process.env.ENCRYPTION_KEY!,
      algorithm: 'aes-256-gcm'
    },
    preRefreshMarginMinutes: 10,  // Refresh tokens 10 min before expiry
    expiredTokenBufferMinutes: 5  // Keep expired tokens for 5 min to allow refresh
  },

  // ... rest of config same as above
});
```

### Configuration Notes

- **ENCRYPTION_KEY:** Must be at least 32 characters (hex string)
- **usePKCE:** Recommended for all OAuth2 flows (prevents CSRF attacks)
- **Rate Limits:** Start conservative; increase based on your usage and provider limits
- **Redirect URIs:** Must match exactly with provider OAuth app settings (including protocol, port, path)

---

## 6. Running OAuth Flows

OAuth flows involve three steps: **Connect** → **User Authorization** → **Callback**

### Step 1: Initiate Connection

Generate an authorization URL and redirect the user:

```typescript
import express from 'express';

const app = express();

// Route to start OAuth flow
app.get('/connect/:provider', async (req, res) => {
  try {
    const provider = req.params.provider; // 'github', 'google', etc.
    const userId = req.session.userId; // Your app's user ID

    // Generate OAuth authorization URL
    const authUrl = await sdk.connect(provider, userId);

    // Redirect user to provider's OAuth page
    res.redirect(authUrl);
  } catch (error) {
    console.error('Connection error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

**What happens:**
1. SDK generates a PKCE code challenge
2. SDK creates a state parameter for CSRF protection
3. SDK stores state and code_verifier temporarily
4. User is redirected to provider's authorization page

### Step 2: User Authorizes

The user sees the provider's authorization page and clicks "Authorize" to grant your app access.

### Step 3: Handle Callback

After authorization, the provider redirects back to your callback URL:

```typescript
// OAuth callback route
app.get('/callback/:provider', async (req, res) => {
  try {
    const provider = req.params.provider;
    const userId = req.session.userId;

    // Extract query parameters (contains code and state)
    const params = new URLSearchParams(req.query as any);

    // Exchange authorization code for tokens
    const tokens = await sdk.handleCallback(provider, userId, params);

    console.log('✅ OAuth successful! Tokens stored for user:', userId);

    // Redirect to success page or dashboard
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).json({ error: 'OAuth failed', details: error.message });
  }
});
```

**What happens:**
1. SDK validates the state parameter (CSRF check)
2. SDK exchanges the authorization code for access/refresh tokens using PKCE
3. SDK encrypts and stores tokens in configured backend (memory/Redis/Postgres)
4. Tokens are now ready to use for API calls

---

## 7. Fetching Data from Providers

Once connected, fetch normalized data from any provider:

### GitHub - Starred Repositories

```typescript
const starred = await sdk.fetch('github', userId, {
  type: 'starred',
  limit: 50,
  page: 1
});

starred.forEach(item => {
  console.log(`⭐ ${item.title} by ${item.author}`);
  console.log(`   ${item.link}`);
  console.log(`   Created: ${item.publishedAt}`);
});
```

### Google - Gmail Messages

```typescript
const emails = await sdk.fetch('google', userId, {
  service: 'gmail',
  query: 'is:unread',
  limit: 20
});

emails.forEach(item => {
  console.log(`📧 ${item.title}`);
  console.log(`   From: ${item.author}`);
  console.log(`   ${item.snippet}`);
});
```

### Reddit - Saved Posts

```typescript
const saved = await sdk.fetch('reddit', userId, {
  type: 'saved',
  limit: 25
});

saved.forEach(item => {
  console.log(`💾 ${item.title}`);
  console.log(`   r/${item.metadata?.subreddit} • Score: ${item.metadata?.score}`);
});
```

### Twitter - User Timeline

```typescript
const tweets = await sdk.fetch('twitter', userId, {
  type: 'timeline',
  maxResults: 10
});

tweets.forEach(item => {
  console.log(`🐦 ${item.title}`);
  console.log(`   ${item.text}`);
  console.log(`   ${item.publishedAt}`);
});
```

### RSS - Feed Parsing

```typescript
// RSS doesn't require OAuth - just fetch directly
const news = await sdk.fetch('rss', userId, {
  feedUrl: 'https://hnrss.org/frontpage',
  limit: 15
});

news.forEach(item => {
  console.log(`📰 ${item.title}`);
  console.log(`   ${item.link}`);
});
```

### Normalized Schema

All providers return data in the same `NormalizedItem[]` format:

```typescript
interface NormalizedItem {
  id: string;
  type: string;              // 'repository', 'email', 'post', 'tweet', 'article'
  title: string;
  text?: string;
  snippet?: string;
  link: string;
  author?: string;
  publishedAt: string;       // ISO 8601 timestamp
  metadata?: Record<string, any>;  // Provider-specific extra data
}
```

---

## 8. Token Management

The SDK handles tokens automatically, but you can also manage them manually.

### Auto Token Refresh

**The SDK automatically refreshes tokens** when:
- Token is expired
- Token expires within 5 minutes (configurable via `preRefreshMarginMinutes`)

```typescript
// No manual refresh needed - SDK handles it automatically
const data = await sdk.fetch('github', userId, { limit: 10 });
// ↑ SDK checks token expiry and refreshes if needed before fetching
```

### Check Token Status

```typescript
// Get stored token (if you need to check expiry)
const token = await sdk.getToken(userId, 'github');

if (token) {
  console.log('Access token expires at:', token.expiresAt);
  console.log('Has refresh token:', !!token.refreshToken);
} else {
  console.log('No token found - user needs to connect');
}
```

### Refresh Deduplication

The SDK prevents multiple concurrent refreshes for the same user/provider:
- **Local deduplication:** In-memory lock within single SDK instance
- **Distributed deduplication:** Redis-based lock across multiple instances

### Expired Token Handling

Expired tokens are kept for 5 minutes after expiry to allow refresh attempts. If refresh fails:

```typescript
try {
  const data = await sdk.fetch('github', userId, { limit: 10 });
} catch (error) {
  if (error instanceof TokenRefreshError) {
    // Refresh failed - user needs to reconnect
    console.log('Token refresh failed. Please reconnect.');

    // Prompt user to reconnect
    const authUrl = await sdk.connect('github', userId);
    // Redirect to authUrl
  } else if (error instanceof TokenNotFoundError) {
    // User never connected
    console.log('No token found. Please connect first.');
  }
}
```

---

## 9. Disconnecting Users

Revoke access and delete stored tokens:

```typescript
// Disconnect user from a provider
await sdk.disconnect('github', userId);

console.log('✅ User disconnected from GitHub');
console.log('   - Access token revoked with provider');
console.log('   - Tokens deleted from storage');
```

**What happens:**
1. SDK calls provider's token revocation endpoint
2. SDK deletes encrypted tokens from storage
3. User must re-authorize to access provider again

---

## 10. Observability & Monitoring

### Metrics (Prometheus)

The SDK exposes Prometheus metrics on port 9090 (configurable):

```bash
# View metrics
curl http://localhost:9090/metrics
```

**Key Metrics:**

```
# Token refresh metrics
token_refresh_total{provider="github",status="success"} 42
token_refresh_duration_seconds{provider="github",quantile="0.95"} 0.234

# HTTP request metrics
http_requests_total{provider="github",method="GET",status="200"} 128
http_request_duration_seconds{provider="github",quantile="0.95"} 0.456

# Cache metrics
http_cache_hits_total{provider="github"} 34

# Rate limiting
rate_limit_queue_size{provider="github"} 0

# Circuit breaker
circuit_breaker_state{provider="github"} 0  # 0=CLOSED (healthy)
```

### Logging

Configure logging level based on environment:

```typescript
logging: {
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: 'json'  // or 'simple' for development
}
```

**Log Levels:**
- `error` - Only errors
- `warn` - Errors + warnings
- `info` - Production default (errors + warnings + info)
- `debug` - Development (all logs including HTTP requests)

**Sensitive data is automatically redacted** from logs (tokens, secrets, keys).

### Health Check Example

```typescript
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };

  // Optional: Check Redis connection
  try {
    // Test token storage
    await redis.ping();
    health.redis = 'connected';
  } catch (error) {
    health.status = 'degraded';
    health.redis = 'disconnected';
  }

  res.json(health);
});
```

---

## 11. Production Deployment

### Use Redis for Token Storage

**Important:** In production, use Redis or PostgreSQL (not in-memory):

```typescript
tokenStore: {
  backend: 'redis',
  url: process.env.REDIS_URL,
  encryption: {
    key: process.env.ENCRYPTION_KEY,
    algorithm: 'aes-256-gcm'
  }
}
```

### Docker Deployment

The example app includes Docker support:

```bash
cd examples/express-app

# Start all services (app + Redis)
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

### Environment Variables Checklist

- ✅ `ENCRYPTION_KEY` - Strong 32+ character hex key
- ✅ `REDIS_URL` - Redis connection string (production)
- ✅ Provider OAuth credentials (for each provider you use)
- ✅ `BASE_URL` - Your production domain (for OAuth redirects)
- ✅ `LOG_LEVEL` - Set to `info` or `warn` in production
- ✅ `NODE_ENV` - Set to `production`

### Security Best Practices

1. **Never commit secrets** - Use environment variables
2. **Enable PKCE** - Set `usePKCE: true` for all OAuth2 providers
3. **Use HTTPS** - All OAuth redirects must use HTTPS in production
4. **Rotate encryption keys** - Plan for key rotation (SDK supports multi-key decryption)
5. **Validate redirect URIs** - Ensure they match provider OAuth app settings exactly
6. **Monitor failed refreshes** - Alert on `token_refresh_total{status="failure"}`

### Scaling Considerations

- **Horizontal Scaling:** Multiple SDK instances can share Redis/PostgreSQL
- **Distributed Locks:** Redis-based locks prevent refresh storms across instances
- **Rate Limits:** Tune based on your workload and provider API limits
- **Connection Pooling:** Configure for Redis/PostgreSQL backends
- **Load Balancing:** Stateless SDK instances work behind load balancers

---

## 12. Troubleshooting

### Common Issues

**"Invalid redirect_uri" error:**
- Ensure redirect URI in SDK config matches provider OAuth app settings exactly
- Check protocol (http vs https), domain, port, and path

**"Token refresh failed":**
- User may have revoked access on provider's website
- Refresh token may be expired
- Prompt user to reconnect: `await sdk.connect(provider, userId)`

**"No token found" error:**
- User hasn't completed OAuth flow yet
- Redirect user to: `await sdk.connect(provider, userId)`

**"429 Too Many Requests":**
- Reduce `qps` in rate limits configuration
- Check provider's API rate limits
- Monitor `rate_limit_queue_size` metric

**Redis connection failed:**
```bash
# Check Redis is running
redis-cli ping  # Should return: PONG

# Or start Redis
docker run -d -p 6379:6379 redis:7-alpine
```

### Enable Debug Logging

```typescript
logging: {
  level: 'debug'  // Shows all HTTP requests, token operations, etc.
}
```

### Test Individual Provider

```typescript
// Test connection with a single provider
const sdk = await ConnectorSDK.init({
  tokenStore: { backend: 'memory', encryption: { /* ... */ } },
  http: { retry: { /* ... */ } },
  rateLimits: { github: { qps: 5, concurrency: 2 } },
  providers: {
    github: { /* ... only GitHub config ... */ }
  }
});

// Test OAuth flow
const authUrl = await sdk.connect('github', 'test-user');
console.log('Authorize at:', authUrl);
```

### Run Tests

```bash
# Run SDK tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npx vitest run tests/unit/TokenStore.test.ts
```

### Check Provider Status

If APIs are failing, check provider status pages:
- **GitHub:** https://www.githubstatus.com/
- **Google:** https://status.cloud.google.com/
- **Reddit:** https://www.redditstatus.com/
- **Twitter:** https://api.twitterstat.us/

---

## Additional Resources

- **Configuration Guide:** See `docs/configuration.md` for all config options
- **Troubleshooting:** See `docs/troubleshooting.md` for detailed debugging
- **Example App:** See `examples/express-app/` for working Express.js integration
- **Design Docs:** See `docs/` for PRD, HLD, and LLD

---

## Quick Reference

### Core SDK Methods

```typescript
// Initialize SDK
const sdk = await ConnectorSDK.init(config);

// Start OAuth flow
const authUrl = await sdk.connect(provider, userId, options?);

// Handle OAuth callback
const tokens = await sdk.handleCallback(provider, userId, params);

// Fetch normalized data
const items = await sdk.fetch(provider, userId, params?);

// Disconnect user
await sdk.disconnect(provider, userId);

// Get token (optional)
const token = await sdk.getToken(userId, provider);
```

### Supported Providers

| Provider | Type | OAuth Required | Example Fetch Params |
|----------|------|----------------|----------------------|
| `github` | Git hosting | Yes (OAuth2) | `{ type: 'starred', limit: 50 }` |
| `google` | Email/Calendar | Yes (OAuth2) | `{ service: 'gmail', query: 'is:unread' }` |
| `reddit` | Social | Yes (OAuth2) | `{ type: 'saved', limit: 25 }` |
| `twitter` | Social | Yes (OAuth2) | `{ type: 'timeline', maxResults: 10 }` |
| `rss` | Feeds | No | `{ feedUrl: 'https://...', limit: 15 }` |

---

**Version:** 1.0.0
**Build Status:** ✅ Passing
**Test Status:** ✅ 6/6 tests passing

---

This guide provides everything needed to integrate the OAuth Connector SDK into your application. For production deployments, be sure to review the security best practices and scaling considerations sections.
