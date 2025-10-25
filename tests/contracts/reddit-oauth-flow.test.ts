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

  it('should fetch user comments', async () => {
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

    // Mock /api/v1/me to get username (required before user endpoints)
    nock('https://oauth.reddit.com')
      .get('/api/v1/me')
      .matchHeader('user-agent', /oauth-connector-sdk/)
      .reply(200, {
        name: 'test_user',
        id: 't2_123',
      });

    nock('https://oauth.reddit.com')
      .get('/user/test_user/comments')
      .query({ limit: 10, raw_json: 1 })
      .matchHeader('user-agent', /oauth-connector-sdk/)
      .reply(200, {
        kind: 'Listing',
        data: {
          children: [
            {
              kind: 't1',
              data: {
                id: 'comment1',
                body: 'Test comment',
                author: 'test_user',
                created_utc: 1705316400,
                subreddit: 'test',
              },
            },
          ],
          after: null,
        },
      });

    const items = await sdk.fetch('reddit', testUserId, { type: 'comments', limit: 10 });
    expect(items).toHaveLength(1);
  });

  it('should fetch submitted posts', async () => {
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

    // Mock /api/v1/me to get username (required before user endpoints)
    nock('https://oauth.reddit.com')
      .get('/api/v1/me')
      .matchHeader('user-agent', /oauth-connector-sdk/)
      .reply(200, {
        name: 'test_user',
        id: 't2_123',
      });

    nock('https://oauth.reddit.com')
      .get('/user/test_user/submitted')
      .query({ limit: 10, raw_json: 1 })
      .matchHeader('user-agent', /oauth-connector-sdk/)
      .reply(200, {
        kind: 'Listing',
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: 'submitted1',
                title: 'My submission',
                url: 'https://reddit.com/r/test',
                author: 'test_user',
                created_utc: 1705316400,
                subreddit: 'test',
              },
            },
          ],
          after: null,
        },
      });

    const items = await sdk.fetch('reddit', testUserId, { type: 'submitted', limit: 10 });
    expect(items).toHaveLength(1);
  });

  it('should handle pagination with after parameter', async () => {
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

    // Mock /api/v1/me to get username (required before user endpoints)
    nock('https://oauth.reddit.com')
      .get('/api/v1/me')
      .matchHeader('user-agent', /oauth-connector-sdk/)
      .reply(200, {
        name: 'test_user',
        id: 't2_123',
      });

    nock('https://oauth.reddit.com')
      .get('/user/test_user/saved')
      .query({ limit: 10, raw_json: 1, after: 't3_abc123' })
      .matchHeader('user-agent', /oauth-connector-sdk/)
      .reply(200, {
        kind: 'Listing',
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: 'next_page',
                title: 'Next page post',
                url: 'https://reddit.com/r/test',
                author: 'author',
                created_utc: 1705316400,
                subreddit: 'test',
              },
            },
          ],
          after: 't3_xyz789',
        },
      });

    const items = await sdk.fetch('reddit', testUserId, {
      type: 'saved',
      limit: 10,
      after: 't3_abc123',
    });
    expect(items).toHaveLength(1);
  });

  it('should fetch subreddit posts with sort and time parameters', async () => {
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

    // For subreddit fetching, no /api/v1/me call is needed
    nock('https://oauth.reddit.com')
      .get('/r/programming/top')
      .query({ limit: 25, raw_json: 1, t: 'week', sort: 'top' })
      .matchHeader('user-agent', /oauth-connector-sdk/)
      .reply(200, {
        kind: 'Listing',
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: 'subreddit1',
                title: 'Top post this week',
                url: 'https://reddit.com/r/programming',
                author: 'programmer1',
                created_utc: 1705316400,
                subreddit: 'programming',
              },
            },
          ],
          after: null,
        },
      });

    const items = await sdk.fetch('reddit', testUserId, {
      subreddit: 'programming',
      sort: 'top',
      time: 'week',
    });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Top post this week');
  });

  it('should fetch subreddit with controversial sort and time filter', async () => {
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

    nock('https://oauth.reddit.com')
      .get('/r/technology/controversial')
      .query({ limit: 25, raw_json: 1, t: 'month', sort: 'controversial' })
      .matchHeader('user-agent', /oauth-connector-sdk/)
      .reply(200, {
        kind: 'Listing',
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: 'controversial1',
                title: 'Controversial tech topic',
                url: 'https://reddit.com/r/technology',
                author: 'techuser',
                created_utc: 1705316400,
                subreddit: 'technology',
              },
            },
          ],
          after: null,
        },
      });

    const items = await sdk.fetch('reddit', testUserId, {
      subreddit: 'technology',
      sort: 'controversial',
      time: 'month',
    });
    expect(items).toHaveLength(1);
  });

  it('should handle pagination with before parameter', async () => {
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

    nock('https://oauth.reddit.com')
      .get('/api/v1/me')
      .matchHeader('user-agent', /oauth-connector-sdk/)
      .reply(200, {
        name: 'test_user',
        id: 't2_123',
      });

    nock('https://oauth.reddit.com')
      .get('/user/test_user/saved')
      .query({ limit: 25, raw_json: 1, before: 't3_xyz789' })
      .matchHeader('user-agent', /oauth-connector-sdk/)
      .reply(200, {
        kind: 'Listing',
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: 'before_page',
                title: 'Previous page post',
                url: 'https://reddit.com/r/test',
                author: 'author',
                created_utc: 1705316400,
                subreddit: 'test',
              },
            },
          ],
          after: null,
        },
      });

    const items = await sdk.fetch('reddit', testUserId, {
      type: 'saved',
      before: 't3_xyz789',
    });
    expect(items).toHaveLength(1);
  });
});
