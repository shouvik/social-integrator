# Issue: Address Audit Findings from SDK Code Review

## Summary
A recent deep technical audit uncovered multiple gaps between the SDK implementation and the documented product claims. This issue tracks the remediation work required to bring the codebase in line with the advertised behavior and to improve robustness across connectors and core services.

## Affected Areas
- Configuration validation and OAuth flow handling
- Provider connectors (GitHub, Google, Reddit, Twitter/X, RSS)
- Token management and normalization layers
- Observability (metrics/logging)
- Rate limiting, caching, and circuit breaker primitives

## Tasks
- [ ] **Respect configurable redirect URIs**: Update every OAuth connector to use provider configuration for redirect URIs instead of environment variables, ensuring alignment with the documented initialization flow.
- [ ] **Fix Twitter/X registration aliasing**: Ensure the `'x'` provider key maps to AuthCore metadata correctly (e.g., clone config or adjust connector naming) so that `sdk.connect('x', ...)` works without duplicate config entries.
- [ ] **Support Google Calendar normalization**: Implement a dedicated Google Calendar mapper (and associated connector logic) that produces valid normalized records instead of reusing the Gmail mapper.
- [ ] **Wire advertised metrics**: Increment `http_requests_total`, update `rate_limit_queue_size`, and verify the metrics collector exports all counters/gauges mentioned in the README.
- [ ] **Improve rate limiting accuracy**: Handle fractional QPS values without rounding up, and confirm queue size metrics reflect real-time backlog.
- [ ] **Honor OAuth configuration flags**: Respect `usePKCE`, `prompt`, and `loginHint` settings when building authorization URLs.
- [ ] **Clarify or implement OAuth1 support**: Either integrate `OAuth1Client` with a connector (e.g., Twitter) and extend configuration validation for OAuth1 metadata, or update documentation to remove the OAuth1.0a claim.
- [ ] **TokenStore cleanup**: Use the configured provider list in `listTokens` and either honor or remove the undocumented `ttl` option to avoid confusion.
- [ ] **Documented observability gaps**: Add tracing hooks (or adjust docs) and ensure logging/metrics cover cache hits, retries, and circuit breaker state transitions.
- [ ] **Add automated coverage**: Introduce integration tests for provider connectors and distributed refresh locking to prevent regressions in OAuth flows and token deduplication.

## References
- Audit summary highlighting discrepancies between README claims and implementation behavior.

Please break this work into smaller PRs where appropriate and keep documentation in sync with any behavioral changes.
