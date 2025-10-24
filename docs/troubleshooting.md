# OAuth Connector SDK - Troubleshooting Guide

This guide helps diagnose and resolve common issues when using the OAuth Connector SDK.

---

## Table of Contents

1. [OAuth Flow Issues](#oauth-flow-issues)
2. [Token Refresh Failures](#token-refresh-failures)
3. [Connection Errors](#connection-errors)
4. [Rate Limiting Issues](#rate-limiting-issues)
5. [Data Fetching Problems](#data-fetching-problems)
6. [Performance Issues](#performance-issues)
7. [Debug Logging](#debug-logging)
8. [Common Error Messages](#common-error-messages)

---

## OAuth Flow Issues

### Issue: "Invalid redirect_uri"

**Symptoms:**
- OAuth flow fails at authorization step
- Provider shows "redirect_uri mismatch" error

**Causes:**
- Redirect URI in code doesn't match provider configuration
- Protocol mismatch (http vs https)
- Port number mismatch
- Trailing slash mismatch

**Solutions:**
1. Check provider OAuth app settings
2. Verify exact match including protocol, domain, port, path
3. Update redirect URI in SDK config:

```typescript
providers: {
  github: {
    // ... other config
    redirectUri: 'https://yourdomain.com/callback/github'  // Must match exactly
  }
}
```

### Issue: "State parameter mismatch"

**Symptoms:**
- Callback fails with "Invalid state" error

**Causes:**
- CSRF protection detected state mismatch
- Session not persisting across requests
- Multiple SDK instances with different state storage

**Solutions:**
1. Ensure state is stored per user session
2. Use persistent storage (Redis) in production
3. Check that state from `connect()` matches callback

### Issue: "PKCE verification failed"

**Symptoms:**
- Token exchange fails with code_challenge error

**Causes:**
- PKCE challenge/verifier mismatch
- Provider doesn't support PKCE

**Solutions:**
1. Ensure PKCE is enabled: `usePKCE: true`
2. Check that code_verifier is stored during connect()
3. Verify provider supports PKCE (GitHub, Google do)

---

## Token Refresh Failures

### Issue: "Failed to refresh token"

**Symptoms:**
- `TokenRefreshError` thrown
- Requests fail with authentication errors

**Causes:**
- Refresh token expired
- Refresh token revoked by user
- Provider refresh endpoint unreachable
- Invalid grant error from provider

**Solutions:**

1. **Check token expiry:**
```typescript
const token = await sdk.getToken(userId, 'github');
console.log('Expires at:', token?.expiresAt);
```

2. **Enable debug logging:**
```typescript
logging: { level: 'debug' }
```

3. **Check for revocation:**
- User may have revoked access on provider's website
- Prompt user to reconnect

4. **Verify refresh token exists:**
```typescript
if (!token.refreshToken) {
  // Request offline_access scope for refresh tokens
}
```

### Issue: "Token expired, no refresh token"

**Symptoms:**
- `TokenExpiredError` thrown
- No refresh token available

**Causes:**
- `offline_access` or `access_type=offline` not requested
- Provider doesn't issue refresh tokens for requested scopes

**Solutions:**

1. **Add offline access scope:**
```typescript
google: {
  scopes: ['openid', 'email', 'offline.access'],  // ← Add this
}

twitter: {
  scopes: ['tweet.read', 'offline.access'],  // ← Add this
}
```

2. **Prompt user to reconnect** if no refresh token available

---

## Connection Errors

### Issue: "Cannot connect to Redis"

**Symptoms:**
- SDK initialization fails
- `ECONNREFUSED` error for Redis

**Causes:**
- Redis not running
- Incorrect Redis URL
- Firewall blocking connection

**Solutions:**

1. **Check Redis is running:**
```bash
redis-cli ping
# Should return: PONG
```

2. **Verify connection URL:**
```bash
REDIS_URL=redis://localhost:6379  # Default
REDIS_URL=redis://:password@host:6379  # With auth
REDIS_URL=rediss://host:6379  # TLS
```

3. **Test connection:**
```typescript
import { createClient } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();
await client.ping(); // Should succeed
```

### Issue: "PostgreSQL connection failed"

**Symptoms:**
- Token storage fails
- `connection refused` or `authentication failed`

**Causes:**
- PostgreSQL not running
- Incorrect credentials
- Database doesn't exist

**Solutions:**

1. **Verify connection:**
```bash
psql postgresql://user:pass@localhost:5432/oauth_sdk
```

2. **Check database exists:**
```sql
CREATE DATABASE oauth_sdk;
```

3. **Run init script:**
```bash
psql -U postgres -d oauth_sdk -f scripts/init.sql
```

---

## Rate Limiting Issues

### Issue: "429 Too Many Requests"

**Symptoms:**
- Frequent 429 errors in logs
- Requests failing with rate limit errors
- Circuit breaker opening

**Causes:**
- SDK rate limit too aggressive
- Multiple SDK instances not coordinated
- Provider has stricter limits than configured

**Solutions:**

1. **Reduce rate limits:**
```typescript
rateLimits: {
  github: { qps: 5, concurrency: 2 }  // Reduce from 10
}
```

2. **Check provider limits:**
- GitHub: 5,000/hour authenticated
- Google: Varies by API
- Reddit: 60/minute
- Twitter: Varies by tier

3. **Monitor queue depth:**
```bash
# Check Grafana dashboard
# If queue depth growing, reduce qps
```

4. **Enable distributed rate limiting** (future feature)

### Issue: "High queue depth"

**Symptoms:**
- `rate_limit_queue_depth` metric growing
- Slow response times
- Requests queuing

**Causes:**
- Too many concurrent requests
- QPS set too low for workload
- Provider API slow to respond

**Solutions:**

1. **Increase concurrency:**
```typescript
rateLimits: {
  github: { qps: 10, concurrency: 10 }  // Increase from 5
}
```

2. **Increase QPS if provider allows:**
```typescript
github: { qps: 15, concurrency: 8 }
```

3. **Monitor provider API latency** in Grafana

---

## Data Fetching Problems

### Issue: "Empty data returned"

**Symptoms:**
- Fetch returns empty array `[]`
- Expected data not appearing

**Causes:**
- No data available from provider
- Incorrect query parameters
- Missing required scopes
- Data filtered by provider API

**Solutions:**

1. **Check required scopes:**
```typescript
// For Gmail, need:
scopes: ['https://www.googleapis.com/auth/gmail.readonly']

// For Reddit saved posts, need:
scopes: ['identity', 'read', 'history']
```

2. **Verify parameters:**
```typescript
// Reddit example
const data = await sdk.fetch(userId, 'reddit', {
  type: 'saved',  // Check type is valid
  limit: 50
});
```

3. **Check provider dashboard:**
- Verify user has data on provider's website
- Check data privacy settings

### Issue: "Data not normalized"

**Symptoms:**
- Data structure unexpected
- Missing expected fields

**Causes:**
- Provider changed API format
- Mapper not updated
- Custom provider not using normalizer

**Solutions:**

1. **Check raw vs normalized:**
```typescript
const response = await http.request(...);  // Raw
const normalized = normalizer.normalize('github', userId, response.data);  // Normalized
```

2. **Verify mapper exists** in `ProviderMappers.ts`

3. **Check logs** for mapping errors

---

## Performance Issues

### Issue: "Slow response times"

**Symptoms:**
- Requests taking > 5 seconds
- High p95/p99 latency in Grafana

**Causes:**
- Provider API slow
- Network latency
- Rate limiting causing queuing
- Circuit breaker opening/closing frequently

**Solutions:**

1. **Check latency by provider:**
```bash
# View Grafana dashboard
# Panel: "Request Latency (p50, p95, p99)"
```

2. **Increase timeouts if needed:**
```typescript
http: {
  timeout: 60000  // 60 seconds
}
```

3. **Enable caching** (should be automatic):
- Check `http_cache_hits` metric
- Verify ETag headers in provider responses

### Issue: "High memory usage"

**Symptoms:**
- Memory growing over time
- Out of memory errors

**Causes:**
- In-memory token store with many users
- ETag cache too large
- Memory leaks

**Solutions:**

1. **Switch to Redis:**
```typescript
tokenStore: {
  backend: 'redis',  // Instead of 'memory'
  url: process.env.REDIS_URL
}
```

2. **Monitor memory:**
```bash
# Check process memory
ps aux | grep node
```

3. **Limit ETag cache size** (already set to 1000 entries)

---

## Debug Logging

### Enable Debug Logging

```typescript
logging: {
  level: 'debug'  // Most verbose
}
```

### Key Log Messages

**OAuth Flow:**
```
[info] Connect initiated - provider: github, userId: user123
[info] OAuth code exchanged - provider: github
[info] Token stored - provider: github, expiresAt: 2024-01-01T10:00:00Z
```

**Token Refresh:**
```
[info] Auto-refreshing token - provider: github, expired: false
[info] Token refresh success - provider: github
```

**HTTP Requests:**
```
[debug] HTTP request - provider: github, url: /user/starred
[debug] HTTP response - status: 200, cached: false
[info] Cache hit - provider: github, resource: starred
```

**Errors:**
```
[error] Token refresh failed - provider: github, error: invalid_grant
[warn] Circuit breaker open - provider: github, failures: 5
[error] HTTP request failed - provider: github, attempt: 3/3
```

### Filter Logs by Provider

```bash
# Using Docker
docker-compose logs app | grep 'provider: github'

# Using grep
cat logs/app.log | grep github
```

---

## Common Error Messages

### `TokenNotFoundError: No token found for {provider}`

**Meaning:** User hasn't connected to the provider

**Solution:**
```typescript
// Check if user is connected
try {
  await sdk.fetch(userId, 'github', {});
} catch (error) {
  if (error instanceof TokenNotFoundError) {
    // Redirect user to connect
    const authUrl = await sdk.connect(userId, 'github');
    // Redirect to authUrl
  }
}
```

### `TokenRefreshError: Failed to refresh token`

**Meaning:** Refresh attempt failed

**Possible Causes:**
- Refresh token expired or revoked
- Provider API unreachable
- Invalid grant from provider

**Solution:**
```typescript
try {
  await sdk.fetch(userId, 'github', {});
} catch (error) {
  if (error instanceof TokenRefreshError) {
    // Prompt user to reconnect
    await sdk.disconnect(userId, 'github');
    const authUrl = await sdk.connect(userId, 'github');
    // Redirect to authUrl
  }
}
```

### `OAuthError: Discovery failed`

**Meaning:** Couldn't fetch provider's OAuth endpoints

**Solution:**
1. Check network connectivity
2. Verify discovery URL is correct
3. Provider may be down - check status page

### `ConfigValidationError: Invalid configuration`

**Meaning:** Configuration failed Zod validation

**Solution:**
- Read error details for specific field
- Check [Configuration Guide](./configuration.md)
- Validate required fields present

---

## Health Checks

### Verify SDK Health

```typescript
// Check if SDK is initialized
if (sdk) {
  console.log('SDK ready');
}

// Test token storage
const token = await sdk.getToken(userId, 'github');
console.log('Token exists:', !!token);

// Test provider connectivity
try {
  const data = await sdk.fetch(userId, 'github', { limit: 1 });
  console.log('Provider reachable:', true);
} catch (error) {
  console.log('Provider error:', error.message);
}
```

### Health Check Endpoint

```typescript
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      redis: false,
      providers: {}
    }
  };

  // Check Redis
  try {
    await redis.ping();
    health.checks.redis = true;
  } catch (error) {
    health.status = 'degraded';
  }

  res.json(health);
});
```

---

## Monitoring

### Key Metrics to Watch

1. **Error Rate:** `http_request_errors_total`
   - Alert if > 5% of requests

2. **Latency:** `http_request_duration` (p95)
   - Alert if > 2 seconds

3. **Token Refresh Rate:** `token_refresh_total`
   - Spike may indicate expiry issues

4. **Cache Hit Rate:**
   - Should be > 50% for repeated queries

5. **Circuit Breaker State:** `circuit_breaker_state`
   - Alert if OPEN for extended period

### Grafana Alerts

```yaml
# Example alert rule
- alert: HighErrorRate
  expr: rate(http_request_errors_total[5m]) > 0.05
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High error rate for {{ $labels.provider }}"
```

---

## Getting Help

### Collect Diagnostic Information

```bash
# 1. Get SDK version
npm list oauth-connector-sdk

# 2. Check configuration (redact secrets!)
echo $REDIS_URL
echo $LOG_LEVEL

# 3. Collect logs
docker-compose logs app --tail=100 > sdk-logs.txt

# 4. Get metrics
curl http://localhost:9090/metrics > metrics.txt

# 5. Check provider status
# GitHub: https://www.githubstatus.com/
# Google: https://status.cloud.google.com/
# Reddit: https://www.redditstatus.com/
# Twitter: https://api.twitterstat.us/
```

### Report an Issue

Include:
- SDK version
- Provider(s) affected
- Error message (redact secrets!)
- Relevant logs
- Steps to reproduce

---

## Provider-Specific Issues

### GitHub

**Issue:** "Resource not accessible by integration"

**Solution:** Check required scopes:
- `user` - Access user profile
- `repo` - Access repositories
- `read:org` - Access organization data

### Google

**Issue:** "Insufficient permissions"

**Solution:**
1. Enable required APIs in Google Cloud Console
2. Add appropriate scopes:
   - Gmail: `https://www.googleapis.com/auth/gmail.readonly`
   - Calendar: `https://www.googleapis.com/auth/calendar.readonly`

**Issue:** "Daily limit exceeded"

**Solution:**
- Check quota in Google Cloud Console
- Request quota increase
- Implement caching to reduce API calls

### Reddit

**Issue:** "403 Forbidden"

**Solution:**
1. Set proper User-Agent header (SDK does this automatically)
2. Verify OAuth app type is "web app" not "script"
3. Check scopes include `read` and `identity`

### Twitter

**Issue:** "Unauthorized - OAuth 2.0"

**Solution:**
1. Verify OAuth 2.0 is enabled in Twitter app settings
2. Check scopes include `tweet.read` and `users.read`
3. Add `offline.access` for refresh tokens

**Issue:** "Rate limit exceeded"

**Solution:**
- Twitter has strict rate limits by tier
- Reduce `qps` in rate limits config
- Consider upgrading Twitter API tier

### RSS

**Issue:** "Failed to parse RSS feed"

**Solution:**
1. Verify feed URL returns valid XML
2. Check feed format (RSS 2.0, Atom supported)
3. Test feed URL in browser
4. Some feeds may require specific headers

---

## Docker Issues

### Issue: "Port already in use"

**Solution:**
```bash
# Change ports in docker-compose.yml
services:
  app:
    ports:
      - "3001:3000"  # Changed from 3000
```

### Issue: "Services not starting"

**Solution:**
```bash
# Check logs
docker-compose logs

# Restart services
docker-compose down
docker-compose up -d

# Check service health
docker-compose ps
```

### Issue: "Database connection failed"

**Solution:**
```bash
# Check PostgreSQL is ready
docker-compose exec postgres pg_isready

# Check tables exist
docker-compose exec postgres psql -U postgres -d oauth_sdk -c "\dt"

# Re-run init script if needed
docker-compose exec postgres psql -U postgres -d oauth_sdk -f /docker-entrypoint-initdb.d/init.sql
```

---

## Performance Debugging

### Identify Slow Requests

```typescript
// Enable request timing
logging: { level: 'debug' }

// Check logs for:
// [debug] HTTP request duration: 2500ms - provider: github
```

### Profile Token Refresh

```bash
# Watch for refresh patterns
docker-compose logs app | grep "Auto-refreshing token"

# Should see:
# - Refresh 5-10 minutes before expiry
# - Only one refresh per user/provider (deduplication)
```

### Check Circuit Breaker

```bash
# Monitor circuit breaker state
curl http://localhost:9090/metrics | grep circuit_breaker

# Should show:
# circuit_breaker_state{provider="github"} 0  # CLOSED (good)
# circuit_breaker_state{provider="github"} 2  # OPEN (bad)
```

---

## Quick Fixes

### Reset Everything

```bash
# Stop all services
docker-compose down -v  # -v removes volumes

# Clear Redis
redis-cli FLUSHALL

# Restart fresh
docker-compose up -d
```

### Test Individual Provider

```typescript
// Isolate to one provider
const sdk = await ConnectorSDK.init({
  // ... config
  providers: {
    github: { /* only GitHub */ }
  }
});

// Test fetch
const data = await sdk.fetch('test-user', 'github', { limit: 1 });
console.log('Success! Data:', data);
```

### Enable All Logging

```typescript
logging: {
  level: 'debug'  // Maximum verbosity
}
```

```bash
# Watch logs in real-time
docker-compose logs -f app

# Or
tail -f logs/app.log
```

---

## Still Having Issues?

1. **Check Status Pages:**
   - GitHub: https://www.githubstatus.com/
   - Google: https://status.cloud.google.com/
   - Reddit: https://www.redditstatus.com/
   - Twitter: https://api.twitterstat.us/

2. **Review Documentation:**
   - [Configuration Guide](./configuration.md)
   - [README.md](../README.md)
   - [Example App](../examples/express-app/README.md)

3. **Check Test Suite:**
   ```bash
   npm test
   # All tests should pass
   ```

4. **Verify Build:**
   ```bash
   npm run build
   # Should complete without errors
   ```

5. **Enable Metrics:**
   - View Grafana: http://localhost:3001
   - Check Prometheus: http://localhost:9091