# Frequently Asked Questions (FAQ)

## OAuth Issues

### Google: Not receiving refresh tokens

**Problem:** Google only returns short-lived access tokens without refresh tokens.

**Solution:** Add these parameters to authorization URL:

- `access_type=offline` - Required for refresh tokens
- `prompt=consent` - Forces re-consent to issue new refresh token

### Reddit: Tokens expire after 1 hour with no refresh

**Problem:** Reddit access tokens expire in 1 hour and no refresh token is provided.

**Solution:** Add `duration=permanent` to authorization URL. Without this, Reddit treats the app as a temporary/"installed" application.

### Twitter: OAuth 1.0a vs OAuth 2.0

**Question:** When should I use OAuth 1.0a vs OAuth 2.0 for Twitter?

**Answer:**

- **OAuth 2.0** - Read-only operations (timeline, mentions, search) - Currently supported
- **OAuth 1.0a** - Write operations (tweets, likes, follows) - Planned for Phase 4

### GitHub: Revoked token errors mid-session

**Problem:** Token suddenly stops working with 401 errors.

**Causes:**

- User revoked access in GitHub settings
- Organization admin revoked app access
- Token was deleted manually

**Solution:** Implement proper error handling with re-authentication flow. Check for 401 responses and prompt user to reconnect.

## Rate Limiting

### Reddit: Permanent IP ban after exceeding limits

**Problem:** Getting 429 errors and subsequent requests are blocked.

**Solution:**

- Never exceed 60 requests per minute
- Use correct User-Agent format: `platform:app_id:version (by /u/username)`
- SDK enforces rate limits by default (1 QPS for Reddit)

### Tuning rate limits for your use case

**Question:** How do I adjust rate limits?

**Answer:**

```typescript
rateLimits: {
  github: { qps: 10, concurrency: 5 },  // 10 requests/sec, max 5 concurrent
  reddit: { qps: 0.5, concurrency: 1 }  // 30 requests/min (0.5/sec), 1 at a time
}
```

## Token Management

### Clock skew causing premature expiration

**Problem:** Tokens expire earlier than expected.

**Solution:** SDK uses `expiredTokenBufferMinutes: 5` by default, refreshing tokens 5 minutes before stated expiry. This accounts for clock drift between server and OAuth provider.

### Multi-instance refresh storms

**Problem:** Multiple servers refresh the same token simultaneously.

**Solution:** Enable distributed refresh locks with Redis:

```typescript
tokenStore: {
  backend: 'redis',
  url: process.env.REDIS_URL
}
```

SDK uses Redis `SET NX EX` locks to deduplicate refresh attempts across instances.

## ETag Caching

### When does ETag caching work?

**Providers with strong ETag support:**

- GitHub - Excellent (all REST endpoints)
- RSS feeds - Depends on host

**Providers with limited/no ETag support:**

- Google Gmail - Limited
- Reddit - No ETag support
- Twitter - No ETag support

### How much does ETag caching save?

- **GitHub:** Can reduce API calls by 50-80% for unchanged data
- **Cost savings:** Prevents unnecessary API quota usage and reduces latency

## Errors & Troubleshooting

### "ENCRYPTION_KEY must be 64 characters"

**Problem:** SDK fails to initialize with encryption key error.

**Solution:** Generate a proper 32-byte hex key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### "Redis connection failed"

**Problem:** Token store can't connect to Redis.

**Solutions:**

1. Use memory backend for development:

   ```typescript
   tokenStore: {
     backend: 'memory';
   }
   ```

2. Start Redis:

   ```bash
   docker run -d -p 6379:6379 redis:7-alpine
   ```

3. Check Redis URL format:
   ```
   redis://localhost:6379
   redis://user:pass@host:6379
   ```

### "No provider configured"

**Problem:** SDK initialization fails with no providers.

**Solution:** At least one provider must be configured:

```typescript
providers: {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    // ... other config
  }
}
```

## Provider-Specific Questions

### Google: Which scopes do I need?

**Gmail:**

- `https://www.googleapis.com/auth/gmail.readonly` - Read emails

**Calendar:**

- `https://www.googleapis.com/auth/calendar.readonly` - Read calendar events

### Reddit: How do I get the username?

**Answer:** Reddit doesn't support `/user/me/*` endpoints. SDK automatically fetches username from `/api/v1/me` before making user-specific API calls.

### RSS: Does it work with Atom feeds?

**Answer:** Yes! The `rss-parser` library supports both RSS 2.0 and Atom 1.0 feeds.

### Twitter: Rate limits per endpoint?

**Answer:** Twitter rate limits vary by endpoint:

- User timeline: 900 requests / 15 minutes
- Mentions: 75 requests / 15 minutes
- Search: 180 requests / 15 minutes

SDK uses conservative defaults (5 QPS) to avoid hitting limits.

## Performance

### How many users can one instance handle?

**Depends on:**

- Provider rate limits
- Request frequency
- Token store backend (Redis recommended for production)

**Rough estimates:**

- Memory backend: 100-1000 users
- Redis backend: 10,000+ users (limited by provider rate limits)

### Should I use PostgreSQL or Redis for token storage?

**Redis:**

- ✅ Faster (in-memory)
- ✅ Built-in TTL support
- ✅ Better for distributed locks
- ❌ Data can be lost on restart (if not using persistence)

**PostgreSQL:**

- ✅ Persistent storage
- ✅ Transaction support
- ✅ Backup/restore capabilities
- ❌ Slower than Redis

**Recommendation:** Use Redis for production with persistence enabled (`appendonly yes`).

## See Also

- [Provider Matrix](./provider-matrix.md) - OAuth quirks
- [Troubleshooting](./troubleshooting.md) - Common issues
- [Configuration](./configuration.md) - Setup guide
