# Provider Matrix

## Table of Contents

- [Quick Reference](#quick-reference)
- [Provider Details](#provider-details)
  - [Google](#google)
  - [GitHub](#github)
  - [Reddit](#reddit)
  - [Twitter (X)](#twitter-x)
  - [RSS](#rss)
- [Common Pitfalls](#common-pitfalls)

---

## Quick Reference

| Provider        | OAuth Version    | Required Scopes                              | Refresh Support                          | Pagination                      | Rate Limits     | Notable Quirks                                                 | Notable Errors                                    |
| --------------- | ---------------- | -------------------------------------------- | ---------------------------------------- | ------------------------------- | --------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| **Google**      | OAuth 2.0 + PKCE | `gmail.readonly`, `calendar.readonly`        | ✅ Yes                                   | Token-based                     | 10,000/60s      | Requires `access_type=offline` + `prompt=consent`              | 401: Token expired, 403: Insufficient permissions |
| **GitHub**      | OAuth 2.0 + PKCE | `user`, `repo`                               | ✅ Yes                                   | Page-based                      | 5,000/3600s     | Strong ETag support                                            | 403: Rate limit exceeded, 401: Token revoked      |
| **Reddit**      | OAuth 2.0 + PKCE | `identity`, `read`, `history`                | ✅ Yes (requires `duration=permanent`)   | Cursor-based (`after`/`before`) | 60/60s (strict) | Requires specific User-Agent format, must fetch username first | 401: Invalid token, 403: Access denied            |
| **Twitter (X)** | OAuth 2.0 + PKCE | `tweet.read`, `users.read`, `offline.access` | ✅ Yes (requires `offline.access` scope) | Token-based                     | 300/900s        | OAuth 1.0a NOT supported yet                                   | 429: Rate limit, 401: Unauthorized                |
| **RSS**         | None             | N/A                                          | N/A                                      | N/A                             | 100 QPS         | No authentication, just public feeds                           | N/A (HTTP errors only)                            |

---

## Provider Details

### Google

**OAuth Configuration:**

```typescript
providers: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    redirectUri: 'http://localhost:3000/callback/google',
    usePKCE: true
  }
}
```

**Critical OAuth Parameters:**

- `access_type=offline` - **REQUIRED** to receive refresh tokens
- `prompt=consent` - **REQUIRED** to force re-consent and issue new refresh token
- Without these, Google only issues short-lived access tokens

**Services Supported:**

- **Gmail** - Fetch unread messages, search queries
- **Calendar** - Fetch upcoming events

**Rate Limits:**

- Default: 10,000 queries per 60 seconds
- Per-user quota: 1 billion queries/day

**Pagination:**

- Gmail: `nextPageToken` for message list
- Calendar: `nextPageToken` for events

**Common Errors:**

- `401 Unauthorized` - Token expired (auto-refresh handles this)
- `403 Forbidden` - Missing required scope or quota exceeded
- `429 Too Many Requests` - Rate limit (rare with SDK rate limiting)

**SDK Config Snippet:**

```typescript
const items = await sdk.fetch('google', userId, {
  service: 'gmail',
  query: 'is:unread',
  limit: 20,
});
```

---

### GitHub

**OAuth Configuration:**

```typescript
providers: {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    scopes: ['user', 'repo'],
    redirectUri: 'http://localhost:3000/callback/github',
    usePKCE: true
  }
}
```

**Scopes:**

- `user` - Read user profile and email
- `repo` - Access public and private repositories
- `read:user` - Read-only access to profile data

**Refresh Support:**

- GitHub OAuth apps **DO issue refresh tokens** (contrary to some documentation)
- Refresh tokens are long-lived and work with the SDK's auto-refresh logic

**Rate Limits:**

- Authenticated: 5,000 requests/hour
- GraphQL: 5,000 points/hour

**Pagination:**

- REST API uses `page` and `per_page` query parameters
- Returns `Link` header with next/prev URLs

**ETag Support:**

- GitHub has **excellent ETag support**
- SDK automatically caches responses with ETags
- Returns `304 Not Modified` for unchanged data

**Common Errors:**

- `401 Unauthorized` - Token expired or revoked
- `403 Forbidden` - Rate limit exceeded or resource access denied
- `404 Not Found` - Resource doesn't exist or no permission

**SDK Config Snippet:**

```typescript
const items = await sdk.fetch('github', userId, {
  type: 'starred', // or 'repos'
  limit: 30,
  page: 1,
  sort: 'updated',
});
```

---

### Reddit

**OAuth Configuration:**

```typescript
providers: {
  reddit: {
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    authorizationEndpoint: 'https://www.reddit.com/api/v1/authorize',
    tokenEndpoint: 'https://www.reddit.com/api/v1/access_token',
    scopes: ['identity', 'read', 'history'],
    redirectUri: 'http://localhost:3000/callback/reddit',
    usePKCE: true
  }
}
```

**Critical OAuth Parameters:**

- `duration=permanent` - **REQUIRED** for refresh tokens
- Without this, Reddit only issues 1-hour access tokens with NO refresh token

**User-Agent Requirement:**

- Reddit **requires** a specific User-Agent format
- Format: `platform:app_id:version (by /u/username)`
- Example: `web:oauth-connector-sdk:v1.0.0 (by /u/oauth-connector)`
- Missing/generic User-Agent results in `429 Too Many Requests`

**Username Quirk:**

- Reddit API does **NOT support** `/user/me/*` endpoints
- Must first call `/api/v1/me` to get the username
- Then use `/user/{username}/saved`, etc.

**Rate Limits:**

- **VERY STRICT**: 60 requests per 60 seconds
- Exceeding this results in permanent API blocks for your IP
- SDK rate limiting is critical for Reddit

**Pagination:**

- Uses `after` and `before` cursor tokens
- `limit` max is 100

**Common Errors:**

- `401 Unauthorized` - Invalid or expired token
- `403 Forbidden` - Insufficient permissions or banned
- `429 Too Many Requests` - Rate limit exceeded (SDK prevents this)

**SDK Config Snippet:**

```typescript
const items = await sdk.fetch('reddit', userId, {
  type: 'saved', // or 'submitted', 'comments'
  limit: 25,
  sort: 'new',
  after: 't3_abc123', // pagination cursor
});
```

---

### Twitter (X)

**OAuth Configuration:**

```typescript
providers: {
  twitter: {
    clientId: process.env.TWITTER_CLIENT_ID,
    clientSecret: process.env.TWITTER_CLIENT_SECRET,
    authorizationEndpoint: 'https://twitter.com/i/oauth2/authorize',
    tokenEndpoint: 'https://api.twitter.com/2/oauth2/token',
    scopes: ['tweet.read', 'users.read', 'offline.access'],
    redirectUri: 'http://localhost:3000/callback/twitter',
    usePKCE: true
  }
}
```

**OAuth Version Support:**

- ✅ **OAuth 2.0 with PKCE** - Currently supported
- ⚠️ **OAuth 1.0a** - NOT YET IMPLEMENTED (planned for Phase 4)
- OAuth 2.0 is sufficient for read operations
- OAuth 1.0a would be needed for write operations (tweets, likes, follows)

**Scopes:**

- `tweet.read` - Read tweets and timelines
- `users.read` - Read user profiles
- `offline.access` - **REQUIRED** for refresh tokens

**Endpoints Supported:**

- `timeline` - Reverse chronological home timeline
- `mentions` - Tweets mentioning the user
- `tweets` - User's own tweets
- `search` - Search recent tweets (requires query)

**Rate Limits:**

- App-level: 300 requests per 15 minutes (per endpoint)
- User-level: Varies by endpoint

**Pagination:**

- Uses `pagination_token` for next page
- `max_results` capped at 100

**Common Errors:**

- `401 Unauthorized` - Invalid or expired token
- `403 Forbidden` - Suspended account or missing permissions
- `429 Too Many Requests` - Rate limit exceeded

**SDK Config Snippet:**

```typescript
const items = await sdk.fetch('twitter', userId, {
  type: 'timeline',
  maxResults: 25,
  excludeRetweets: true,
  excludeReplies: false,
});
```

---

### RSS

**No OAuth Required:**

- RSS/Atom feeds are public and require no authentication
- SDK still tracks feeds per user for caching purposes

**ETag Support:**

- Many RSS feeds support ETags
- SDK caches feed content and uses conditional requests

**Rate Limits:**

- SDK default: 100 QPS
- Actual limits depend on feed host

**Feed URL Hashing:**

- Feed URLs are hashed (SHA-256, first 16 chars) for cache keys
- Prevents collision and keeps keys compact

**Common Errors:**

- `404 Not Found` - Feed URL invalid or removed
- `500 Server Error` - Feed host issues
- Parse errors - Malformed XML/RSS

**SDK Config Snippet:**

```typescript
const items = await sdk.fetch('rss', userId, {
  feedUrl: 'https://example.com/feed.xml',
  limit: 50,
});
```

---

## Common Pitfalls

### Google: Refresh Token Not Issued

**Problem:** Only receiving short-lived access tokens, no refresh token.

**Solution:** Ensure BOTH parameters are present:

```typescript
authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent';
```

### Reddit: Rate Limit Ban

**Problem:** Getting permanent 429 errors even with correct User-Agent.

**Solution:**

- Ensure `duration=permanent` is set in authorization URL
- Never exceed 60 req/min (SDK enforces this)
- Use correct User-Agent format

### Twitter: OAuth 1.0a vs OAuth 2.0

**Problem:** Trying to use write endpoints with OAuth 2.0.

**Solution:**

- OAuth 2.0 is read-only in current SDK implementation
- Write operations require OAuth 1.0a (not yet supported)
- Phase 4 will add OAuth 1.0a support

### GitHub: Revoked Token Errors

**Problem:** Token suddenly stops working mid-session.

**Solution:**

- User may have revoked access in GitHub settings
- Implement proper error handling with re-authentication flow
- Check `disconnect` events and prompt re-connection

### All Providers: Clock Skew

**Problem:** Tokens expire earlier than expected.

**Solution:**

- SDK uses `expiredTokenBufferMinutes: 5` by default
- Refreshes tokens 5 minutes before expiry
- Accounts for clock drift between server and OAuth provider

---

## See Also

- [Configuration Guide](./configuration.md)
- [Troubleshooting](./troubleshooting.md)
- [FAQ](./faq.md)
