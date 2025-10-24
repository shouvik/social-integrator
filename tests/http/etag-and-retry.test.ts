/**
 * HTTP behavior tests
 *
 * Tests:
 * 1. ETag caching with 304 Not Modified responses
 * 2. 429 Rate limiting with Retry-After header
 * 3. Jittered exponential backoff on failures
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { ConnectorSDK } from '../../src/sdk';

describe('HTTP Behavior: ETag Caching', () => {
  let sdk: ConnectorSDK;
  const testUserId = 'test-user-123';
  const mockEncryptionKey = '0'.repeat(64);

  beforeEach(async () => {
    sdk = await ConnectorSDK.init({
      tokenStore: {
        backend: 'memory',
        encryption: {
          key: mockEncryptionKey,
          algorithm: 'aes-256-gcm',
        },
      },
      providers: {
        github: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          authorizationEndpoint: 'https://github.com/login/oauth/authorize',
          tokenEndpoint: 'https://github.com/login/oauth/access_token',
          scopes: ['user', 'repo'],
          redirectUri: 'http://localhost:3000/callback/github',
          usePKCE: true,
        },
      },
      rateLimits: {
        github: { qps: 10, concurrency: 5 },
        google: { qps: 10, concurrency: 5 },
        reddit: { qps: 1, concurrency: 2 },
        twitter: { qps: 5, concurrency: 3 },
        x: { qps: 5, concurrency: 3 },
        rss: { qps: 1, concurrency: 2 },
      },
      http: {
        retry: {
          maxRetries: 3,
          baseDelay: 100,
          maxDelay: 1000,
          retryableStatusCodes: [429, 500, 502, 503, 504],
        },
      },
      logging: {
        level: 'error',
      },
    });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should cache response with ETag and send If-None-Match on subsequent requests', async () => {
    // Setup token - extract actual state from auth URL
    const authUrl = await sdk.connect('github', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://github.com').post('/login/oauth/access_token').reply(200, {
      access_token: 'gho_test_token',
      token_type: 'bearer',
      scope: 'user,repo',
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('github', testUserId, callbackParams);

    const testRepoData = [
      {
        id: 123456,
        name: 'test-repo',
        description: 'Test repository',
        html_url: 'https://github.com/user/test-repo',
        owner: { login: 'user' },
        created_at: '2024-01-15T10:30:00Z',
        stargazers_count: 42,
        language: 'TypeScript',
      },
    ];

    // First request: Returns data with ETag
    nock('https://api.github.com')
      .get('/user/starred')
      .query({ per_page: 10, page: 1, sort: 'updated', direction: 'desc' })
      .reply(200, testRepoData, {
        ETag: 'W/"abc123"',
        'Cache-Control': 'max-age=60',
      });

    const items1 = await sdk.fetch('github', testUserId, { type: 'starred', limit: 10 });

    expect(items1).toHaveLength(1);
    expect(items1[0].title).toBe('test-repo');

    // Second request: Should send If-None-Match and get 304
    nock('https://api.github.com')
      .get('/user/starred')
      .query({ per_page: 10, page: 1, sort: 'updated', direction: 'desc' })
      .matchHeader('if-none-match', 'W/"abc123"')
      .reply(304); // Not Modified

    const items2 = await sdk.fetch('github', testUserId, { type: 'starred', limit: 10 });

    // Should return cached data
    expect(items2).toHaveLength(1);
    expect(items2[0].title).toBe('test-repo');
  });

  it('should update cache when ETag changes', async () => {
    const authUrl = await sdk.connect('github', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://github.com').post('/login/oauth/access_token').reply(200, {
      access_token: 'gho_test_token',
      token_type: 'bearer',
      scope: 'user,repo',
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('github', testUserId, callbackParams);

    // First request with ETag v1
    nock('https://api.github.com')
      .get('/user/starred')
      .query({ per_page: 10, page: 1, sort: 'updated', direction: 'desc' })
      .reply(
        200,
        [{ id: 1, name: 'old-repo', owner: { login: 'user' }, created_at: '2024-01-01T00:00:00Z' }],
        {
          ETag: 'W/"v1"',
        }
      );

    const items1 = await sdk.fetch('github', testUserId, { type: 'starred', limit: 10 });
    expect(items1[0].title).toBe('old-repo');

    // Second request with new ETag
    nock('https://api.github.com')
      .get('/user/starred')
      .query({ per_page: 10, page: 1, sort: 'updated', direction: 'desc' })
      .matchHeader('if-none-match', 'W/"v1"')
      .reply(
        200,
        [{ id: 2, name: 'new-repo', owner: { login: 'user' }, created_at: '2024-01-15T00:00:00Z' }],
        {
          ETag: 'W/"v2"',
        }
      );

    const items2 = await sdk.fetch('github', testUserId, { type: 'starred', limit: 10 });
    expect(items2[0].title).toBe('new-repo');
  });
});

describe('HTTP Behavior: 429 Rate Limiting & Retry-After', () => {
  let sdk: ConnectorSDK;
  const testUserId = 'test-user-123';
  const mockEncryptionKey = '0'.repeat(64);

  beforeEach(async () => {
    sdk = await ConnectorSDK.init({
      tokenStore: {
        backend: 'memory',
        encryption: {
          key: mockEncryptionKey,
          algorithm: 'aes-256-gcm',
        },
      },
      providers: {
        github: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          authorizationEndpoint: 'https://github.com/login/oauth/authorize',
          tokenEndpoint: 'https://github.com/login/oauth/access_token',
          scopes: ['user', 'repo'],
          redirectUri: 'http://localhost:3000/callback/github',
          usePKCE: true,
        },
      },
      rateLimits: {
        github: { qps: 10, concurrency: 5 },
        google: { qps: 10, concurrency: 5 },
        reddit: { qps: 1, concurrency: 2 },
        twitter: { qps: 5, concurrency: 3 },
        x: { qps: 5, concurrency: 3 },
        rss: { qps: 1, concurrency: 2 },
      },
      http: {
        retry: {
          maxRetries: 3,
          baseDelay: 100,
          maxDelay: 1000,
          retryableStatusCodes: [429, 500, 502, 503, 504],
        },
      },
      logging: {
        level: 'error',
      },
    });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should respect Retry-After header (seconds) on 429 responses', async () => {
    const authUrl = await sdk.connect('github', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://github.com').post('/login/oauth/access_token').reply(200, {
      access_token: 'gho_test_token',
      token_type: 'bearer',
      scope: 'user,repo',
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('github', testUserId, callbackParams);

    const startTime = Date.now();

    // First attempt: 429 with Retry-After: 1 second
    nock('https://api.github.com')
      .get('/user/starred')
      .query({ per_page: 10, page: 1, sort: 'updated', direction: 'desc' })
      .reply(
        429,
        { message: 'API rate limit exceeded' },
        {
          'Retry-After': '1', // Wait 1 second
        }
      );

    // Second attempt: Success
    nock('https://api.github.com')
      .get('/user/starred')
      .query({ per_page: 10, page: 1, sort: 'updated', direction: 'desc' })
      .reply(200, []);

    await sdk.fetch('github', testUserId, { type: 'starred', limit: 10 });

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(1000); // Should wait at least 1 second
  });

  it('should retry with exponential backoff on 500 errors', async () => {
    const authUrl = await sdk.connect('github', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://github.com').post('/login/oauth/access_token').reply(200, {
      access_token: 'gho_test_token',
      token_type: 'bearer',
      scope: 'user,repo',
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('github', testUserId, callbackParams);

    // First two attempts fail
    nock('https://api.github.com')
      .get('/user/starred')
      .query({ per_page: 10, page: 1, sort: 'updated', direction: 'desc' })
      .reply(500, { message: 'Internal Server Error' });

    nock('https://api.github.com')
      .get('/user/starred')
      .query({ per_page: 10, page: 1, sort: 'updated', direction: 'desc' })
      .reply(500, { message: 'Internal Server Error' });

    // Third attempt succeeds
    nock('https://api.github.com')
      .get('/user/starred')
      .query({ per_page: 10, page: 1, sort: 'updated', direction: 'desc' })
      .reply(200, []);

    const items = await sdk.fetch('github', testUserId, { type: 'starred', limit: 10 });

    expect(items).toHaveLength(0);
  });

  it('should fail after max retries exhausted', async () => {
    const authUrl = await sdk.connect('github', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://github.com').post('/login/oauth/access_token').reply(200, {
      access_token: 'gho_test_token',
      token_type: 'bearer',
      scope: 'user,repo',
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('github', testUserId, callbackParams);

    // All attempts fail
    nock('https://api.github.com')
      .get('/user/starred')
      .query({ per_page: 10, page: 1, sort: 'updated', direction: 'desc' })
      .times(4) // Initial + 3 retries
      .reply(500, { message: 'Internal Server Error' });

    await expect(sdk.fetch('github', testUserId, { type: 'starred', limit: 10 })).rejects.toThrow();
  });
});
