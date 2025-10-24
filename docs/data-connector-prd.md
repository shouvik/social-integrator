# OAuth Data Connector SDK - Product Requirements

## 1. Purpose & Scope
Create a reusable **TypeScript SDK** that unifies **auth, token storage, rate‑limited HTTP, and normalized data fetching** for: **Google (Gmail/Calendar), GitHub, Reddit, X/Twitter, RSS**, with a plugin system for more providers.

**Core Principle:** *Integrate, don’t replicate* — but **centralize shared concerns** to avoid duplicated logic and security drift.

---

## 2. Consolidation Strategy (Overlapping SDKs → One Core)
### 2.1 Single AuthCore
- **Primary:** `openid-client` for OAuth2/OIDC (Authorization Code + PKCE, Client Credentials where applicable, and Device Code where available).  
- **OAuth 1.0a support:** thin internal module for legacy endpoints (needed for some X/Twitter flows).  
- **Policy:** Provider plugins **must** request tokens via AuthCore; direct token juggling inside plugins is disallowed.

### 2.2 Single HttpCore
- **HTTP:** `axios` with interceptors for auth headers, retries, telemetry.  
- **Rate limiting & concurrency:** `p-queue` (per‑provider buckets), exponential backoff + jitter.  
- **Cross‑cutting:** automatic 429/5xx retry, structured errors, request id propagation.

### 2.3 Single TokenStore
- **Abstraction:** `Keyv` with drivers (Memory, Redis, Postgres).  
- **Security:** at‑rest encryption hook, key rotation hook, secret masking in logs.  
- **Contract:** `getToken(userId, provider)`, `setToken(...)`, `deleteToken(...)`, **events**: `tokenRefreshed`, `tokenExpiredSoon`.

### 2.4 When to use Provider SDKs (Adapters)
Use a provider SDK **only** if it gives material advantage beyond raw REST:
- **GitHub:** `@octokit/*` for pagination, conditional requests, ETags.  
- **Reddit:** `snoowrap` is optional; raw REST via HttpCore is the default to keep parity.  
- **X/Twitter:** `twitter-api-v2` for endpoint ergonomics; Auth still handled by AuthCore when using OAuth2; OAuth1 signed requests piped via our OAuth1 module.  
- **Google:** Prefer raw REST via HttpCore (gmail/calendar endpoints). `googleapis` can be optional if it meaningfully reduces code for specific flows.

**Rule:** Even when using a provider SDK, **transport is routed through HttpCore** and **tokens sourced from AuthCore** to keep observability and limits centralized.

---

## 3. Architecture (Consolidated)

```
                           ┌───────────────────────────────────┐
                           │          Your Application         │
                           │  (AI, Dashboards, Backends)       │
                           └───────────────┬───────────────────┘
                                           │  SDK.init()
                                           ▼
                    ┌──────────────────────────────────────────┐
                    │      OAuth Data Connector SDK (TS)       │
                    ├───────────────────────┬──────────────────┤
                    │        Core Layer     │  Plugin Layer    │
                    │                       │                  │
     ┌──────────────┼───────────────┐       │   ┌──────────────┼─────────────────┐
     │  AuthCore    │  HttpCore     │       │   │ GoogleConnector (Gmail/Cal)    │
     │ (openid-     │ (axios +      │       │   │  - uses AuthCore tokens        │
     │  client +    │  p-queue)     │       │   │  - REST via HttpCore           │
     │  OAuth1 mod) │  retries)     │       │   ├────────────────────────────────┤
     ├──────────────┼───────────────┤       │   │ GitHubConnector                │
     │  TokenStore  │  Normalizer   │       │   │  - Octokit *adapter* optional  │
     │  (Keyv)      │  (JSON→model) │       │   │  - Transport via HttpCore      │
     └──────────────┴───────────────┘       │   ├────────────────────────────────┤
                    ▲                       │   │ RedditConnector                │
                    │ Events: tokenRefreshed │   │  - REST default; snoowrap opt │
                    │ requestFailed, rateHit │   ├────────────────────────────────┤
                    │                       │   │ X/TwitterConnector             │
                    │                       │   │  - OAuth2 via AuthCore         │
                    │                       │   │  - OAuth1 via our signer       │
                    │                       │   ├────────────────────────────────┤
                    │                       │   │ RSSConnector (rss-parser)      │
                    └───────────────────────┴───┴────────────────────────────────┘
```

**Why this works:** one **AuthCore** + one **HttpCore** = consistent telemetry, retries, limits, and security. Provider SDKs become **thin adapters** instead of parallel stacks.

---

## 4. Data Flow (Unified)
1. `SDK.init()` wires **AuthCore**, **HttpCore**, **TokenStore**, registers connectors.  
2. `SDK.connect('google', userId)` → AuthCore creates auth URL (PKCE) → callback → TokenStore persists.  
3. `SDK.fetch('github', userId, params)` → connector builds request → **HttpCore** executes with the token from **AuthCore/TokenStore** → response → **Normalizer** → unified items.  
4. Refresh/expiry handled centrally; connectors never implement refresh logic.

