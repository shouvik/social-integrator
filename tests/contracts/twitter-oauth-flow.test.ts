/**
 * Contract test: Twitter OAuth flow
 *
 * Tests Twitter-specific OAuth 2.0 requirements:
 * - OAuth 2.0 with PKCE
 * - Twitter API v2 endpoints
 * - Rate limiting handling
 * - Error scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { ConnectorSDK } from '../../src/sdk';

describe('Twitter OAuth Flow Contract', () => {
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
        twitter: {
          clientId: 'test-twitter-client',
          clientSecret: 'test-twitter-secret',
          authorizationEndpoint: 'https://twitter.com/i/oauth2/authorize',
          tokenEndpoint: 'https://api.twitter.com/2/oauth2/token',
          scopes: ['tweet.read', 'users.read', 'offline.access'],
          redirectUri: 'http://localhost:3000/callback/twitter',
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

  it('should generate authorization URL with PKCE', async () => {
    const authUrl = await sdk.connect('twitter', testUserId);

    expect(authUrl).toContain('https://twitter.com/i/oauth2/authorize');
    expect(authUrl).toContain('response_type=code');
    expect(authUrl).toContain('code_challenge'); // PKCE required
    expect(authUrl).toContain('code_challenge_method=S256');
    expect(authUrl).toContain('scope=tweet.read%20users.read%20offline.access');
  });

  it('should exchange code for tokens with refresh token', async () => {
    // Get auth URL and extract the real state
    const authUrl = await sdk.connect('twitter', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://api.twitter.com').post('/2/oauth2/token').reply(200, {
      access_token: 'twitter_access_token',
      refresh_token: 'twitter_refresh_token',
      token_type: 'bearer',
      expires_in: 7200,
      scope: 'tweet.read users.read offline.access',
    });

    // Use the actual state from the auth URL
    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('twitter', testUserId, callbackParams);

    // Mock timeline API call
    nock('https://api.twitter.com')
      .get('/2/users/me/timelines/reverse_chronological')
      .query(true) // Accept any query params
      .reply(200, {
        data: [
          {
            id: '1234567890',
            text: 'Test tweet content',
            author_id: '9876543210',
            created_at: '2025-01-15T10:30:00.000Z',
            public_metrics: {
              retweet_count: 5,
              reply_count: 2,
              like_count: 10,
              quote_count: 1,
            },
          },
        ],
        meta: {
          result_count: 1,
        },
      });

    const items = await sdk.fetch('twitter', testUserId, { type: 'timeline', maxResults: 25 });

    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('twitter');
    expect(items[0].bodyText).toContain('Test tweet content');
  });

  it('should fetch user timeline', async () => {
    const authUrl = await sdk.connect('twitter', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://api.twitter.com').post('/2/oauth2/token').reply(200, {
      access_token: 'twitter_token',
      token_type: 'bearer',
      expires_in: 7200,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('twitter', testUserId, callbackParams);

    nock('https://api.twitter.com')
      .get('/2/users/me/timelines/reverse_chronological')
      .query(true)
      .reply(200, {
        data: [
          {
            id: '1111',
            text: 'Tweet 1',
            author_id: '999',
            created_at: '2025-01-15T10:00:00.000Z',
          },
          {
            id: '2222',
            text: 'Tweet 2',
            author_id: '888',
            created_at: '2025-01-15T11:00:00.000Z',
          },
        ],
        meta: { result_count: 2 },
      });

    const items = await sdk.fetch('twitter', testUserId, { type: 'timeline', maxResults: 10 });

    expect(items).toHaveLength(2);
    expect(items[0].source).toBe('twitter');
  });

  it('should fetch user tweets with exclusions', async () => {
    const authUrl = await sdk.connect('twitter', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://api.twitter.com').post('/2/oauth2/token').reply(200, {
      access_token: 'twitter_token',
      token_type: 'bearer',
      expires_in: 7200,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('twitter', testUserId, callbackParams);

    nock('https://api.twitter.com')
      .get('/2/users/me/tweets')
      .query((query) => query.exclude === 'retweets,replies')
      .reply(200, {
        data: [
          {
            id: '3333',
            text: 'Original tweet',
            author_id: '777',
            created_at: '2025-01-15T12:00:00.000Z',
          },
        ],
        meta: { result_count: 1 },
      });

    const items = await sdk.fetch('twitter', testUserId, {
      type: 'tweets',
      excludeRetweets: true,
      excludeReplies: true,
    });

    expect(items).toHaveLength(1);
  });

  it('should search tweets', async () => {
    const authUrl = await sdk.connect('twitter', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://api.twitter.com').post('/2/oauth2/token').reply(200, {
      access_token: 'twitter_token',
      token_type: 'bearer',
      expires_in: 7200,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('twitter', testUserId, callbackParams);

    nock('https://api.twitter.com')
      .get('/2/tweets/search/recent')
      .query((query) => query.query === '#nodejs')
      .reply(200, {
        data: [
          {
            id: '4444',
            text: 'Loving #nodejs!',
            author_id: '666',
            created_at: '2025-01-15T13:00:00.000Z',
          },
        ],
        meta: { result_count: 1 },
      });

    const items = await sdk.fetch('twitter', testUserId, { type: 'search', query: '#nodejs' });

    expect(items).toHaveLength(1);
    expect(items[0].bodyText).toContain('#nodejs');
  });

  it('should handle rate limiting (429 response)', async () => {
    const authUrl = await sdk.connect('twitter', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://api.twitter.com').post('/2/oauth2/token').reply(200, {
      access_token: 'twitter_token',
      token_type: 'bearer',
      expires_in: 7200,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('twitter', testUserId, callbackParams);

    // Mock 429 response
    nock('https://api.twitter.com')
      .get('/2/users/me/timelines/reverse_chronological')
      .query(true)
      .reply(429, { title: 'Too Many Requests' }, { 'X-Rate-Limit-Reset': '1642252800' });

    // Retry should succeed
    nock('https://api.twitter.com')
      .get('/2/users/me/timelines/reverse_chronological')
      .query(true)
      .reply(200, {
        data: [
          {
            id: '5555',
            text: 'After retry',
            author_id: '555',
            created_at: '2025-01-15T14:00:00.000Z',
          },
        ],
        meta: { result_count: 1 },
      });

    const items = await sdk.fetch('twitter', testUserId, { type: 'timeline' });

    expect(items).toHaveLength(1);
  });

  it('should handle empty response', async () => {
    const authUrl = await sdk.connect('twitter', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://api.twitter.com').post('/2/oauth2/token').reply(200, {
      access_token: 'twitter_token',
      token_type: 'bearer',
      expires_in: 7200,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('twitter', testUserId, callbackParams);

    nock('https://api.twitter.com')
      .get('/2/users/me/timelines/reverse_chronological')
      .query(true)
      .reply(200, {
        data: [],
        meta: { result_count: 0 },
      });

    const items = await sdk.fetch('twitter', testUserId, { type: 'timeline' });

    expect(items).toHaveLength(0);
  });

  it('should handle API errors gracefully', async () => {
    const authUrl = await sdk.connect('twitter', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://api.twitter.com').post('/2/oauth2/token').reply(200, {
      access_token: 'twitter_token',
      token_type: 'bearer',
      expires_in: 7200,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('twitter', testUserId, callbackParams);

    // Mock API with errors but some data
    nock('https://api.twitter.com')
      .get('/2/users/me/timelines/reverse_chronological')
      .query(true)
      .reply(200, {
        data: [
          {
            id: '6666',
            text: 'Valid tweet',
            author_id: '444',
            created_at: '2025-01-15T15:00:00.000Z',
          },
        ],
        errors: [
          {
            title: 'Authorization Error',
            detail: 'Some tweets not accessible',
            type: 'https://api.twitter.com/2/problems/not-authorized-for-resource',
          },
        ],
        meta: { result_count: 1 },
      });

    const items = await sdk.fetch('twitter', testUserId, { type: 'timeline' });

    expect(items).toHaveLength(1);
  });

  it('should handle pagination', async () => {
    const authUrl = await sdk.connect('twitter', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://api.twitter.com').post('/2/oauth2/token').reply(200, {
      access_token: 'twitter_token',
      token_type: 'bearer',
      expires_in: 7200,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('twitter', testUserId, callbackParams);

    nock('https://api.twitter.com')
      .get('/2/users/me/timelines/reverse_chronological')
      .query((query) => query.pagination_token === 'next_page_token')
      .reply(200, {
        data: [
          {
            id: '7777',
            text: 'Next page tweet',
            author_id: '333',
            created_at: '2025-01-15T16:00:00.000Z',
          },
        ],
        meta: {
          result_count: 1,
          next_token: 'another_page_token',
        },
      });

    const items = await sdk.fetch('twitter', testUserId, {
      type: 'timeline',
      paginationToken: 'next_page_token',
    });

    expect(items).toHaveLength(1);
  });

  it('should throw error for search without query', async () => {
    const authUrl = await sdk.connect('twitter', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://api.twitter.com').post('/2/oauth2/token').reply(200, {
      access_token: 'twitter_token',
      token_type: 'bearer',
      expires_in: 7200,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('twitter', testUserId, callbackParams);

    await expect(sdk.fetch('twitter', testUserId, { type: 'search' })).rejects.toThrow(
      'Twitter search requires a query parameter'
    );
  });
});
