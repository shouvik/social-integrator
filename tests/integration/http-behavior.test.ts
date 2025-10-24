/**
 * HTTP Behavior Integration Tests
 *
 * Tests ETag caching, 429 rate limit handling, and retry behavior
 * to ensure HTTP client behaves correctly under various conditions.
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectorSDK } from '../../src/sdk';
import { HttpCore } from '../../src/core/http/HttpCore';
import type { InitConfig } from '../../src/sdk';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';

describe('HTTP Behavior Integration', () => {
  let sdk: ConnectorSDK;
  let mockServer: Server;
  let mockServerUrl: string;
  const userId = 'http-test-user';

  beforeEach(async () => {
    // Start mock server
    mockServer = await createMockServer();
    const address = mockServer.address() as AddressInfo;
    mockServerUrl = `http://localhost:${address.port}`;

    // Create SDK with test config pointing to mock server
    const testConfig: InitConfig = {
      tokenStore: {
        backend: 'memory',
        preRefreshMarginMinutes: 5,
        expiredTokenBufferMinutes: 5,
      },
      http: {
        timeout: 5000,
        retry: {
          maxRetries: 3,
          baseDelay: 100,
          maxDelay: 1000,
          retryableStatusCodes: [429, 500, 502, 503, 504],
        },
      },
      rateLimits: {
        github: { qps: 10, concurrency: 5 },
        google: { qps: 5, concurrency: 3 },
        reddit: { qps: 2, concurrency: 2 },
        twitter: { qps: 1, concurrency: 1 },
        x: { qps: 1, concurrency: 1 },
        rss: { qps: 20, concurrency: 10 },
      },
      providers: {
        github: {
          clientId: 'test-client-id',
          clientSecret: 'test-secret',
          scopes: ['user:email'],
          redirectUri: 'http://localhost:3000/callback/github',
          usePKCE: true,
        },
      },
      metrics: { enabled: true },
      logging: { level: 'debug' },
    };

    sdk = await ConnectorSDK.init(testConfig);
  });

  afterEach(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => {
        mockServer.close(() => resolve());
      });
    }
  });

  describe('ETag Caching Behavior', () => {
    it('should send If-None-Match header on subsequent requests', async () => {
      let requestCount = 0;
      let receivedETag = false;

      const mockResponses = [
        // First request - return data with ETag
        {
          status: 200,
          headers: { etag: '"test-etag-123"' },
          body: { data: 'first response' },
        },
        // Second request - should receive If-None-Match header
        {
          status: 304,
          headers: {},
          body: '',
        },
      ];

      setupMockServerResponses(mockServer, '/api/test', (req, res) => {
        const response = mockResponses[requestCount];
        requestCount++;

        if (requestCount === 2) {
          // Check for If-None-Match header on second request
          receivedETag = req.headers['if-none-match'] === '"test-etag-123"';
        }

        res.writeHead(response.status, response.headers);
        res.end(typeof response.body === 'string' ? response.body : JSON.stringify(response.body));
      });

      const httpCore = (sdk as any).core.http as HttpCore;
      const etagKey = { userId, provider: 'github', resource: 'test' };

      // First request
      const response1 = await httpCore.request({
        url: `${mockServerUrl}/api/test`,
        method: 'GET',
        etagKey,
      });

      expect(response1.status).toBe(200);
      expect(response1.data).toEqual({ data: 'first response' });

      // Second request - should use If-None-Match
      const response2 = await httpCore.request({
        url: `${mockServerUrl}/api/test`,
        method: 'GET',
        etagKey,
      });

      expect(receivedETag).toBe(true);
      expect(response2.status).toBe(304);
      expect(response2.cached).toBe(true);
      expect(response2.data).toEqual({ data: 'first response' });
    });

    it('should update cache when ETag changes', async () => {
      let requestCount = 0;

      const mockResponses = [
        {
          status: 200,
          headers: { etag: '"etag-v1"' },
          body: { version: 1 },
        },
        {
          status: 200,
          headers: { etag: '"etag-v2"' },
          body: { version: 2 },
        },
      ];

      setupMockServerResponses(mockServer, '/api/versioned', (req, res) => {
        const response = mockResponses[requestCount];
        requestCount++;

        res.writeHead(response.status, response.headers);
        res.end(JSON.stringify(response.body));
      });

      const httpCore = (sdk as any).core.http as HttpCore;
      const etagKey = { userId, provider: 'github', resource: 'versioned' };

      // First request
      const response1 = await httpCore.request({
        url: `${mockServerUrl}/api/versioned`,
        method: 'GET',
        etagKey,
      });

      expect(response1.data).toEqual({ version: 1 });

      // Second request - new ETag, should get new data
      const response2 = await httpCore.request({
        url: `${mockServerUrl}/api/versioned`,
        method: 'GET',
        etagKey,
      });

      expect(response2.data).toEqual({ version: 2 });
      expect(response2.cached).toBeUndefined();
    });
  });

  describe('Rate Limit Handling (429)', () => {
    it('should retry on 429 with backoff', async () => {
      let requestCount = 0;
      const retryAfterSeconds = 1;

      setupMockServerResponses(mockServer, '/api/rate-limited', (req, res) => {
        requestCount++;

        if (requestCount < 3) {
          // First two requests return 429
          res.writeHead(429, {
            'retry-after': retryAfterSeconds.toString(),
            'content-type': 'application/json',
          });
          res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
        } else {
          // Third request succeeds
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        }
      });

      const httpCore = (sdk as any).core.http as HttpCore;
      const startTime = Date.now();

      const response = await httpCore.request({
        url: `${mockServerUrl}/api/rate-limited`,
        method: 'GET',
      });

      const elapsed = Date.now() - startTime;

      expect(requestCount).toBe(3);
      expect(response.status).toBe(200);
      expect(response.data).toEqual({ success: true });
      // Should have waited for retries
      expect(elapsed).toBeGreaterThan(200); // Some delay from retries
    });

    it('should fail after max retries exceeded', async () => {
      let requestCount = 0;

      setupMockServerResponses(mockServer, '/api/always-rate-limited', (req, res) => {
        requestCount++;
        res.writeHead(429, {
          'retry-after': '1',
          'content-type': 'application/json',
        });
        res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
      });

      const httpCore = (sdk as any).core.http as HttpCore;

      await expect(
        httpCore.request({
          url: `${mockServerUrl}/api/always-rate-limited`,
          method: 'GET',
        })
      ).rejects.toThrow();

      // Should have made maxRetries + 1 attempts (initial + retries)
      expect(requestCount).toBe(4); // 1 initial + 3 retries
    });
  });

  describe('Server Error Retry Behavior', () => {
    it('should retry on 500 errors', async () => {
      let requestCount = 0;

      setupMockServerResponses(mockServer, '/api/server-error', (req, res) => {
        requestCount++;

        if (requestCount < 2) {
          res.writeHead(500);
          res.end('Internal Server Error');
        } else {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ recovered: true }));
        }
      });

      const httpCore = (sdk as any).core.http as HttpCore;

      const response = await httpCore.request({
        url: `${mockServerUrl}/api/server-error`,
        method: 'GET',
      });

      expect(requestCount).toBe(2);
      expect(response.status).toBe(200);
      expect(response.data).toEqual({ recovered: true });
    });

    it('should not retry on 4xx client errors', async () => {
      let requestCount = 0;

      setupMockServerResponses(mockServer, '/api/client-error', (req, res) => {
        requestCount++;
        res.writeHead(400);
        res.end('Bad Request');
      });

      const httpCore = (sdk as any).core.http as HttpCore;

      await expect(
        httpCore.request({
          url: `${mockServerUrl}/api/client-error`,
          method: 'GET',
        })
      ).rejects.toThrow();

      // Should not retry on 400
      expect(requestCount).toBe(1);
    });
  });

  describe('Metrics Recording', () => {
    it('should record http_requests_total for all requests', async () => {
      const metrics = (sdk as any).core.metrics;
      const incrementSpy = vi.spyOn(metrics, 'incrementCounter');

      setupMockServerResponses(mockServer, '/api/metrics-test', (req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ test: 'data' }));
      });

      const httpCore = (sdk as any).core.http as HttpCore;

      await httpCore.request({
        url: `${mockServerUrl}/api/metrics-test`,
        method: 'GET',
      });

      // Should record both initiated and final status
      expect(incrementSpy).toHaveBeenCalledWith(
        'http_requests_total',
        expect.objectContaining({ status: 'initiated' })
      );
      expect(incrementSpy).toHaveBeenCalledWith(
        'http_requests_total',
        expect.objectContaining({ status: '200' })
      );
    });

    it('should record rate_limit_queue_size gauge', async () => {
      const metrics = (sdk as any).core.metrics;
      const gaugeSpy = vi.spyOn(metrics, 'recordGauge');

      setupMockServerResponses(mockServer, '/api/queue-test', (req, res) => {
        // Add delay to ensure queue size tracking
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ queued: true }));
        }, 50);
      });

      const httpCore = (sdk as any).core.http as HttpCore;

      // Make multiple concurrent requests to trigger queueing
      await Promise.all([
        httpCore.request({
          url: `${mockServerUrl}/api/queue-test`,
          method: 'GET',
        }),
        httpCore.request({
          url: `${mockServerUrl}/api/queue-test`,
          method: 'GET',
        }),
      ]);

      expect(gaugeSpy).toHaveBeenCalledWith(
        'rate_limit_queue_size',
        expect.any(Number),
        expect.any(Object)
      );
    });
  });

  describe('Circuit Breaker Behavior', () => {
    it('should open circuit breaker after consecutive failures', async () => {
      let requestCount = 0;

      setupMockServerResponses(mockServer, '/api/circuit-test', (req, res) => {
        requestCount++;
        // Always return 500 to trigger circuit breaker
        res.writeHead(500);
        res.end('Server Error');
      });

      const httpCore = (sdk as any).core.http as HttpCore;

      // Make multiple requests to trigger circuit breaker
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          httpCore
            .request({
              url: `${mockServerUrl}/api/circuit-test`,
              method: 'GET',
            })
            .catch(() => null)
        );
      }

      await Promise.allSettled(promises);

      // Circuit breaker should have prevented some requests
      expect(requestCount).toBeLessThan(10);
    });
  });
});

/**
 * Helper functions for mock server setup
 */
async function createMockServer(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => {
      resolve(server);
    });
  });
}

function setupMockServerResponses(
  server: Server,
  path: string,
  handler: (req: any, res: any) => void
): void {
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    if (req.url === path) {
      handler(req, res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
}