---

## 5. Public API (unchanged surface, stronger guarantees)

```ts
type ProviderName = 'google' | 'github' | 'reddit' | 'x' | 'rss';

class ConnectorSDK {
  static init(config: InitConfig): ConnectorSDK;

  connect(provider: ProviderName, userId: string, opts?: ConnectOptions): Promise<string>; // auth URL
  handleCallback(provider: ProviderName, userId: string, params: URLSearchParams): Promise<TokenSet>;

  fetch(provider: ProviderName, userId: string, params?: FetchParams): Promise<NormalizedItem[]>;

  disconnect(provider: ProviderName, userId: string): Promise<void>;
  refresh(provider: ProviderName, userId: string): Promise<TokenSet>; // exposed but usually automatic

  registerConnector(provider: ProviderName, impl: Connector): void;
}
```

**Guarantees**
- All requests run through **HttpCore** (with shared rate limits).  
- All tokens originate from **AuthCore** (central refresh, rotation).  
- **TokenStore** is the single source of truth.  
- **Normalizer** ensures consistent output across providers.

---

## 6. Provider Capability Matrix
| Provider | OAuth Flow | API Access | SDK Adapter? | Notes |
|---------|------------|------------|--------------|------|
| Google (Gmail/Cal) | OAuth2 Code + PKCE | REST | Optional (`googleapis`) | Default: REST via HttpCore |
| GitHub | OAuth2 Code + PKCE | REST/GraphQL | Optional (`octokit`) | Uses ETags, pagination helpers if adapter enabled |
| Reddit | OAuth2 (script/web app) | REST | Optional (`snoowrap`) | Rate limits enforced via HttpCore |
| X/Twitter | OAuth2 Code + PKCE; OAuth1.0a | REST | Optional (`twitter-api-v2`) | OAuth1 signer available in AuthCore |
| RSS | — | HTTP/Feed | `rss-parser` | No OAuth; uses HttpCore for fetching feeds |

---

## 7. Normalized Data Schema (same as v1.1)

```ts
interface NormalizedItem {
  id: string;
  source: string;
  externalId: string;
  userId: string;
  title?: string;
  bodyText?: string;
  url?: string;
  author?: string;
  publishedAt?: Date;
  metadata?: Record<string, any>;
}
```

---

## 8. Non‑Functional Standards
- **Security:** single token pathway; redact tokens in logs; encrypt at rest via TokenStore hooks.  
- **Performance:** batched requests, HTTP keep‑alive, ETag/If‑None‑Match support in HttpCore.  
- **Observability:** per‑provider metrics (qps, error rate, 429s, avg latency), correlation ids.  
- **Testing:** Nock-powered HTTP mocks; contract tests for each connector against recorded fixtures.  
- **Versioning:** SemVer; providers released independently behind stable core.

---

## 9. OSS Reuse Policy (hard rules)
- If a provider SDK **duplicates** Auth or HTTP concerns, those parts are **disabled**; only higher‑level helpers are used.  
- No plugin may read/write tokens outside **AuthCore/TokenStore**.  
- All network traffic must pass via **HttpCore** interceptors.  
- Any new provider PR must include a **capability table** and **normalization tests**.

---

## 10. Roadmap
- **v0.1**: Core (AuthCore/HttpCore/TokenStore/Normalizer) + Google + GitHub.  
- **v0.2**: Reddit + RSS; add Device Code support in AuthCore where applicable.  
- **v0.3**: X/Twitter (OAuth2 + OAuth1); signed‑request helper; fine‑grained rate buckets.  
- **v0.4**: Browser helper (PKCE only), Postgres TokenStore, observability dashboard.  
- **v1.0**: GA; plugin marketplace template; extensive docs & examples.

---

## 11. Example: GitHub Connector using the Core
```ts
export class GithubConnector implements Connector {
  constructor(private core: CoreDeps) {} // { auth, http, tokens, normalize }

  async fetch(userId: string, params: { type: 'starred' | 'repos'; page?: number }) {
    const token = await this.core.tokens.getToken(userId, 'github');
    const url = params.type === 'starred'
      ? 'https://api.github.com/user/starred'
      : 'https://api.github.com/user/repos';

    const res = await this.core.http.get(url, {
      headers: { Authorization: `Bearer ${token.accessToken}`, Accept: 'application/vnd.github+json' },
      query: { per_page: 50, page: params.page ?? 1 },
      etagKey: { userId, provider: 'github', resource: params.type } // enables 304 + caching
    });

    return res.data.map(this.core.normalize.github);
  }
}
```

---

## 12. Success Metrics
- **Single** OAuth engine covers ≥ 95% of flows; OAuth1 used only when necessary.  
- New provider integration ≤ **150 LOC** + tests.
- ≤ **1%** token refresh failures over 30 days.
- **p95** end‑to‑end fetch latency stable under configured limits.