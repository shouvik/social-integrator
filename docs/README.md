# OAuth Data Connector SDK - Documentation

---

## 📚 Documentation Overview

This directory contains the complete design documentation for the OAuth Data Connector SDK - a unified TypeScript platform for managing OAuth flows, token lifecycle, and normalized data fetching across multiple providers (Google, GitHub, Reddit, X/Twitter, RSS).

---

## 📖 Reading Guide

### Documentation Structure

1. **[PRD - Product Requirements](data-connector-prd.md)**
   - Project vision, scope, and objectives
   - Provider capability matrix
   - Consolidation strategy (single AuthCore, HttpCore, TokenStore)
   - Success metrics

2. **[HLD - High-Level Design](high-level-design.md)**
   - System architecture and component overview
   - Deployment architecture (Docker, Node.js, Redis, PostgreSQL)
   - Security, observability, and scalability strategy
   - Technology stack and dependencies

3. **[LLD - Low-Level Design](low-level-design.md)**
   - Complete module structure and file organization
   - Detailed TypeScript interfaces and type definitions
   - Full implementations for all core components
   - Provider connector examples (GitHub, Google, etc.)
   - Database schemas, error hierarchy, testing strategy
   - Docker configuration and deployment

4. **[Configuration Guide](configuration.md)**
   - SDK initialization options
   - Provider OAuth setup
   - Token store configuration
   - Rate limiting and HTTP settings

5. **[Troubleshooting Guide](troubleshooting.md)**
   - Common issues and solutions
   - Error message reference
   - Debug logging
   - Performance optimization

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
├── data-connector-prd.md        # Product requirements
├── high-level-design.md         # Architecture & deployment
├── low-level-design.md          # Implementation details
├── configuration.md             # Configuration reference
└── troubleshooting.md           # Troubleshooting guide
```