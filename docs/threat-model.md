# Threat Model

## Table of Contents

- [Threat Overview](#threat-overview)
- [Token Security](#token-security)
- [Refresh Storm Mitigation](#refresh-storm-mitigation)
- [Key Rotation](#key-rotation)
- [Outage Posture](#outage-posture)
- [Security Checklist](#security-checklist)

---

## Threat Overview

### Assets to Protect

1. **OAuth Access Tokens** - Short-lived credentials for API access
2. **OAuth Refresh Tokens** - Long-lived credentials for token renewal
3. **Client Secrets** - Application credentials for OAuth flows
4. **User Data** - Emails, repositories, posts fetched from providers
5. **Encryption Keys** - Keys used to encrypt tokens at rest

### Threat Actors

1. **External Attackers** - Attempting to steal tokens or exfiltrate data
2. **Malicious Insiders** - Employees with access to infrastructure
3. **Compromised Dependencies** - Supply chain attacks via npm packages
4. **Provider Outages** - OAuth provider unavailability affecting operations

---

## Token Security

### Threat: Token Exfiltration

**Attack Vectors:**

- Log files containing plaintext tokens
- Unencrypted storage (memory, Redis, PostgreSQL)
- Error messages exposing tokens
- Network interception (man-in-the-middle)

**Mitigations:**

1. **Encryption at Rest** (AES-256-GCM)

   ```typescript
   tokenStore: {
     encryption: {
       key: process.env.ENCRYPTION_KEY, // 32-byte hex
       algorithm: 'aes-256-gcm'
     }
   }
   ```

2. **Log Redaction**
   - All tokens automatically redacted from logs
   - Only metadata logged (expiresAt, scopes, provider)
   - Test: `tests/unit/security.test.ts`

3. **HTTPS Only**
   - All OAuth flows over TLS 1.2+
   - No HTTP redirect URIs in production

4. **Secure Storage**
   - Redis with authentication: `redis://user:pass@host:6379`
   - PostgreSQL with SSL: `sslmode=require`
   - Memory backend for development only

### Threat: Token Replay

**Attack:** Attacker intercepts and reuses a stolen token.

**Mitigations:**

- Short-lived access tokens (1 hour typical)
- Automatic token refresh before expiry
- Token revocation on disconnect
- PKCE (Proof Key for Code Exchange) for all OAuth flows

### Threat: Insufficient Authorization

**Attack:** User grants minimal scopes, SDK fails to detect.

**Mitigations:**

- SDK validates required scopes on init
- Provider errors bubble up with clear messages
- Documentation specifies minimum scopes per provider

---

## Refresh Storm Mitigation

### Threat: Concurrent Refresh Storms

**Attack:** Multiple servers or threads refresh the same token simultaneously, causing:

- Race conditions
- Token invalidation
- Provider rate limiting
- Unnecessary API calls

**Mitigations:**

1. **Local In-Memory Lock**
   - Single-process deduplication
   - Prevents concurrent refreshes within one instance

2. **Distributed Redis Lock**

   ```typescript
   // Redis SET NX EX for atomic lock acquisition
   const lockKey = `refresh_lock:${provider}:${userId}`;
   const acquired = await redis.set(lockKey, 'locked', 'NX', 'EX', 60);
   ```

3. **Token Buffer Window**
   - Refresh 5 minutes before expiry
   - Reduces refresh frequency
   - Accounts for clock skew

**Metrics:**

- `token_refresh_dedup_local_total` - Local deduplications
- `token_refresh_dedup_distributed_total` - Distributed deduplications

---

## Key Rotation

### Threat: Encryption Key Compromise

**Attack:** Attacker gains access to encryption key, decrypts all stored tokens.

**Mitigations:**

1. **Multi-Key Decryption**
   - New tokens encrypted with latest key
   - Old tokens decrypted with previous keys
   - Gradual migration without downtime

   ```typescript
   // Pseudo-code (not yet implemented)
   encryption: {
     keys: [
       { id: 'key-2024-10', key: process.env.ENCRYPTION_KEY_NEW }, // Current
       { id: 'key-2024-09', key: process.env.ENCRYPTION_KEY_OLD }, // Previous
     ];
   }
   ```

2. **Key Rotation Cadence**
   - Rotate keys every **90 days** minimum
   - More frequently for high-security environments
   - Document rotation in security logs

3. **Key Storage**
   - Never commit keys to version control
   - Use secret management systems:
     - AWS Secrets Manager
     - HashiCorp Vault
     - Kubernetes Secrets

### Rotation Process

1. Generate new key:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Add new key as `ENCRYPTION_KEY_NEW`

3. Deploy update with multi-key decryption

4. Wait for old tokens to expire or refresh

5. Remove old key after migration complete

---

## Outage Posture

### Threat: Provider Unavailability

**Scenarios:**

- OAuth provider down (GitHub, Google, etc.)
- Network partitions
- Rate limit exceeded
- API endpoint deprecated

**Mitigations:**

1. **Circuit Breaker**

   ```typescript
   // Automatically open circuit after 5 failures
   // Half-open state after 60 seconds
   // Prevents cascading failures
   ```

2. **Graceful Degradation**
   - Serve cached data when provider unavailable
   - ETag cache provides stale data fallback
   - Log warnings, don't crash

3. **Retry with Exponential Backoff**

   ```typescript
   http: {
     retry: {
       maxRetries: 3,
       baseDelay: 1000,    // 1s
       maxDelay: 10000,    // 10s
       retryableStatusCodes: [429, 500, 502, 503, 504]
     }
   }
   ```

4. **Health Checks**
   - Monitor provider availability
   - Alert on sustained failures
   - Fallback to alternative providers if possible

### Threat: Redis/PostgreSQL Outage

**Mitigations:**

- In-memory fallback for token store
- Read-through cache pattern
- Cluster mode for high availability
- Regular backups

---

## Security Checklist

### Pre-Production

- [ ] All tokens encrypted with strong key (32 bytes)
- [ ] Encryption key stored in secret manager (not .env file)
- [ ] Redis authentication enabled
- [ ] PostgreSQL SSL enabled
- [ ] Log redaction tested
- [ ] No tokens in error messages
- [ ] HTTPS for all OAuth redirect URIs
- [ ] PKCE enabled for all providers
- [ ] Rate limits configured conservatively
- [ ] Circuit breaker thresholds tuned
- [ ] Distributed refresh locks enabled (Redis)

### Monitoring

- [ ] Prometheus metrics scraped
- [ ] Alerts for:
  - Token refresh failures (> 1%)
  - Provider errors (> 5%)
  - Circuit breaker open states
  - Rate limit violations
- [ ] Security logs aggregated
- [ ] Token rotation scheduled (every 90 days)

### Incident Response

- [ ] Key rotation runbook documented
- [ ] Token revocation process tested
- [ ] Emergency provider disable procedure
- [ ] Backup/restore tested for token store
- [ ] Security contact documented

### Compliance

- [ ] GDPR: User can delete all tokens (`disconnect`)
- [ ] SOC 2: Encryption at rest enforced
- [ ] PCI: No sensitive data in logs
- [ ] HIPAA: Access controls on token store

---

## Known Limitations

1. **No OAuth 1.0a Support (Yet)**
   - Twitter write operations require OAuth 1.0a
   - Planned for Phase 4

2. **Single Encryption Key**
   - Multi-key rotation not yet implemented
   - Manual migration required for key rotation

3. **No Token Binding**
   - Tokens not bound to specific client IPs
   - Replay attacks possible if token stolen

4. **No Automatic Revocation**
   - No webhook for provider revocation events
   - User must manually disconnect

---

## Security Contact

Report security vulnerabilities to: [INSERT EMAIL]

**PGP Key:** [INSERT KEY]

**Response Time:** 24 hours for critical issues

---

## See Also

- [Configuration Guide](./configuration.md) - Hardening options
- [Observability](./observability.md) - Monitoring & alerts
- [FAQ](./faq.md) - Common issues
