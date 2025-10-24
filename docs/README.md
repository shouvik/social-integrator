# OAuth Data Connector SDK - Documentation

**Project Status:** Design Complete (v1.1) - Ready for Implementation  
**Last Updated:** October 2025

---

## 📚 Documentation Overview

This directory contains the complete design documentation for the OAuth Data Connector SDK - a unified TypeScript platform for managing OAuth flows, token lifecycle, and normalized data fetching across multiple providers (Google, GitHub, Reddit, X/Twitter, RSS).

---

## 📖 Reading Guide

### Start Here
1. **[PRD - Product Requirements](data-connector-prd.md)** (v1.2)
   - Read first to understand the project vision
   - Covers scope, provider matrix, success metrics
   - Consolidation strategy (single AuthCore, HttpCore, TokenStore)

### For Architects & Technical Leads
2. **[HLD - High-Level Design](high-level-design.md)** (v1.1)
   - System architecture and component overview
   - Deployment architecture (Docker, Node.js, Redis, PostgreSQL)
   - Security, observability, scalability strategy
   - Technology stack and dependencies
   - **v1.1 Updates:** Summary of critical fixes from design review

### For Engineers & Implementers
3. **[LLD - Low-Level Design](low-level-design.md)** (v1.1)
   - ⚠️ **START WITH SECTION 0** - Critical implementation notes
   - Complete module structure and file organization
   - Detailed TypeScript interfaces and type definitions
   - Full implementations for all core components
   - Provider connector examples (GitHub, Google, etc.)
   - Database schemas, error hierarchy, testing strategy
   - Docker configuration and deployment
   - **v1.1 Updates:** All design review fixes consolidated

---

## 🎯 Quick Start for Developers

### Before Writing Any Code

1. ✅ Read **PRD Section 2** (Consolidation Strategy)
2. ✅ Read **LLD Section 0** (Critical Implementation Notes) - **MUST READ**
3. ✅ Review **LLD Section 2** (Core Interfaces & Types)
4. ✅ Check **LLD Section 8** (Implementation Checklist)

### Critical Fixes in v1.1

**All designs updated to v1.1 with fixes for:**
1. **TokenStore TTL** - Expired tokens now kept for 5 minutes to allow refresh
2. **Redis Connection** - DistributedRefreshLock awaits connection before use
3. **SDK Initialization** - Dependencies built before `this.core` assignment
4. **ETag Caching** - Conditional requests with `If-None-Match` header
5. **Rate Limiting** - Queue properly wraps HTTP requests
6. **Token Behavior** - Explicit `{ includeExpired: true }` required for refresh flows
7. **Timestamps** - All `publishedAt` fields are ISO 8601 strings

**Status:** All design review blockers resolved ✅

---

## 🏗️ Implementation Roadmap

### Phase 1: Core Foundation (Weeks 1-2)
- [ ] AuthCore (OAuth2 + PKCE + OAuth1.0a)
- [ ] HttpCore (Rate limiting + Retries + ETag caching)
- [ ] TokenStore (Redis/Postgres + Encryption)
- [ ] DistributedRefreshLock (Redis-based)
- [ ] Normalizer
- [ ] Unit tests

### Phase 2: Initial Providers (Weeks 3-4)
- [ ] GoogleConnector (Gmail + Calendar)
- [ ] GitHubConnector (REST + optional Octokit)
- [ ] Integration tests
- [ ] Example application

### Phase 3: Additional Providers (Weeks 5-6)
- [ ] RedditConnector
- [ ] RSSConnector
- [ ] PostgreSQL TokenStore
- [ ] Performance benchmarks

### Phase 4: Twitter & Polish (Weeks 7-8)
- [ ] TwitterConnector (OAuth2 + OAuth1)
- [ ] Prometheus metrics dashboard
- [ ] Security audit
- [ ] Documentation & examples
- [ ] Production deployment guide

---

## 📊 Key Metrics & Targets

| Metric | Target | Notes |
|--------|--------|-------|
| New provider integration | ≤ 150 LOC | Plus tests |
| Token refresh success | ≥ 99% | Over 30 days |
| OAuth flow success | ≥ 99.9% | End-to-end |
| Fetch latency (p95) | < 1s | Excluding provider time |
| Test coverage | ≥ 85% | All modules |

---

## 🔒 Security Highlights

- **PKCE Required:** All OAuth2 flows use S256 code challenge
- **Token Encryption:** AES-256-GCM at rest
- **Log Redaction:** No plaintext tokens in logs
- **Key Rotation:** Multi-key decryption support
- **Distributed Locks:** Prevent refresh storms across instances
- **HTTPS Only:** All OAuth flows over TLS 1.2+

---

## 🛠️ Technology Stack

### Core
- Node.js 20+ LTS
- TypeScript 5.x
- openid-client (OAuth2/OIDC)
- axios (HTTP)
- p-queue (Rate limiting)
- keyv (Token storage)
- zod (Validation)

### Infrastructure
- Docker & Docker Compose
- Redis (Token cache + distributed locks)
- PostgreSQL (Token persistence)
- Prometheus (Metrics)

### Optional Provider SDKs
- @octokit/core (GitHub)
- twitter-api-v2 (Twitter/X)
- rss-parser (RSS)

---

## 📝 Documentation Structure

```
docs/
├── README.md                    # This file
├── data-connector-prd.md        # Product requirements (v1.2)
├── high-level-design.md         # Architecture & deployment (v1.1)
└── low-level-design.md          # Implementation details (v1.1)
```

**All temporary fix documents have been consolidated into the main HLD and LLD.**

---

## 🚀 Next Steps

1. **Review Team:** Approve LLD v1.1 design
2. **Setup Project:** Initialize repository, TypeScript config, Docker
3. **Phase 1 Start:** Begin with critical components (see LLD Section 0)
4. **Test-Driven:** Write acceptance tests before implementation
5. **Iterate:** Weekly reviews and adjustments

---

## 📞 Support & Questions

**Design Questions:**
- See LLD Section 0 for implementation notes
- See HLD Section 5 for security architecture
- See PRD Section 2 for consolidation strategy

**Architecture Questions:**
- See HLD for system-level decisions
- See LLD for component-level details

**Provider Integration:**
- See LLD Section 4 (Connector Implementations)
- See PRD Section 6 (Provider Capability Matrix)

---

**Version:** 1.1  
**Status:** Design Complete ✅  
**Ready for:** Phase 1 Implementation  
**Last Review:** October 2025

