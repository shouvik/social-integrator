# OAuth Data Connector SDK

A unified TypeScript SDK for managing OAuth flows, token lifecycle, and normalized data fetching across multiple providers (Google, GitHub, Reddit, X/Twitter, RSS).

## 🚀 Quick Start

### Installation

```bash
npm install
npm run build
```

### Basic Usage

```typescript
import { ConnectorSDK } from './src/index';

// Initialize SDK
const sdk = await ConnectorSDK.init({
  tokenStore: {
    backend: 'memory', // or 'redis', 'postgres'
    encryption: {
      key: process.env.ENCRYPTION_KEY, // 32-byte hex string
      algorithm: 'aes-256-gcm',
    },
    expiredTokenBufferMinutes: 5,
  },
  http: {
    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      retryableStatusCodes: [429, 500, 502, 503, 504],
    },
  },
  rateLimits: {
    github: { qps: 5000 / 3600, concurrency: 10 },
    google: { qps: 10000 / 60, concurrency: 20 },
    reddit: { qps: 60 / 60, concurrency: 5 },
    x: { qps: 300 / 900, concurrency: 5 },
    rss: { qps: 100, concurrency: 10 },
  },
  providers: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorizationEndpoint: 'https://github.com/login/oauth/authorize',
      tokenEndpoint: 'https://github.com/login/oauth/access_token',
      scopes: ['user', 'repo'],
      redirectUri: 'http://localhost:3000/callback/github',
      usePKCE: true,
    },
  },
  metrics: {
    enabled: true,
    port: 9090,
  },
  logging: {
    level: 'info',
    format: 'json',
  },
});

// 1. Connect user (OAuth flow)
const authUrl = await sdk.connect('github', 'user123');
// Redirect user to authUrl

// 2. Handle OAuth callback
const params = new URLSearchParams(callbackUrl.search);
await sdk.handleCallback('github', 'user123', params);

// 3. Fetch data (auto-refreshes expired tokens)
const items = await sdk.fetch('github', 'user123', {
  type: 'starred',
  limit: 50,
});

console.log(items);
// Returns normalized data: NormalizedItem[]
```

## ✨ Features

### Core Capabilities

- ✅ **Single OAuth Engine** - OAuth2/OIDC with PKCE for all providers
- ✅ **Unified Token Management** - Centralized storage with encryption
- ✅ **Auto Token Refresh** - Automatic refresh before expiry
- ✅ **Refresh Deduplication** - Prevents concurrent refresh storms (local + distributed)
- ✅ **Rate Limiting** - Per-provider QPS and concurrency controls
- ✅ **HTTP Caching** - ETag-based conditional requests (cost savings)
- ✅ **Circuit Breaker** - Automatic failure isolation
- ✅ **Normalized Schema** - Consistent data format across all providers
- ✅ **Observability** - Prometheus metrics, structured logging, request tracing

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npx vitest run tests/unit/TokenStore.test.ts
```

## 🏗️ Architecture

```
Core Layer
├── AuthCore     - OAuth2/PKCE + OAuth1.0a flows
├── HttpCore     - Rate limiting, retries, ETag caching
├── TokenStore   - Encrypted storage with auto-refresh
└── Normalizer   - Schema validation and mapping

Provider Layer
├── BaseConnector           - Shared OAuth + refresh logic
├── GitHubConnector        - GitHub API integration
├── GoogleConnector        - Gmail/Calendar APIs
├── RedditConnector        - Reddit API
├── TwitterConnector       - X/Twitter (OAuth2 + OAuth1)
└── RSSConnector           - RSS feed parsing
```

## 📊 Token Lifecycle

1. **Connect** → OAuth URL with PKCE
2. **Callback** → Exchange code for tokens
3. **Store** → Encrypted storage (Redis/Postgres)
4. **Fetch** → Auto-refresh if expiring (< 5 min)
5. **Refresh Dedupe** → Prevent concurrent refreshes
6. **Disconnect** → Revoke and delete tokens

## 🔒 Security

- **PKCE Required** - S256 code challenge for all OAuth2 flows
- **AES-256-GCM Encryption** - Tokens encrypted at rest
- **Log Redaction** - No plaintext tokens in logs
- **Key Rotation** - Multi-key decryption support
- **Distributed Locks** - Prevent refresh storms across instances
- **Circuit Breaker** - Automatic failure isolation

## 📈 Metrics

Access metrics at `http://localhost:9090/metrics`:

```
# Token refresh metrics
token_refresh_total{provider="github",status="success"} 42
token_refresh_duration_seconds{provider="github",status="success",quantile="0.95"} 0.234
token_refresh_dedup_local_total{provider="github"} 15
token_refresh_dedup_distributed_total{provider="github"} 3

# HTTP metrics
http_requests_total{provider="github",method="GET",status="200"} 128
http_request_duration_seconds{provider="github",status="200",quantile="0.95"} 0.456
http_cache_hits_total{provider="github"} 34

# Rate limiting
rate_limit_queue_size{provider="github"} 0
```

