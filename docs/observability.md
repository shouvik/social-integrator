# Observability

The OAuth Connector SDK provides comprehensive observability through metrics, logging, and optional distributed tracing.

## Prometheus Metrics

### Configuration

```typescript
const sdk = await ConnectorSDK.init({
  metrics: {
    enabled: true,
    port: 9090, // Metrics endpoint port
    path: '/metrics', // Metrics endpoint path (default)
  },
});
```

### Scrape Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'oauth-connector-sdk'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:9090']
```

### Available Metrics

| Metric                                  | Type      | Labels                         | Description                          |
| --------------------------------------- | --------- | ------------------------------ | ------------------------------------ |
| `token_refresh_total`                   | Counter   | `provider`, `status`           | Total token refresh attempts         |
| `token_refresh_duration_seconds`        | Histogram | `provider`, `status`           | Token refresh latency                |
| `token_refresh_dedup_local_total`       | Counter   | `provider`                     | Deduplicated refreshes (local)       |
| `token_refresh_dedup_distributed_total` | Counter   | `provider`                     | Deduplicated refreshes (distributed) |
| `http_requests_total`                   | Counter   | `provider`, `method`, `status` | Total HTTP requests                  |
| `http_request_duration_seconds`         | Histogram | `provider`, `status`           | HTTP request latency                 |
| `http_cache_hits_total`                 | Counter   | `provider`                     | ETag cache hits                      |
| `rate_limit_queue_size`                 | Gauge     | `provider`                     | Current queue size                   |

## OpenTelemetry Tracing (Opt-in)

### Enable Tracing

```bash
# Environment variables
export OTEL_ENABLED=1
export OTEL_SERVICE_NAME=oauth-connector-sdk
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

### Initialize in Code

```typescript
import { initializeTracing } from 'oauth-connector-sdk/observability/tracing';

// Call once at app startup
initializeTracing();

const sdk = await ConnectorSDK.init({
  // ... config
});
```

### Span Types

- `HTTP GET/POST` - HTTP requests with method and URL
- `OAuth connect/callback/refresh` - OAuth operations
- `Token refresh/store/delete` - Token operations

### Jaeger Setup

```bash
docker run -d --name jaeger \
  -p 4318:4318 \
  -p 16686:16686 \
  jaegertracing/all-in-one:latest
```

View traces at http://localhost:16686

## Structured Logging

### Configuration

```typescript
const sdk = await ConnectorSDK.init({
  logging: {
    level: 'info', // debug | info | warn | error
    format: 'json', // json | pretty
  },
});
```

### Log Redaction

All sensitive data is automatically redacted:

- Access tokens
- Refresh tokens
- Client secrets
- Authorization codes

### Example Log Output (JSON)

```json
{
  "timestamp": "2024-10-24T12:30:00Z",
  "level": "info",
  "message": "Token refresh successful",
  "provider": "github",
  "userId": "user-123",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## See Also

- [Configuration Guide](./configuration.md)
- [Troubleshooting](./troubleshooting.md)
