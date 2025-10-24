# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Status:** Design Complete (v1.1) - Implementation Phase Not Started

This repository contains complete design documentation for an **OAuth Data Connector SDK** - a unified TypeScript platform for managing OAuth flows, token lifecycle, and normalized data fetching across multiple providers (Google, GitHub, Reddit, X/Twitter, RSS).

**Important:** This is a **documentation-only repository** at this stage. The `/docs` directory contains comprehensive product requirements, high-level design, and low-level design documents. No implementation code exists yet.

## Repository Structure

```
docs/
├── README.md                    # Documentation overview and quick start
├── data-connector-prd.md        # Product Requirements Document (v1.2)
├── high-level-design.md         # System Architecture (v1.1)
└── low-level-design.md          # Implementation Details (v1.1)
```

## Reading Order for Implementation

Before writing any code, read documents in this order:

1. **PRD (data-connector-prd.md)** - Understand project vision and consolidation strategy
2. **LLD Section 0 (low-level-design.md)** - **CRITICAL IMPLEMENTATION NOTES** - Must read before coding
3. **HLD (high-level-design.md)** - System architecture and deployment strategy
4. **LLD Sections 1-13 (low-level-design.md)** - Complete implementation specifications

## Critical Design Decisions (v1.1)

All designs have been updated to v1.1 with critical fixes:

### Fixed Issues from Design Review
1. **TokenStore TTL** - Expired tokens kept for 5 minutes to allow refresh (not immediately deleted)
2. **Redis Connection** - DistributedRefreshLock must await connection before use
3. **SDK Initialization** - Dependencies built before `this.core` assignment to prevent reference errors
4. **ETag Caching** - Conditional requests with `If-None-Match` header properly implemented
5. **Rate Limiting** - Queue properly executes HTTP requests (not just queued but never run)
6. **Token Behavior** - Explicit `{ includeExpired: true }` required for refresh flows
7. **Timestamps** - All `publishedAt` fields are ISO 8601 strings (not Date objects)

## Core Architecture Principles

### Consolidation Strategy (PRD Section 2)
- **Single AuthCore** - One OAuth engine for all providers (OAuth2/OIDC/OAuth1.0a)
- **Single HttpCore** - Unified HTTP client with rate limiting and retries
- **Single TokenStore** - Centralized token management with encryption
- **Plugin Architecture** - Provider-specific logic in isolated connectors

### Technology Stack
- **Runtime:** Node.js 20+ LTS
- **Language:** TypeScript 5.x
- **OAuth:** openid-client (OAuth2/OIDC)
- **HTTP:** axios (with p-queue for rate limiting)
- **Storage:** keyv (abstraction over Redis/PostgreSQL)
- **Validation:** zod
- **Infrastructure:** Docker, Redis, PostgreSQL, Prometheus

## Implementation Phases

### Phase 1: Core Foundation (Weeks 1-2)
- AuthCore (OAuth2 + PKCE + OAuth1.0a)
- HttpCore (Rate limiting + Retries + ETag caching)
- TokenStore (Redis/Postgres + Encryption)
- DistributedRefreshLock (Redis-based)
- Normalizer
- Unit tests

### Phase 2: Initial Providers (Weeks 3-4)
- GoogleConnector (Gmail + Calendar)
- GitHubConnector (REST + optional Octokit)
- Integration tests
- Example application

### Phase 3: Additional Providers (Weeks 5-6)
- RedditConnector
- RSSConnector
- PostgreSQL TokenStore
- Performance benchmarks

### Phase 4: Twitter & Polish (Weeks 7-8)
- TwitterConnector (OAuth2 + OAuth1)
- Prometheus metrics dashboard
- Security audit
- Documentation & examples
- Production deployment guide

## Key Metrics & Targets

| Metric | Target |
|--------|--------|
| New provider integration | ≤ 150 LOC (plus tests) |
| Token refresh success | ≥ 99% over 30 days |
| OAuth flow success | ≥ 99.9% end-to-end |
| Fetch latency (p95) | < 1s (excluding provider time) |
| Test coverage | ≥ 85% all modules |

## Security Requirements

- **PKCE Required** - All OAuth2 flows use S256 code challenge
- **Token Encryption** - AES-256-GCM at rest
- **Log Redaction** - No plaintext tokens in logs
- **Key Rotation** - Multi-key decryption support
- **Distributed Locks** - Prevent refresh storms across instances
- **HTTPS Only** - All OAuth flows over TLS 1.2+

## Module Structure (from LLD Section 1)

When implementing, follow this structure:
```
oauth-connector-sdk/
├── src/
│   ├── core/                    # Core layer (AuthCore, HttpCore, TokenStore, Normalizer)
│   ├── connectors/              # Provider implementations (BaseConnector, google/, github/, etc.)
│   ├── observability/           # Metrics, logging, tracing
│   ├── config/                  # Configuration and provider registry
│   └── utils/                   # Error hierarchy, crypto, helpers
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/                # Nock recordings
└── docker/                      # Deployment configuration
```

## Before Starting Implementation

Read **LLD Section 0** which contains:
- TokenStore TTL calculation formulas
- DistributedRefreshLock async initialization patterns
- SDK constructor dependency ordering
- HttpCore ETag and rate limiting implementation notes
- Token retrieval behavior specifications
- Provider mapper timestamp formatting requirements

## Testing Strategy

- **Unit Tests** - Vitest for core components
- **Integration Tests** - Nock for HTTP mocking
- **E2E Tests** - Full OAuth flows with test providers
- **Contract Tests** - Provider response fixtures

## Version Information

- **PRD Version:** 1.2 (Consolidation strategy defined)
- **HLD Version:** 1.1 (Design review fixes applied)
- **LLD Version:** 1.1 (All blockers resolved)
- **Status:** Design Complete ✅ - Ready for Phase 1 Implementation