## 🔧 Configuration

### Environment Variables

```bash
# Provider Credentials
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URI=http://localhost:3000/callback/github

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Token Encryption
ENCRYPTION_KEY=$(openssl rand -hex 32)  # Generate 32-byte hex key

# Storage
REDIS_URL=redis://localhost:6379
POSTGRES_URL=postgresql://user:pass@localhost:5432/oauth_sdk
```

### Token Store Backends

**Memory** (Development)

```typescript
tokenStore: {
  backend: 'memory';
}
```

**Redis** (Production - Cache)

```typescript
tokenStore: {
  backend: 'redis',
  url: process.env.REDIS_URL,
  encryption: { key: process.env.ENCRYPTION_KEY, algorithm: 'aes-256-gcm' }
}
```

**PostgreSQL** (Production - Persistence)

```typescript
tokenStore: {
  backend: 'postgres',
  url: process.env.POSTGRES_URL,
  encryption: { key: process.env.ENCRYPTION_KEY, algorithm: 'aes-256-gcm' }
}
```

## 📚 Documentation

### Core Documentation

- **[PRD](docs/data-connector-prd.md)** - Product requirements and scope
- **[HLD](docs/high-level-design.md)** - High-level architecture
- **[LLD](docs/low-level-design.md)** - Detailed implementation guide

### Configuration & Setup

- **[Configuration Guide](docs/configuration.md)** - Complete configuration reference with hardening guidance
- **[Provider Matrix](docs/provider-matrix.md)** - OAuth quirks, rate limits, and provider-specific gotchas
- **[Normalized Schema](docs/normalized-schema.md)** - Unified data format across all providers

### Operations & Troubleshooting

- **[Observability](docs/observability.md)** - Prometheus metrics, OpenTelemetry tracing, structured logging
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions
- **[FAQ](docs/faq.md)** - Frequently asked questions

### Security & Releases

- **[Threat Model](docs/threat-model.md)** - Security controls, key rotation, outage posture
- **[RELEASING.md](RELEASING.md)** - Release process and semantic versioning
- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** - Community guidelines

## 🛠️ Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development mode
npm run dev

# Tests
npm test

# Lint
npm run lint

# Format
npm run format
```

## 📦 Project Structure

```
src/
├── core/
│   ├── auth/
│   │   ├── AuthCore.ts          - OAuth2/OIDC client
│   │   └── types.ts
│   ├── http/
│   │   ├── HttpCore.ts          - HTTP with rate limiting
│   │   ├── ETagCache.ts         - Conditional request cache
│   │   ├── RetryHandler.ts      - Exponential backoff
│   │   ├── CircuitBreaker.ts    - Failure isolation
│   │   └── types.ts
│   ├── token/
│   │   ├── TokenStore.ts        - Encrypted token storage
│   │   ├── TokenEncryption.ts   - AES-256-GCM encryption
│   │   ├── DistributedRefreshLock.ts - Redis-based locks
│   │   └── types.ts
│   └── normalizer/
│       ├── Normalizer.ts        - Schema validation
│       ├── ProviderMappers.ts   - Provider-specific mappers
│       └── types.ts
├── connectors/
│   ├── BaseConnector.ts         - Shared OAuth + refresh
│   ├── github/
│   │   └── GitHubConnector.ts
│   └── types.ts
├── observability/
│   ├── Logger.ts                - Structured logging
│   └── MetricsCollector.ts      - Prometheus metrics
├── utils/
│   └── errors.ts                - Error hierarchy
├── sdk.ts                       - Main SDK class
└── index.ts                     - Public exports
```

## 📄 License

MIT

## 🚀 Quick Start Example

```bash
# Run the example app
npm run example

# This will:
# 1. Start Redis in Docker
# 2. Print OAuth URLs for all configured providers
# 3. Instructions for testing OAuth flows

# Start example server
cd examples/express-app && npm run dev
```

Visit the printed URLs to test OAuth flows with your providers.

## 👥 Contributing

We welcome contributions! Please read:

- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** - Community guidelines
- **[RELEASING.md](RELEASING.md)** - Release process
- **[docs/](docs/)** - Design documentation

### Development Workflow

```bash
# Install dependencies
npm ci

# Run tests
npm test

# Run with coverage (85% required)
npm run coverage

# Lint and format
npm run lint
npm run format

# Type check
npm run typecheck

# Build
npm run build
```

### Pre-commit Hooks

We use Husky + lint-staged to run quality checks before commit:

- ESLint fixes
- Prettier formatting
- Related tests

```bash
# Triggers automatically on git commit
git add .
git commit -m "feat: add new feature"
```
