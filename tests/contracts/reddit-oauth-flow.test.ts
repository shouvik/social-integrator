/**
 * Contract test: Reddit OAuth flow
 *
 * Tests Reddit-specific OAuth 2.0 quirks:
 * - duration=permanent for refresh tokens
 * - Specific User-Agent requirements
 * - Username fetch from /api/v1/me
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { ConnectorSDK } from '../../src/sdk';

describe('Reddit OAuth Flow Contract', () => {
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
        reddit: {
          clientId: 'test-reddit-client',
          clientSecret: 'test-reddit-secret',
          authorizationEndpoint: 'https://www.reddit.com/api/v1/authorize',
          tokenEndpoint: 'https://www.reddit.com/api/v1/access_token',
          scopes: ['identity', 'read', 'history'],
          redirectUri: 'http://localhost:3000/callback/reddit',
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

  it('should generate authorization URL with duration=permanent', async () => {
    const authUrl = await sdk.connect('reddit', testUserId);

    expect(authUrl).toContain('https://www.reddit.com/api/v1/authorize');
    expect(authUrl).toContain('duration=permanent'); // Critical for refresh tokens
    expect(authUrl).toContain('scope=identity%20read%20history');
  });

  it('should fetch username from /api/v1/me before user endpoints', async () => {
    // Setup token and extract real state
    const authUrl = await sdk.connect('reddit', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://www.reddit.com').post('/api/v1/access_token').reply(200, {
      access_token: 'reddit_access_token',
      refresh_token: 'reddit_refresh_token',
      token_type: 'bearer',
      expires_in: 3600,
      scope: 'identity read history',
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('reddit', testUserId, callbackParams);

    // Mock /api/v1/me to get username
    nock('https://oauth.reddit.com')
      .get('/api/v1/me')
      .matchHeader('user-agent', /oauth-connector-sdk/)
      .reply(200, {
        name: 'test_reddit_user',
        id: 't2_abc123',
      });

    // Mock saved posts endpoint using username
    nock('https://oauth.reddit.com')
      .get('/user/test_reddit_user/saved')
      .query({ limit: 10, raw_json: 1 })
      .reply(200, {
        kind: 'Listing',
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: 'abc123',
                title: 'Test post',
                selftext: 'Test content',
                url: 'https://reddit.com/r/test/comments/abc123',
                author: 'test_author',
                created_utc: 1705316400,
                subreddit: 'test',
                score: 42,
                num_comments: 5,
              },
            },
          ],
          after: null,
        },
      });

    const items = await sdk.fetch('reddit', testUserId, { type: 'saved', limit: 10 });

    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('reddit');
    expect(items[0].title).toBe('Test post');
  });

  it('should enforce strict User-Agent header', async () => {
    const authUrl = await sdk.connect('reddit', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://www.reddit.com').post('/api/v1/access_token').reply(200, {
      access_token: 'reddit_token',
      token_type: 'bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('reddit', testUserId, callbackParams);

    // Reddit requires specific User-Agent format
    nock('https://oauth.reddit.com')
      .get('/api/v1/me')
      .matchHeader('user-agent', /web:oauth-connector-sdk:v\d+\.\d+\.\d+ \(by \/u\/.*\)/)
      .reply(200, { name: 'test_user', id: 't2_123' });

    nock('https://oauth.reddit.com')
      .get('/user/test_user/saved')
      .query({ limit: 10, raw_json: 1 })
      .matchHeader('user-agent', /oauth-connector-sdk/)
      .reply(200, { kind: 'Listing', data: { children: [] } });

    const items = await sdk.fetch('reddit', testUserId, { type: 'saved', limit: 10 });

    expect(items).toHaveLength(0);
  });

  it('should handle Reddit rate limiting (60 req/min)', async () => {
    const authUrl = await sdk.connect('reddit', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://www.reddit.com').post('/api/v1/access_token').reply(200, {
      access_token: 'reddit_token',
      token_type: 'bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('reddit', testUserId, callbackParams);

    // Mock 429 response
    nock('https://oauth.reddit.com')
      .get('/api/v1/me')
      .reply(429, { message: 'Too Many Requests' }, { 'Retry-After': '1' });

    // Retry should succeed
    nock('https://oauth.reddit.com')
      .get('/api/v1/me')
      .reply(200, { name: 'test_user', id: 't2_123' });

    nock('https://oauth.reddit.com')
      .get('/user/test_user/saved')
      .query({ limit: 10, raw_json: 1 })
      .reply(200, { kind: 'Listing', data: { children: [] } });

    const items = await sdk.fetch('reddit', testUserId, { type: 'saved', limit: 10 });

    expect(items).toHaveLength(0);
  });
});
